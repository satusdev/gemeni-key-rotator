// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.203.0/http/server.ts';
import 'https://deno.land/x/dotenv@v3.2.2/load.ts';

// --- Configuration ---
const API_KEYS =
	Deno.env
		.get('API_KEYS')
		?.split(',')
		.map(k => k.trim())
		.filter(Boolean) ?? [];
const OPENROUTER_KEYS =
	Deno.env
		.get('OPENROUTER_KEYS')
		?.split(',')
		.map(k => k.trim())
		.filter(Boolean) ?? [];

const GEMINI_BASE =
	Deno.env.get('GEMINI_API_BASE_URL') ||
	'https://generativelanguage.googleapis.com/v1beta';
const OPENROUTER_BASE =
	Deno.env.get('OPENROUTER_API_BASE_URL') || 'https://openrouter.ai/v1';

const ACCESS_TOKEN = Deno.env.get('ACCESS_TOKEN');

// --- State ---
let currentIndex = 0;
interface KeyState {
	exhaustedUntil?: number;
}
const pool: { provider: 'gemini' | 'openrouter'; key: string }[] = [
	...API_KEYS.map(k => ({ provider: 'gemini', key: k })),
	...OPENROUTER_KEYS.map(k => ({ provider: 'openrouter', key: k })),
];
const states: KeyState[] = pool.map(() => ({}));

function nextIndex(): number | null {
	const now = Date.now();
	for (let i = 0; i < pool.length; i++) {
		const idx = (currentIndex + i) % pool.length;
		if (!states[idx].exhaustedUntil || states[idx].exhaustedUntil! < now) {
			currentIndex = (idx + 1) % pool.length;
			return idx;
		}
	}
	return null;
}

function getUpstream(req: Request, entry: { provider: string; key: string }) {
	const url = new URL(req.url);
	const path = url.pathname + url.search;
	const headers = new Headers(req.headers);
	headers.delete('host');
	headers.delete('cookie');
	headers.delete('authorization');

	if (entry.provider === 'gemini') {
		const u = new URL(GEMINI_BASE + path);
		u.searchParams.set('key', entry.key);
		return { url: u.toString(), headers };
	} else {
		// openrouter
		const u = new URL(OPENROUTER_BASE + '/chat/completions');
		headers.set('Authorization', `Bearer ${entry.key}`);
		return { url: u.toString(), headers };
	}
}

async function handler(req: Request): Promise<Response> {
	if (ACCESS_TOKEN && req.headers.get('X-Access-Token') !== ACCESS_TOKEN) {
		return new Response('Unauthorized', { status: 401 });
	}

	let idx = nextIndex();
	if (idx === null) return new Response('All keys exhausted', { status: 429 });

	let attempts = 0;
	while (attempts < pool.length) {
		const entry = pool[idx];
		const { url, headers } = getUpstream(req, entry);
		let res: Response;
		try {
			res = await fetch(url, { method: req.method, headers, body: req.body });
		} catch (e) {
			console.warn(`Fetch error for provider ${entry.provider}:`, e);
			states[idx].exhaustedUntil = Date.now() + 60 * 1000; // 1m cooldown
			idx = nextIndex();
			if (idx === null) break;
			attempts++;
			continue;
		}

		// Retry on 401, 403, 429, 500, 502, 503
		if (![401, 403, 429, 500, 502, 503].includes(res.status)) {
			const respHeaders = new Headers(res.headers);
			respHeaders.set('Access-Control-Allow-Origin', '*');
			return new Response(res.body, {
				status: res.status,
				headers: respHeaders,
			});
		}

		console.warn(
			`Provider ${entry.provider} key failed with status ${res.status}`
		);
		states[idx].exhaustedUntil = Date.now() + 60 * 60 * 1000; // 1h cooldown
		idx = nextIndex();
		if (idx === null) break;
		attempts++;
	}

	return new Response('All providers failed', { status: 502 });
}

console.log('Starting key-rotator proxy...');
serve(handler);
