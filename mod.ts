// deno-lint-ignore-file no-explicit-any
import { serve } from 'std/http/server.ts';

// --- Config ---
const GEMINI_KEYS = (Deno.env.get('GEMINI_KEYS') || '')
	.split(',')
	.map(k => k.trim())
	.filter(k => k);
const GEMINI_API_BASE_URL =
	Deno.env.get('GEMINI_API_BASE_URL') ||
	'https://generativelanguage.googleapis.com/v1beta';

const OPENROUTER_KEYS = (Deno.env.get('OPENROUTER_KEYS') || '')
	.split(',')
	.map(k => k.trim())
	.filter(k => k);
const OPENROUTER_API_BASE_URL =
	Deno.env.get('OPENROUTER_API_BASE_URL') || 'https://openrouter.ai/api/v1';

const ACCESS_TOKEN = Deno.env.get('ACCESS_TOKEN');

// --- State ---
let geminiIndex = 0;
let openrouterIndex = 0;

const geminiStates: { exhaustedUntil?: number }[] = GEMINI_KEYS.map(() => ({}));
const openrouterStates: { exhaustedUntil?: number }[] = OPENROUTER_KEYS.map(
	() => ({})
);

// --- Helper: Rotate keys ---
function getNextKey(
	pool: string[],
	states: { exhaustedUntil?: number }[],
	indexRef: { current: number }
): string | null {
	const now = Date.now();
	for (let i = 0; i < pool.length; i++) {
		const idx = (indexRef.current + i) % pool.length;
		if (!states[idx].exhaustedUntil || states[idx].exhaustedUntil! < now) {
			indexRef.current = (idx + 1) % pool.length;
			return pool[idx];
		}
	}
	return null;
}

// --- Request Handler ---
async function handler(req: Request): Promise<Response> {
	const reqUrl = new URL(req.url);

	if (ACCESS_TOKEN) {
		const token = req.headers.get('X-Access-Token');
		if (token !== ACCESS_TOKEN) {
			return new Response('Unauthorized', { status: 401 });
		}
	}

	let keys: string[] = [];
	let states: { exhaustedUntil?: number }[] = [];
	let indexRef: { current: number };
	let baseUrl = '';

	if (reqUrl.pathname.startsWith('/v1beta')) {
		// Gemini
		keys = GEMINI_KEYS;
		states = geminiStates;
		indexRef = { current: geminiIndex };
		baseUrl = GEMINI_API_BASE_URL;
	} else if (
		reqUrl.pathname.startsWith('/chat/completions') ||
		reqUrl.pathname.startsWith('/openai')
	) {
		// OpenRouter
		keys = OPENROUTER_KEYS;
		states = openrouterStates;
		indexRef = { current: openrouterIndex };
		baseUrl = OPENROUTER_API_BASE_URL;
	} else {
		return new Response(`Unknown provider path: ${reqUrl.pathname}`, {
			status: 404,
		});
	}

	if (keys.length === 0) {
		return new Response('No API keys configured.', { status: 500 });
	}

	let attempt = 0;
	let response: Response | null = null;

	while (attempt < keys.length) {
		const apiKey = getNextKey(keys, states, indexRef);
		if (!apiKey) {
			return new Response('All API keys exhausted.', { status: 429 });
		}

		// Build target URL
		const targetUrl = new URL(reqUrl.pathname + reqUrl.search, baseUrl);
		if (baseUrl.includes('generativelanguage')) {
			// Gemini wants the key as query param
			targetUrl.searchParams.set('key', apiKey);
		}

		// Forward headers
		const forwardHeaders = new Headers();
		for (const [k, v] of req.headers) {
			if (['host', 'cookie', 'authorization'].includes(k.toLowerCase()))
				continue;
			forwardHeaders.set(k, v);
		}

		// Set authorization header for OpenRouter
		if (baseUrl.includes('openrouter')) {
			forwardHeaders.set('Authorization', `Bearer ${apiKey}`);
		}

		// Make request
		response = await fetch(targetUrl.toString(), {
			method: req.method,
			headers: forwardHeaders,
			body: req.body,
		});

		// Success → break
		if (![401, 403, 429, 500, 502, 503].includes(response.status)) {
			break;
		}

		console.warn(
			`API key attempt failed (status ${response.status}). Rotating key.`
		);
		states[indexRef.current] = {
			exhaustedUntil: Date.now() + 60 * 60 * 1000,
		};

		attempt++;
	}

	if (!response) {
		return new Response('All API keys failed.', { status: 500 });
	}

	// Copy headers and enable CORS
	const resHeaders = new Headers(response.headers);
	resHeaders.set('Access-Control-Allow-Origin', '*');

	return new Response(response.body, {
		status: response.status,
		headers: resHeaders,
	});
}

// --- Start Server ---
serve(handler);
