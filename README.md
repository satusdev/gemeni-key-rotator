# CLine Key Rotator Proxy

A Deno Edge Function that round‑robins across multiple API keys and providers
(Google Gemini, OpenAI, Anthropic). Deploy to Deno Deploy and point your CLine
(or other) client at the single endpoint.

## Features

- Automatic rotation and cooldown of exhausted keys
- Multi‑provider support:
  - **gemini** (default path)
  - **openai** (`/openai/...` prefix)
  - **anthropic** (`/anthropic/...` prefix)
- Optional header‑based access token to secure your proxy
- CORS allowed by default

## Setup

1. **Clone this repo**

   ```bash
   git clone https://github.com/<your‑username>/cline-rotator.git
   cd cline-rotator
   ```

2. **Create a `deno.json`** in root (for local dev):

   ```json
   {
   	"compilerOptions": {
   		"lib": ["deno.ns", "deno.web"],
   		"strict": true
   	},
   	"tasks": {
   		"start": "deno run --allow-env --allow-net mod.ts"
   	}
   }
   ```

3. **Configure your keys in Deno Deploy** (or locally via `.env`):

   - `GEMINI_KEYS`: comma‑separated Google Gemini API keys
   - `OPENAI_KEYS`: comma‑separated OpenAI API keys
   - `ANTHROPIC_KEYS`: comma‑separated Anthropic API keys
   - (Optional) `ACCESS_TOKEN`: secret token to guard access

4. **Deploy to Deno Deploy**

   - In Deno dashboard, import this repo
   - Add the above environment variables
   - Deploy and copy the production URL

5. **Point CLine to your proxy**

   - In VS Code CLine settings → **Provider Base URL**, set:
     `text https://<your‑project>.deno.dev `
   - Leave API key blank in CLine (proxy handles it)

6. **Usage**
   - For Gemini (default): use CLine as usual
   - For OpenAI: prefix endpoints with `/openai`, e.g.
     `/openai/v1/chat/completions`
   - For Anthropic: prefix with `/anthropic/v1/complete`

Enjoy uninterrupted coding!
