<div align="center">
    <h1>Gemini API Key Rotator</h1>
    <img src="https://img.icons8.com/fluency/96/000000/key.png" alt="logo"/>
</div>

## Overview ⏩️

This project provides a lightweight, Deno-based server that acts as a proxy to
the Google Gemini API. It intelligently rotates a pool of API keys to help
manage rate limits and prevent service interruptions.

## Table of Contents 📄

- [Table of contents](#table-of-contents-)
- [Requirements](#requirements-%EF%B8%8F)
- [Getting Started](#getting-started-%EF%B8%8F)
- [Configuration](#configuration-)
- [Features at a glance](#features-at-a-glance-)
- [Built with](#built-with-%EF%B8%8F)
- [Contributing](#contributing)
- [Getting help](#getting-help-)

## Requirements ⏸️

This project requires [Deno](https://deno.land/) to run. For development, you
will also need [Node.js](https://nodejs.org/en) 18 or higher.

## Getting Started ☣️

1. ) First clone project

```bash
  git clone https://github.com/satusdev/gemeni-key-rotator.git
```

2. ) Go to the project directory

```bash
  cd gemeni-key-rotator/
```

3. ) Copy env file

```bash
  cp .env.example .env
```

4. ) Install necessary dependencies for development

```bash
  npm i
```

5. ) Run the server

```bash
deno run --allow-env --allow-net --allow-read mod.ts
```

## Configuration 🥣

To setup the project, you'll need to edit the env variable within the copied env
file.

- `API_KEYS`: A comma-separated list of your Gemini API keys.
- `GEMINI_API_BASE_URL`: The base URL for the Gemini API.
- `ACCESS_TOKEN`: An optional access token to secure the proxy.

## Features at a glance 🚀

- **API Key Rotation**: Automatically rotates through a list of API keys to
  distribute requests.
- **Rate Limiting**: Basic IP-based rate limiting to prevent abuse.
- **Cooldowns**: When an API key hits a rate limit (429) or encounters a server
  error (500), it's put on a cooldown.
- **Retries**: Automatically retries requests that fail with a 500 error.
- **Access Control**: Optional access token to secure the proxy.
- **Detailed Logging**: Comprehensive logging for easy debugging.

## Built with 📦️

- [`@Deno`](https://deno.land/)

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

## Getting help 🆘

If you're having issues with anything, please open an issue on the GitHub
repository.
