# 🔥 Burn

**Your AI coding activity, on GitHub.**

Burn tracks token usage from AI coding harnesses locally, renders a meme-friendly SVG, and publishes it from a dedicated branch in your own GitHub profile repository.

> Harness ≠ Provider ≠ Model. Burn keeps them separate.

No prompts. No code. No daemon. No proxy. No account.

## Install

Burn needs Node.js 20 or newer and the GitHub CLI only when GitHub sync is enabled.

```bash
npm install -g burn-ai
burn hooks install
```

During local development:

```bash
npm link
burn doctor
```

The repository also contains manifests for Codex and Claude Code plugin packaging.

## Use

```bash
burn                 # current local stats
burn setup           # initialize the GitHub profile card
burn sync            # sync immediately
burn doctor          # disclose every read/write/network boundary
burn render          # render ~/.burn/stats.svg
burn privacy private # omit providers from the public card
burn clean           # remove ~/.burn after confirmation
```

To ingest a sanitized event directly:

```bash
burn ingest examples/usage-event.json
```

Hook payloads are allow-listed down to identity and usage fields. Burn never opens Claude transcripts or Codex rollout/session history, because those files can contain prompt and response content. If a harness version does not expose usage metadata to its lifecycle hook, Burn records nothing rather than reading a transcript.

## Data model

Each event preserves three different identities:

```text
Harness → Provider → Model
```

Backend attribution has one of four confidence levels: `verified`, `detected`, `reported`, or `unknown`. A Claude Code event is never automatically counted as Anthropic, and a Codex event is never automatically counted as OpenAI.

Local state lives only in:

```text
~/.burn/
├── config.json
├── stats.json
└── stats.svg
```

Public aggregates live on the `burn` branch of the user's profile repository:

```text
burn
├── stats.json
└── stats.svg
```

Setup adds one marker-delimited image block to the profile README. Later syncs update only the `burn` branch.

## GitHub permissions

V1 uses the already-authenticated `gh` CLI. Burn calls GitHub only during setup or a due/manual sync and scopes writes to the configured profile repository. Automatic sync is throttled to at most once every three hours, with an additional first-session-of-the-day sync.

## Website

```bash
npm run dev
```

Then open `http://127.0.0.1:4173`.

## Privacy

Read [SECURITY.md](./SECURITY.md) for the concrete boundary. The short version: no prompts, no source code, no credentials, no traffic interception, and no Burn server.

## License

MIT
