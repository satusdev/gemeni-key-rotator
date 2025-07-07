// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.203.0/http/server.ts';

// --- Configuration ---
const GEMINI_KEYS =
	Deno.env
		.get('GEMINI_KEYS')
		?.split(',')
		.map(k => k.trim())
		.filter(Boolean) ?? [];
const OPENAI_KEYS =
	Deno.env
		.get('OPENAI_KEYS')
		?.split(',')
		.map(k => k.trim())
		.filter(Boolean) ?? [];
const ANTHROPIC_KEYS =
	Deno.env
		.get('ANTHROPIC_KEYS')
		?.split(',')
		.map(k => k.trim())
		.filter(Boolean) ?? [];

// Combine into pool
type Provider = 'gemini' | 'openai' | 'anthropic';
interface KeyEntry {
	provider: Provider;
	key: string;
}
const API_POOL: KeyEntry[] = [
	...GEMINI_KEYS.map(k => ({ provider: 'gemini', key: k })),
	...OPENAI_KEYS.map(k => ({ provider: 'openai', key: k })),
	...ANTHROPIC_KEYS.map(k => ({ provider: 'anthropic', key: k })),
];

const ACCESS_TOKEN = Deno.env.get('ACCESS_TOKEN');
let currentIndex = 0;
interface KeyState {
	exhaustedUntil?: number;
}
const keyStates: KeyState[] = API_POOL.map(() => ({}));

function getNextKeyIndex(): number | null {
	const now = Date.now();
	for (let i = 0; i < API_POOL.length; i++) {
		const idx = (currentIndex + i) % API_POOL.length;
		const state = keyStates[idx];
		if (!state.exhaustedUntil || state.exhaustedUntil < now) {
			currentIndex = (idx + 1) % API_POOL.length;
			return idx;
		}
	}
	return null;
}

serve(async (req: Request) => {
	try {
		if (ACCESS_TOKEN) {
			const provided = req.headers.get('X-Access-Token');
			if (provided !== ACCESS_TOKEN) {
				return new Response('Unauthorized', { status: 401 });
			}
		}

		const url = new URL(req.url);
		const rawPath = url.pathname + url.search;
		let provider: Provider;
		let forwardPath = rawPath;

		// Determine provider by path prefix
		if (rawPath.startsWith('/anthropic/')) {
			provider = 'anthropic';
		} else if (rawPath.startsWith('/openai/')) {
			provider = 'openai';
		} else if (rawPath.startsWith('/v1beta2/')) {
			provider = 'gemini';
		} else if (rawPath.startsWith('/v1/')) {
			// treat generic /v1/ as OpenAI
			provider = 'openai';
		} else {
			// default to Gemini for other paths
			provider = 'gemini';
		}

		// Strip known prefixes for OpenAI/Anthropic
		if (provider === 'openai' && rawPath.startsWith('/openai/')) {
			forwardPath = rawPath.slice('/openai'.length);
		}
		if (provider === 'anthropic' && rawPath.startsWith('/anthropic/')) {
			forwardPath = rawPath.slice('/anthropic'.length);
		}

		const keyIndex = getNextKeyIndex();
		if (keyIndex === null) {
			return new Response('All API keys exhausted.', { status: 429 });
		}
		const entry = API_POOL[keyIndex];

		// Prepare headers
		const headers = new Headers();
		for (const [h, v] of req.headers) {
			const low = h.toLowerCase();
			if (['host', 'cookie', 'authorization'].includes(low)) continue;
			headers.set(h, v);
		}
		if (req.headers.has('content-type')) {
			headers.set('content-type', req.headers.get('content-type')!);
		}

		// Construct upstream URL and auth
		let upstreamUrl: string;
		switch (provider) {
			case 'gemini': {
				const gemBase =
					Deno.env.get('GEMINI_API_BASE_URL') ||
					'https://generativelanguage.googleapis.com/v1beta2';
				const u = new URL(gemBase + forwardPath);
				u.searchParams.set('key', entry.key);
				upstreamUrl = u.toString();
				break;
			}
			case 'openai': {
				upstreamUrl = `https://api.openai.com${forwardPath}`;
				headers.set('Authorization', `Bearer ${entry.key}`);
				break;
			}
			case 'anthropic': {
				upstreamUrl = `https://api.anthropic.com${forwardPath}`;
				headers.set('x-api-key', entry.key);
				break;
			}
		}

		// Forward request
		let res = await fetch(upstreamUrl, {
			method: req.method,
			headers,
			body: req.body,
		});
		let attempts = 1;
		while ([401, 403, 429].includes(res.status) && attempts < API_POOL.length) {
			// Cooldown the exhausted key
			keyStates[keyIndex] = { exhaustedUntil: Date.now() + 60 * 60 * 1000 };
			const nextIndex = getNextKeyIndex();
			if (nextIndex === null) break;
			const nextEntry = API_POOL[nextIndex];
			// Update auth for next
			switch (nextEntry.provider) {
				case 'gemini': {
					const u = new URL(upstreamUrl);
					u.searchParams.set('key', nextEntry.key);
					upstreamUrl = u.toString();
					break;
				}
				case 'openai':
					headers.set('Authorization', `Bearer ${nextEntry.key}`);
					break;
				case 'anthropic':
					headers.set('x-api-key', nextEntry.key);
					break;
			}
			attempts++;
			res = await fetch(upstreamUrl, {
				method: req.method,
				headers,
				body: req.body,
			});
		}

		if ([401, 403, 429].includes(res.status)) {
			return new Response(`Error: upstream ${res.status}`, { status: 429 });
		}

		// Return response with CORS
		const respHeaders = new Headers(res.headers);
		respHeaders.set('Access-Control-Allow-Origin', '*');
		return new Response(res.body, { status: res.status, headers: respHeaders });
	} catch (err: any) {
		console.error('Error in edge function:', err);
		return new Response('Internal Server Error', { status: 500 });
	}
});
