# 🔥 TokensBurned

**Put your AI coding activity on GitHub without uploading prompts or source code.**

TokensBurned collects token-usage metadata from AI coding harnesses, aggregates it with a serverless backend, and gives you a live SVG card for your GitHub profile. The card shows 24-hour, 7-day, 30-day and all-time totals, daily and hourly heatmaps, harness/provider/model comparisons, and your anonymous site-wide rank.

[Live website](https://tokensburned.com/) · [Repository](https://github.com/Parsifal1986/TokensBurned) · [Security boundary](./SECURITY.md)

## Install the plugin

### Claude Code

Run these commands inside Claude Code:

```text
/plugin marketplace add Parsifal1986/TokensBurned
/plugin install tokensburned@tokensburned
/reload-plugins
/tokensburned:connect
```

`connect` opens GitHub authorization. In an interactive terminal it asks whether you want to import up to 90 days of existing Codex and Claude token history. In a non-interactive harness it safely skips history unless you explicitly run `/tokensburned:connect --backfill`. Preview the import without uploading anything:

```text
/tokensburned:backfill --dry-run --days 90
```

### Codex

Until the plugin is published in the Codex plugin directory, add this repository as a local marketplace and install `tokensburned`. During repository development:

```bash
codex plugin marketplace add /path/to/TokensBurned
codex plugin add tokensburned@tokensburned
```

Start a new Codex task after installation. Use the three focused skills directly:

```text
$tokensburned:connect
$tokensburned:backfill Preview my last 90 days without uploading.
$tokensburned:server
```

Natural-language requests still work; the explicit skills make the intended action and authorization boundary clearer.

### CLI fallback

The standalone CLI remains available directly from GitHub for harnesses without plugin support:

```bash
npm install -g github:Parsifal1986/TokensBurned
tokensburned connect
```

The shorter `burn` command remains an alias.

## What happens after installation

- `connect` verifies your GitHub identity through the TokensBurned GitHub App and stores a device credential in `~/.burn/credentials.json` with user-only permissions.
- If you approve history import, TokensBurned opens only `~/.codex/sessions/**/*.jsonl` and `~/.claude/projects/**/*.jsonl` for up to the requested 90-day range.
- JSONL is decoded locally. Only token counts, harness, provider, model, a hashed session identifier, and a 15-minute time bucket are uploaded.
- Prompts, responses, tool payloads, source code, repository names, transcript paths, API keys, and raw session files are not uploaded.
- The bundled `SessionEnd` hook performs a short best-effort incremental upload. It does not install a cron job, daemon, proxy, or make Git commits.

Harness, provider, and model are kept as separate identities. TokensBurned does not infer a provider solely from the harness name.

## Supported harnesses

- Claude Code and Codex have first-party plugin hooks plus an optional 90-day local history import.
- Gemini CLI is supported through its built-in OpenTelemetry GenAI events.
- OpenCode, Cursor, Cline, Aider, Copilot CLI and other harnesses can use the revisioned batch API or standard OTLP/HTTP JSON logs and traces.
- Harness aliases, provider aliases and provider-prefixed model names are normalized server-side. Unknown providers are inferred only from recognizable model families; an explicitly reported provider is never overwritten.

Standard OTLP exporters can use `https://api.tokensburned.com` as their base endpoint and send a connected device token through `OTEL_EXPORTER_OTLP_HEADERS`. TokensBurned accepts `/v1/logs`, `/v1/metrics`, and `/v1/traces`, as well as the explicit `/v1/otel/*` routes. Only allow-listed identity and token-count attributes survive parsing.

Repeated connections are deduplicated by the stable hashed session, harness, model and 15-minute bucket, taking only the highest revision. If a native revisioned snapshot and OTel data overlap for the same user, harness and bucket, the snapshot is authoritative. This prevents reconnects, history imports and live telemetry from counting the same model call twice.

## Add the card to your GitHub profile

After connecting, get your public card URL:

```bash
tokensburned server
```

Add the returned URL to the `README.md` of your GitHub profile repository:

```markdown
[![TokensBurned activity](https://api.tokensburned.com/v1/cards/u/YOUR_GITHUB_NAME.svg)](https://tokensburned.com/)
```

For example, GitHub user `octocat` has a special public profile repository named `octocat/octocat`. Edit that repository's `README.md`, paste the Markdown above, replace `YOUR_GITHUB_NAME`, and commit it once. The SVG updates from the server afterward without further README commits.

## CLI commands

| Command | Purpose |
| --- | --- |
| `tokensburned connect` | Connect GitHub and optionally import existing history. |
| `tokensburned backfill --dry-run` | Preview historical totals locally without uploading. |
| `tokensburned backfill --days 30` | Import an approved 1–90 day history range. |
| `tokensburned server` | Show server totals and the public card URL. |
| `tokensburned doctor` | Show detected harnesses and all read, write, and network boundaries. |
| `tokensburned` | Show the legacy local activity report. |
| `tokensburned setup` | Use the legacy Git-branch profile publishing flow. |
| `tokensburned clean` | Delete local TokensBurned state after confirmation. |

Claude Code exposes `/tokensburned:connect`, `/tokensburned:backfill`, `/tokensburned:server`, and `/tokensburned:burn`. Codex exposes the corresponding `$tokensburned:connect`, `$tokensburned:backfill`, and `$tokensburned:server` skills.

## Architecture

The API runs on a Cloudflare Worker, D1 stores aggregate usage, and R2 stores pre-rendered public SVG cards. The native client uploads revisioned 15-minute snapshots in batches of at most 100. Device tokens are sent only in the `Authorization` header.

- API health: [api.tokensburned.com/health](https://api.tokensburned.com/health)
- GitHub App: [github.com/apps/tokensburned](https://github.com/apps/tokensburned)
- Backend details: [`serverless/README.md`](./serverless/README.md)

## Development

```bash
npm install
npm run plugin:sync
npm run check
```

Run the website locally with `npm run dev`, then open `http://127.0.0.1:4173`.

The plugin source is in [`plugins/tokensburned/`](./plugins/tokensburned/). `npm run plugin:sync` refreshes its self-contained CLI runtime and focused skills from the repository source before validation or release.

## License

[MIT](./LICENSE) © 2026 parsifal1986
