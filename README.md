# Google Gemini API Key Rotator

This project provides a lightweight, Deno-based server that acts as a proxy to
the Google Gemini API. It intelligently rotates a pool of API keys to help
manage rate limits and prevent service interruptions.

## Features

- **API Key Rotation:** Automatically cycles through a list of API keys to
  distribute requests and avoid hitting quota limits on a single key.
- **Error Handling:** Detects when a key is exhausted (e.g.,
  `429 Too Many Requests`) and automatically retries with the next available
  key.
- **Environment-Based Configuration:** Uses a `.env` file for easy and secure
  management of API keys and other settings.
- **Access Control:** Optional access token validation to protect your proxy
  from unauthorized use.
- **Centralized Dependencies:** Manages Deno dependencies through `deno.json`
  for better version control.

## Setup and Configuration

1.  **Prerequisites:**

    - [Deno](https://deno.land/) installed on your system.

2.  **Clone the repository:**

    ```bash
    git clone https://github.com/nadbad/cline-key-rotator.git
    cd cline-key-rotator
    ```

3.  **Create a `.env` file:** Create a file named `.env` in the root of the
    project and add the following environment variables:

    ```env
    # Comma-separated list of your Google Gemini API keys
    API_KEYS=YOUR_API_KEY_1,YOUR_API_KEY_2,YOUR_API_KEY_3

    # (Optional) Override the default Gemini API base URL
    # GEMINI_API_BASE_URL=https://generativelanguage.googleapis.com/v1beta

    # (Optional) Set a secret token to protect your proxy endpoint
    # ACCESS_TOKEN=your-secret-access-token
    ```

## Usage

To start the server, run the following command from the project root:

```bash
deno task start
```

The server will start on the default port (usually `8000`).

## API

Make requests to your Deno server as if you were calling the Google Gemini API
directly. The server will forward your request with a valid API key.

**Example using `curl`:**

```bash
curl -X POST "http://localhost:8000/v1beta/models/gemini-pro:generateContent" \
-H "Content-Type: application/json" \
-d '{
  "contents": [{
    "parts":[{
      "text": "Explain how the self-attention mechanism works in a transformer model."
    }]
  }]
}'
```

If you have set an `ACCESS_TOKEN` in your `.env` file, you must include it in
the `X-Access-Token` header:

```bash
curl -X POST "http://localhost:8000/v1beta/models/gemini-pro:generateContent" \
-H "Content-Type: application/json" \
-H "X-Access-Token: your-secret-access-token" \
-d '{
  "contents": [{
    "parts":[{
      "text": "Explain how the self-attention mechanism works in a transformer model."
    }]
  }]
}'
```
