# Gemini API Key Rotator

This project provides a lightweight, Deno-based server that acts as a proxy to
the Google Gemini API. It intelligently rotates a pool of API keys to help
manage rate limits and prevent service interruptions.

## Features

- **API Key Rotation**: Automatically rotates through a list of API keys to
  distribute requests.
- **Rate Limiting**: Basic IP-based rate limiting to prevent abuse.
- **Cooldowns**: When an API key hits a rate limit (429) or encounters a server
  error (500), it's put on a cooldown to prevent further issues.
- **Retries**: Automatically retries requests that fail with a 500 error, up to
  a configurable limit.
- **Access Control**: Optional access token to secure the proxy.
- **Detailed Logging**: Comprehensive logging for easy debugging.

## Setup and Usage

1.  **Clone the repository**:

    ```bash
    git clone https://github.com/nadbad/cline-key-rotator.git
    cd cline-key-rotator
    ```

2.  **Install Deno**: Follow the instructions on the
    [Deno website](https://deno.land/#installation).

3.  **Set Environment Variables**: Create a `.env` file in the root of the
    project with the following variables:

    ```
    API_KEYS=your_api_key_1,your_api_key_2,your_api_key_3
    GEMINI_API_BASE_URL=https://generativelanguage.googleapis.com/v1beta
    ACCESS_TOKEN=your_secret_access_token # Optional
    ```

4.  **Run the server**:

    ```bash
    deno run --allow-env --allow-net --allow-read mod.ts
    ```

    The server will start on port 8000.

## Contributing

This project uses `commitlint` to enforce conventional commit messages and
`release-please` to automate releases.

1.  **Install dependencies**:

    ```bash
    npm install
    ```

2.  **Make your changes**.

3.  **Commit your changes**: Your commit messages must follow the
    [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/)
    format. For example:

    ```
    feat: add new feature
    fix: correct a bug
    docs: update documentation
    ```

4.  **Push your changes**: When you push to `main`, `release-please` will
    automatically create a pull request with the next version number and release
    notes.

## Future Enhancements

- **Persistent State**: Store the state of the API keys (exhausted times, usage)
  in a database or file to persist across server restarts.
- **More Sophisticated Key Selection**: Implement more advanced key selection
  strategies, such as least-recently-used or round-robin.
- **Improved Error Handling**: More granular error handling and reporting.
- **Dashboard**: A simple web-based dashboard to monitor the status of the API
  keys.
