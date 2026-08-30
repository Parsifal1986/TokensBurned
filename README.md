# 🔥 TokensBurned

**Put your AI coding activity on GitHub without uploading prompts or source code.**

TokensBurned collects supported token-usage metadata, turns the totals into a shareable SVG card, and can publish that card to your GitHub profile.

[Open the live website](https://parsifal1986.github.io/TokensBurned/) · [View the repository](https://github.com/Parsifal1986/TokensBurned) · [Read the security boundary](./SECURITY.md)

> Harness, provider, and model are different identities. TokensBurned keeps them separate.

## What TokensBurned does

- Tracks aggregate AI coding activity on your machine.
- Separates the coding harness from the backend provider and model.
- Renders `~/.burn/stats.svg` without a server.
- Publishes through a dedicated `burn` branch in your own GitHub profile repository.
- Adds one marker-delimited image block to your profile README.

TokensBurned does not collect prompts, source code, transcripts, credentials, or intercepted network traffic. The current `0.1.x` release is local-first. A deployed serverless v2 preview lives in [`serverless/`](./serverless/README.md); it accepts only allow-listed aggregate usage fields and pre-renders cards without Git commits.

## Requirements

- Node.js 20 or newer.
- A supported harness: Claude Code or Codex.
- The [GitHub CLI](https://cli.github.com/) only if you want to publish the card.
- A GitHub profile repository named exactly like your username, with a `README.md`, if you want the card on your profile.

## Quick start

Install the CLI from npm:

```bash
npm install -g burn-ai
```

For Claude Code, install the official lifecycle hook:

```bash
burn hooks install
```

Codex uses the hook bundled with the TokensBurned plugin. TokensBurned can also ingest a sanitized usage event manually.

Check the integration and privacy boundaries:

```bash
burn doctor
```

After you have used your coding harness, view the local report:

```bash
burn
```

## Put the card on your GitHub profile

Publishing is optional. Local tracking works without GitHub access.

First authenticate the GitHub CLI:

```bash
gh auth login
```

Make sure your GitHub profile repository exists. For example, the profile repository for `octocat` is `octocat/octocat` and must contain a `README.md`.

Then run:

```bash
burn setup
```

TokensBurned shows the exact operations it will perform and asks for confirmation. It creates a `burn` branch, uploads only aggregate `stats.json` and `stats.svg`, and inserts one managed image block into the profile README.

Future updates can be pushed immediately with:

```bash
burn sync
```

Automatic sync is limited to at most once every three hours, with an additional first-session-of-the-day sync.

## Open the website

The project website is already hosted on GitHub Pages. You do not need to clone the repository or run a development server:

**[https://parsifal1986.github.io/TokensBurned/](https://parsifal1986.github.io/TokensBurned/)**

You can also find it from the GitHub repository:

1. Open [Parsifal1986/TokensBurned](https://github.com/Parsifal1986/TokensBurned).
2. Open the repository's **Deployments** section.
3. Select the latest `github-pages` deployment.
4. Choose **View deployment**.

Repository owners can also find the URL under **Settings → Pages**.

## Privacy controls

Provider attribution is included in the public card by default. To keep provider attribution local while still publishing totals, run:

```bash
burn privacy private
burn sync
```

To publish aggregate provider attribution again:

```bash
burn privacy public
burn sync
```

Local state is stored only in:

```text
~/.burn/
├── config.json
├── stats.json
└── stats.svg
```

Hook payloads are allow-listed to usage and identity fields. If a supported harness does not expose usage metadata through its lifecycle hook, TokensBurned records nothing instead of reading a transcript or session history.

See [SECURITY.md](./SECURITY.md) for the complete data and network boundary.

## Commands

| Command | Purpose |
| --- | --- |
| `burn` | Show the current local activity report. |
| `burn hooks install` | Install the Claude Code lifecycle hook. |
| `burn setup` | Add the TokensBurned card to a GitHub profile. |
| `burn sync` | Sync the current aggregate card immediately. |
| `burn render` | Render `~/.burn/stats.svg` locally. |
| `burn doctor` | Show harness detection and every read, write, and network boundary. |
| `burn privacy private` | Keep provider attribution out of the public card. |
| `burn privacy public` | Include aggregate provider attribution in the public card. |
| `burn clean` | Delete `~/.burn` after confirmation. |

To ingest a sanitized event directly:

```bash
burn ingest ./event.json
```

See every CLI option with:

```bash
burn --help
```

## Development

Run the CLI directly from this repository:

```bash
npm link
burn doctor
```

Run the website locally:

```bash
npm run dev
```

Then open `http://127.0.0.1:4173`.

Run the complete test suite:

```bash
npm run check
```

The Cloudflare Worker can be developed independently from the current CLI:

```bash
npm run worker:migrate:local
npm run worker:dev
```

See [`serverless/README.md`](./serverless/README.md) for its D1, R2, endpoint and privacy boundaries.

The preview API is live at [tokensburned-api.burn-ai.workers.dev](https://tokensburned-api.burn-ai.workers.dev/health). Harness plugin packaging and the end-user `connect` command are the next release step; the serverless backend is not yet used by the published `0.1.x` CLI.

## License

[MIT](./LICENSE) © 2026 parsifal1986
