// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.203.0/http/server.ts';
import 'https://deno.land/x/dotenv@v3.2.2/load.ts';

/*
Usage Example:

1. Set your API keys in an .env file (or environment variables):
   API_KEYS=your_key_1,your_key_2

2. Run the server:
   deno run --allow-net --allow-env mod.ts

3. Make a request using curl:
   curl -X POST "http://localhost:8000/v1beta/models/gemini-2.5-pro:generateContent" \
        -H "Content-Type: application/json" \
        -d '{
              "contents": [{
                "parts":[{
                  "text": "Write a story about a magic backpack."
                }]
              }]
            }'
*/

// ─── Configuration ─────────────────────────
const API_KEYS = (Deno.env.get('API_KEYS') || '')
	.split(',')
	.map(k => k.trim())
	.filter(Boolean);

const GEMINI_BASE =
	Deno.env.get('GEMINI_API_BASE_URL') ||
	'https://generativelanguage.googleapis.com';

const MAX_RETRIES = 3;

// Cooldown times per status
const COOLDOWNS: Record<number | string, number> = {
	429: 5 * 60 * 1000, // 5 minutes for rate limit
	500: 1 * 60 * 1000, // 1 minute for server errors
	502: 1 * 60 * 1000,
	503: 1 * 60 * 1000,
	504: 1 * 60 * 1000,
	default: 10 * 1000, // 10 seconds for other issues
};

// ─── Rate Limiting (per IP) ────────────────
const LIMIT_WINDOW = 60 * 1000; // 1 minute
const LIMIT_COUNT = 60; // 60 requests per minute
const ipLogs = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
	const now = Date.now();
	const times = ipLogs.get(ip) || [];
	const recent = times.filter(t => now - t < LIMIT_WINDOW);
	recent.push(now);
	ipLogs.set(ip, recent);
	return recent.length > LIMIT_COUNT;
}

// ─── Persistent State ──────────────────────
interface State {
	exhausted: number[];
	usage: number[];
}
let state: State = {
	exhausted: Array(API_KEYS.length).fill(0),
	usage: Array(API_KEYS.length).fill(0),
};

// ─── Key Selection ─────────────────────────
function getNextAvailableKeyIndex(): number | null {
	const now = Date.now();
	const available = state.exhausted
		.map((timestamp, index) => ({ timestamp, index }))
		.filter(item => item.timestamp < now)
		.map(item => item.index);

	if (available.length === 0) return null;

	// Find the key with the minimum usage among available keys
	const bestKey = available.reduce(
		(prev, curr) => (state.usage[curr] < state.usage[prev] ? curr : prev),
		available[0]
	);
	return bestKey;
}

function cooldownKey(index: number, status: number) {
	const cooldownMs = COOLDOWNS[status] ?? COOLDOWNS.default;
	state.exhausted[index] = Date.now() + cooldownMs;
	console.log(
		`[COOLDOWN] Key index ${index} cooled down for ${
			cooldownMs / 1000
		}s due to status ${status}`
	);
}

// ─── Request Handler ───────────────────────
async function handler(req: Request): Promise<Response> {
	const ip = req.headers.get('x-forwarded-for') || 'unknown';
	console.log(`\n[REQUEST] Incoming from ${ip} to ${req.url}`);

	if (isRateLimited(ip)) {
		console.warn(`[RATE LIMIT] IP ${ip} has been rate limited.`);
		return new Response(
			JSON.stringify({ error: { message: 'Rate limit exceeded' } }),
			{
				status: 429,
				headers: { 'Content-Type': 'application/json' },
			}
		);
	}

	const body = await req.arrayBuffer();

	for (let i = 0; i < MAX_RETRIES; i++) {
		const keyIndex = getNextAvailableKeyIndex();
		if (keyIndex === null) {
			console.warn('[KEYS] All API keys are currently exhausted.');
			return new Response(
				JSON.stringify({
					error: { message: 'All API keys are currently exhausted' },
				}),
				{
					status: 429,
					headers: { 'Content-Type': 'application/json' },
				}
			);
		}

		const apiKey = API_KEYS[keyIndex];
		const url = new URL(req.url);
		const targetUrl = new URL(url.pathname + url.search, GEMINI_BASE);
		targetUrl.searchParams.set('key', apiKey);

		console.log(
			`[PROXY ATTEMPT ${
				i + 1
			}/${MAX_RETRIES}] Using key index ${keyIndex}. Target URL: ${targetUrl}`
		);

		const headersToForward = new Headers({
			'Content-Type': req.headers.get('Content-Type') || 'application/json',
			'x-goog-api-key': apiKey,
		});

		try {
			const res = await fetch(targetUrl.toString(), {
				method: req.method,
				headers: headersToForward,
				body: body,
			});

			console.log(`[RESPONSE] Upstream status: ${res.status}`);
			state.usage[keyIndex]++;

			if (res.ok) {
				const responseHeaders = new Headers(res.headers);
				responseHeaders.set('Access-Control-Allow-Origin', '*');
				return new Response(res.body, {
					status: res.status,
					headers: responseHeaders,
				});
			}

			cooldownKey(keyIndex, res.status);
			const errorBody = await res.text();
			console.error(
				`[ERROR] Upstream error: ${res.status} ${res.statusText}. Body: ${errorBody}`
			);

			if (res.status === 429 || res.status >= 500) {
				console.log(`[RETRY] Retrying due to status ${res.status}...`);
				continue;
			}

			return new Response(errorBody, {
				status: res.status,
				headers: { 'Content-Type': 'application/json' },
			});
		} catch (e) {
			console.error(`[FATAL ATTEMPT ${i + 1}] Fetch failed:`, e);
			cooldownKey(keyIndex, 500);
		}
	}

	return new Response(
		JSON.stringify({
			error: { message: `Upstream fetch failed after ${MAX_RETRIES} retries` },
		}),
		{
			status: 502, // Bad Gateway
			headers: { 'Content-Type': 'application/json' },
		}
	);
}

// ─── Start Server ──────────────────────────
if (API_KEYS.length === 0) {
	console.error(
		'No API_KEYS found. Please set them in your .env file or as an environment variable.'
	);
	Deno.exit(1);
}

console.log(`Starting Gemini proxy with ${API_KEYS.length} key(s).`);
serve(handler, { port: 8000 });
