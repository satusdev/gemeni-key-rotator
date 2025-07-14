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

## Getting Started 🚀

There are two ways to use this project: deploying it to Deno Deploy or running
it locally.

### Option 1: Deploy on Deno Deploy (Recommended)

1.  **Fork this repository.**
2.  Go to [Deno Deploy](https://deno.com/deploy) and create a new project.
3.  Link your GitHub account and select your forked repository.
4.  In the project settings, add your environment variables (see
    [Configuration](#configuration-)).
5.  Deploy! Your Gemini Key Rotator is now live.

### Option 2: Run Locally

1.  **Clone the repository:**

    ```bash
    git clone https://github.com/satusdev/gemeni-key-rotator.git
    cd gemeni-key-rotator
    ```

2.  **Set up environment variables:**

    Create a `.env` file by copying the example:

    ```bash
    cp .env.example .env
    ```

    Then, edit the `.env` file to add your API keys.

3.  **Run the server:**

    ```bash
    deno run --allow-env --allow-net --allow-read mod.ts
    ```

    Your proxy will be running at `http://localhost:8000`.

    #### Usage Examples

    ##### cURL (Bash/Zsh)

    ```bash
    curl -X POST "http://localhost:8000/v1beta/models/gemini-pro:generateContent" \
         -H "Content-Type: application/json" \
         -d '{
               "contents": [{
                 "parts":[{
                   "text": "Write a story about a magic backpack."
                 }]
               }]
             }'
    ```

    ##### PowerShell

    ```powershell
    Invoke-WebRequest -Uri "http://localhost:8000/v1beta/models/gemini-pro:generateContent" `
      -Method POST `
      -Headers @{"Content-Type"="application/json"} `
      -Body '{"contents":[{"parts":[{"text": "Write a story about a magic backpack."}]}]}'
    ```

## Configuration ⚙️

This project is configured through environment variables. See `.env.example` for
all available options.

### Required

- `API_KEYS`: A comma-separated list of your Gemini API keys.

### Optional

- `GEMINI_API_BASE_URL`: The base URL for the Gemini API. Defaults to
  `https://generativelanguage.googleapis.com`.

## Features at a glance 🚀

- **API Key Rotation**: Automatically rotates through a list of API keys to
  distribute requests.
- **Rate Limiting**: Basic IP-based rate limiting to prevent abuse.
- **Cooldowns**: When an API key hits a rate limit (429) or encounters a server
  error (5xx), it's put on a cooldown.
- **Retries**: Automatically retries requests that fail with a rate limit error
  (429) or a server error (5xx).
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
