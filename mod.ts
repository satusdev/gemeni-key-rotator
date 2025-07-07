// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.203.0/http/server.ts';

// --- Configuration ---
// Expect API keys in an environment variable (comma-separated or JSON array)
const KEY_ENV = Deno.env.get('API_KEYS') || '';
const API_KEYS: string[] = KEY_ENV.startsWith('[')
	? JSON.parse(KEY_ENV)
	: KEY_ENV.split(',')
			.map(k => k.trim())
			.filter(k => k);

// Base URL for the Google Gemini API (adjust if needed)
const DEFAULT_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const API_BASE_URL = Deno.env.get('GEMINI_API_BASE_URL') || DEFAULT_BASE;

// Optional: protect the edge function with a required header token (to prevent public abuse)
// const ACCESS_TOKEN = Deno.env.get('ACCESS_TOKEN'); // if set, incoming requests must have X-Access-Token header matching this

// Rotation state
let currentKeyIndex = 0;
interface KeyState {
	exhaustedUntil?: number;
}
const keyStates: KeyState[] = API_KEYS.map(() => ({}));

// Utility: get next active key index (skips keys marked exhausted)
function getNextKeyIndex(): number | null {
	const now = Date.now();
	for (let i = 0; i < API_KEYS.length; i++) {
		const idx = (currentKeyIndex + i) % API_KEYS.length;
		const state = keyStates[idx];
		if (!state.exhaustedUntil || state.exhaustedUntil < now) {
			// Use this key (either not exhausted or cooldown expired)
			currentKeyIndex = (idx + 1) % API_KEYS.length; // advance index for next time
			return idx;
		}
	}
	return null; // all keys exhausted currently
}

// Serve HTTP requests
serve(async (req: Request) => {
	try {
		// Optionally enforce access token
		// if (ACCESS_TOKEN) {
		// 	const provided = req.headers.get('X-Access-Token');
		// 	if (provided !== ACCESS_TOKEN) {
		// 		return new Response('Unauthorized', { status: 401 });
		// 	}
		// }

		// Determine target URL (combine base URL + request path + query, then add API key)
		const reqUrl = new URL(req.url);
		const targetUrl = new URL(reqUrl.pathname + reqUrl.search, API_BASE_URL);
		let keyIndex = getNextKeyIndex();
		if (keyIndex === null) {
			console.error('All API keys are exhausted – cannot fulfill request');
			return new Response(`All API keys exhausted (quota exceeded).`, {
				status: 429,
			});
		}
		let apiKey = API_KEYS[keyIndex];
		targetUrl.searchParams.set('key', apiKey);

		// Prepare headers for forwarding (copy all except hop-by-hop and restricted headers)
		const forwardHeaders = new Headers();
		for (const [h, v] of req.headers) {
			const lower = h.toLowerCase();
			if (['host', 'cookie', 'authorization'].includes(lower)) continue;
			forwardHeaders.set(h, v);
		}
		// Set content type if not already (to handle body passthrough correctly)
		if (
			!forwardHeaders.has('content-type') &&
			req.headers.has('content-type')
		) {
			forwardHeaders.set('content-type', req.headers.get('content-type')!);
		}

		// Forward the request to the Google API
		let response = await fetch(targetUrl.toString(), {
			method: req.method,
			headers: forwardHeaders,
			body: req.body,
		});

		// If response indicates quota issue, try other keys
		let attemptCount = 1;
		while (
			[401, 403, 429].includes(response.status) &&
			attemptCount < API_KEYS.length
		) {
			console.warn(
				`Key ${keyIndex} returned status ${response.status}. Switching API key...`
			);
			// Mark current key as exhausted (cooldown: e.g. 1 hour from now)
			keyStates[keyIndex] = { exhaustedUntil: Date.now() + 60 * 60 * 1000 };
			// Choose next key and retry
			keyIndex = getNextKeyIndex();
			if (keyIndex === null) break; // no available key
			apiKey = API_KEYS[keyIndex];
			targetUrl.searchParams.set('key', apiKey);
			attemptCount++;
			response = await fetch(targetUrl.toString(), {
				method: req.method,
				headers: forwardHeaders,
				body: req.body,
			});
		}

		if ([401, 403, 429].includes(response.status)) {
			// All keys exhausted or all attempts failed
			console.error(
				'All API keys exhausted or invalid. Returning error to client.'
			);
			// (Optional: trigger alert webhook or email here)
			return new Response(
				`Error: All API keys exhausted or invalid. (${response.status})`,
				{ status: 429 }
			);
		}

		// Forward the successful (or non-quota-error) response back to client
		// Copy response headers and status
		const resHeaders = new Headers(response.headers);
		// Allow CORS (if needed for web clients)
		resHeaders.set('Access-Control-Allow-Origin', '*');
		// Return response with original status and headers
		return new Response(response.body, {
			status: response.status,
			headers: resHeaders,
		});
	} catch (err: any) {
		console.error('Edge function error:', err);
		return new Response('Internal error in key rotator', { status: 500 });
	}
});
