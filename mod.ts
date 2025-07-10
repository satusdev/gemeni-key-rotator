// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.203.0/http/server.ts';
import { existsSync } from 'https://deno.land/std@0.203.0/fs/mod.ts';

// ─── Configuration ─────────────────────────
const API_KEYS = (Deno.env.get('API_KEYS') || '')
	.split(',')
	.map(k => k.trim())
	.filter(Boolean);

const GEMINI_BASE =
	Deno.env.get('GEMINI_API_BASE_URL') ||
	'https://generativelanguage.googleapis.com/v1beta';
const ACCESS_TOKEN = Deno.env.get('ACCESS_TOKEN');

// Cooldown times per status
const COOLDOWNS: Record<number | string, number> = {
	429: 5 * 60 * 1000,
	500: 1 * 60 * 1000,
	default: 10 * 1000,
};

// ─── Rate Limiting ─────────────────────────
const LIMIT_WINDOW = 60 * 1000;
const LIMIT_COUNT = 60;
const ipLogs = new Map<string, number[]>();

function tooManyRequests(ip: string): boolean {
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
function nextKey(): number | null {
	const now = Date.now();
	const available = state.exhausted
		.map((t, i) => ({ t, i }))
		.filter(x => x.t < now)
		.map(x => x.i);
	if (available.length === 0) return null;
	const idx = available[Math.floor(Math.random() * available.length)];
	return idx;
}

async function cooldownKey(idx: number, status: number) {
	const ms = COOLDOWNS[status as number] ?? COOLDOWNS.default;
	state.exhausted![idx] = Date.now() + ms;
}

// ─── Request Handler ───────────────────────
function logWithTimestamp(...args: unknown[]) {
	console.log(new Date().toISOString(), ...args);
}
function warnWithTimestamp(...args: unknown[]) {
	console.warn(new Date().toISOString(), ...args);
}
function errorWithTimestamp(...args: unknown[]) {
	console.error(new Date().toISOString(), ...args);
}

async function handler(req: Request, retryCount = 0): Promise<Response> {
	const ip = req.headers.get('x-forwarded-for') || 'unknown';
	const MAX_RETRIES = 3;

	logWithTimestamp('Incoming request', {
		method: req.method,
		url: req.url,
		headers: Object.fromEntries(req.headers),
		ip,
		retryCount,
	});

	if (tooManyRequests(ip)) {
		warnWithTimestamp(`Rate limit exceeded for IP: ${ip}`);
		return new Response(
			JSON.stringify({
				error: { message: 'Rate limit exceeded', status: 429 },
			}),
			{
				status: 429,
				headers: {
					'Content-Type': 'application/json',
					'Access-Control-Allow-Origin': '*',
				},
			}
		);
	}

	if (tooManyRequests(ip)) {
		return new Response(
			JSON.stringify({
				error: { message: 'Rate limit exceeded', status: 429 },
			}),
			{
				status: 429,
				headers: {
					'Content-Type': 'application/json',
					'Access-Control-Allow-Origin': '*',
				},
			}
		);
	}

	if (ACCESS_TOKEN && req.headers.get('X-Access-Token') !== ACCESS_TOKEN) {
		warnWithTimestamp(`Unauthorized access attempt from IP: ${ip}`);
		return new Response(
			JSON.stringify({
				error: { message: 'Unauthorized', status: 401 },
			}),
			{
				status: 401,
				headers: {
					'Content-Type': 'application/json',
					'Access-Control-Allow-Origin': '*',
				},
			}
		);
	}

	const idx = nextKey();
	if (idx === null) {
		warnWithTimestamp('All API keys exhausted for request from IP:', ip);
		return new Response(
			JSON.stringify({
				error: { message: 'All API keys exhausted', status: 429 },
			}),
			{
				status: 429,
				headers: {
					'Content-Type': 'application/json',
					'Access-Control-Allow-Origin': '*',
				},
			}
		);
	}

	const apiKey = API_KEYS[idx];
	logWithTimestamp(`Using API key index: ${idx} for IP: ${ip}`);
	const url = new URL(req.url);
	const target = new URL(url.pathname + url.search, GEMINI_BASE);
	target.searchParams.set('key', apiKey);

	logWithTimestamp('Upstream request', {
		url: target.toString(),
		method: req.method,
		headers: Object.fromEntries(req.headers),
		body: req.body ? '[stream/body present]' : null,
	});

	const fwd = new Headers();
	for (const [k, v] of req.headers) {
		if (!['host', 'cookie', 'authorization'].includes(k.toLowerCase())) {
			fwd.set(k, v);
		}
	}

	let res: Response;
	try {
		res = await fetch(target.toString(), {
			method: req.method,
			headers: fwd,
			body: req.body,
		});
	} catch (e) {
		errorWithTimestamp('Upstream fetch failed:', e, e?.stack);
		cooldownKey(idx, 500);
		return new Response(
			JSON.stringify({
				error: { message: 'Upstream fetch failed', status: 500 },
			}),
			{
				status: 500,
				headers: {
					'Content-Type': 'application/json',
					'Access-Control-Allow-Origin': '*',
				},
			}
		);
	}

	state.usage![idx]++;

	logWithTimestamp('Upstream response', {
		status: res.status,
		headers: Object.fromEntries(res.headers),
	});

	if ([401, 403, 429, 500].includes(res.status)) {
		warnWithTimestamp(
			`Received status ${res.status} from upstream. Retry count: ${retryCount}`
		);
		let errorBody = '';
		try {
			errorBody = await res.clone().text();
		} catch (_) {}
		warnWithTimestamp('Upstream error response body:', errorBody);

		cooldownKey(idx, res.status);
		if (retryCount < MAX_RETRIES) {
			return handler(req, retryCount + 1);
		} else {
			errorWithTimestamp(`Max retries reached for request from IP: ${ip}`);
			return new Response(
				JSON.stringify({
					error: {
						message: 'Upstream fetch failed after retries',
						status: 500,
						upstreamStatus: res.status,
						upstreamBody: errorBody,
					},
				}),
				{
					status: 500,
					headers: {
						'Content-Type': 'application/json',
						'Access-Control-Allow-Origin': '*',
					},
				}
			);
		}
	}

	const h = new Headers(res.headers);
	h.set('Access-Control-Allow-Origin', '*');
	return new Response(res.body, { status: res.status, headers: h });
}

// ─── Start Server ──────────────────────────
logWithTimestamp('Starting Gemini proxy with', API_KEYS.length, 'keys');
serve(handler);
