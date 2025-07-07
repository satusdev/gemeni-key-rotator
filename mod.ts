// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.203.0/http/server.ts';

// --- Configuration ---
// Load and split keys per provider from environment variables
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

// Build a unified pool with tags
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

// Optional access guard header
const ACCESS_TOKEN = Deno.env.get('ACCESS_TOKEN');

// Rotation state
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

// Serve incoming requests
serve(async (req: Request) => {
	try {
		// Access control
		if (ACCESS_TOKEN) {
			const provided = req.headers.get('X-Access-Token');
			if (provided !== ACCESS_TOKEN) {
				return new Response('Unauthorized', { status: 401 });
			}
		}

		// Determine provider by URL prefix
		const url = new URL(req.url);
		const parts = url.pathname.split('/').filter(Boolean);
		let provider: Provider = 'gemini';
		let path = url.pathname;

		if (parts[0] === 'openai' || parts[0] === 'anthropic') {
			provider = parts[0] as Provider;
			// strip the prefix for upstream
			parts.shift();
			path = '/' + parts.join('/') + url.search;
		} else {
			// default to gemini paths
			path = url.pathname + url.search;
		}

		// Pick a key
		let idx = getNextKeyIndex();
		if (idx === null) {
			return new Response('All API keys exhausted.', { status: 429 });
		}
		const entry = API_POOL[idx];

		// Construct upstream request
		let upstreamUrl: string;
		const headers = new Headers();
		// Forward client headers except restricted
		for (const [h, v] of req.headers) {
			const low = h.toLowerCase();
			if (['host', 'cookie', 'authorization'].includes(low)) continue;
			headers.set(h, v);
		}
		if (req.headers.has('content-type')) {
			headers.set('content-type', req.headers.get('content-type')!);
		}

		// Set provider-specific URL and auth
		switch (provider) {
			case 'gemini':
				const gemBase =
					Deno.env.get('GEMINI_API_BASE_URL') ||
					'https://generativelanguage.googleapis.com/v1beta2';
				upstreamUrl = `${gemBase}${path}`;
				// inject key as param
				const gUrl = new URL(upstreamUrl);
				gUrl.searchParams.set('key', entry.key);
				upstreamUrl = gUrl.toString();
				break;

			case 'openai':
				upstreamUrl = `https://api.openai.com${path}`;
				headers.set('Authorization', `Bearer ${entry.key}`);
				break;

			case 'anthropic':
				upstreamUrl = `https://api.anthropic.com${path}`;
				headers.set('x-api-key', entry.key);
				break;
		}

		// Forward request
		let res = await fetch(upstreamUrl, {
			method: req.method,
			headers,
			body: req.body,
		});

		// Retry on quota errors
		let attempts = 1;
		while ([401, 403, 429].includes(res.status) && attempts < API_POOL.length) {
			keyStates[idx] = { exhaustedUntil: Date.now() + 60 * 60 * 1000 }; // 1h cooldown
			idx = getNextKeyIndex()!;
			const nextEntry = API_POOL[idx];
			// update auth for next
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

		// Return response
		const respHeaders = new Headers(res.headers);
		respHeaders.set('Access-Control-Allow-Origin', '*');
		return new Response(res.body, { status: res.status, headers: respHeaders });
	} catch (err: any) {
		console.error('Error in edge function:', err);
		return new Response('Internal Server Error', { status: 500 });
	}
});
