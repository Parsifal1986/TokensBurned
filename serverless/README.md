# TokensBurned serverless backend

The server-backed architecture for TokensBurned 0.2. It runs as one Cloudflare
Worker with D1 for aggregate usage and R2 for pre-rendered SVG cards.

- API: `https://tokensburned-api.burn-ai.workers.dev`
- Health: `https://tokensburned-api.burn-ai.workers.dev/health`
- GitHub App: `https://github.com/apps/tokensburned`
- Example card: `https://tokensburned-api.burn-ai.workers.dev/v1/cards/u/parsifal1986.svg`

## Boundaries

- Native adapters upload revisioned 15-minute snapshots to `/v1/ingest/batch`.
- The 0.2 plugin can optionally import up to 90 days of local Codex and Claude
  history after explicit user consent, then incrementally upload at `SessionEnd`.
- Native history ingestion contains only token counts, harness, provider, model,
  a hashed session identifier, a 15-minute bucket, revision and request count.
- Claude Code sends only its `claude_code.token.usage` metric.
- Codex sends OTLP logs, but the Worker allow-lists only
  `codex.sse_event` / `response.completed` token and model fields.
- Request bodies, prompts, tool details, repository names, file paths and raw
  OTLP documents are never persisted.
- OTLP/HTTP JSON is supported first. Protobuf support can be added without
  changing the public endpoint.

## Local setup

Install dependencies and create the local D1 schema:

```bash
npm install
npm run worker:migrate:local
```

Set two local-only secrets in `.dev.vars` inside this directory:

```dotenv
TOKEN_PEPPER=generate-a-long-random-value
BOOTSTRAP_SECRET=generate-another-long-random-value
```

Never commit `.dev.vars`.

Start the Worker:

```bash
npm run worker:dev
```

The health endpoint is `http://127.0.0.1:8787/health`.

The production device flow also requires `GITHUB_CLIENT_ID` and
`GITHUB_CLIENT_SECRET`. The deployed GitHub App uses this callback URL:

```text
https://tokensburned-api.burn-ai.workers.dev/v1/auth/github/callback
```

`GITHUB_CLIENT_ID` is a public identifier and may live in `wrangler.toml`.
Store `GITHUB_CLIENT_SECRET`, `TOKEN_PEPPER`, and `BOOTSTRAP_SECRET` only with
`wrangler secret put`. Do not put production secrets in TOML or `.dev.vars`.

## Device connection flow

Harness plugins use a short-lived TokensBurned device code:

1. `POST /v1/auth/device/start` with a display-only `device_name`.
2. Open the returned `verification_uri_complete` in the user's browser.
3. The user authorizes the TokensBurned GitHub App, which only verifies identity.
4. Poll `POST /v1/auth/device/status` at the returned interval.
5. Store the returned `tb_live_…` device token in the harness secret store.

The GitHub user access token is used once to read `/user` and is never stored.
Device tokens are returned only to the waiting client and are stored server-side
as keyed hashes.

## Ingestion endpoints

| Endpoint | Input |
| --- | --- |
| `POST /v1/ingest/batch` | Revisioned, absolute 15-minute usage snapshots. |
| `POST /v1/otel/metrics` | OTLP/HTTP JSON from Claude Code. |
| `POST /v1/otel/logs` | OTLP/HTTP JSON from Codex. |
| `GET /v1/me/summary` | Authenticated aggregate totals. |
| `DELETE /v1/me/data` | Delete the authenticated user's usage, devices, account, and card. |
| `GET /v1/cards/u/:slug.svg` | Public cached SVG card. |

All write and self-service endpoints except device authorization require
`Authorization: Bearer <device-token>`.

## Production resources

The preview deployment uses D1 database `tokensburned`, R2 bucket
`tokensburned-cards`, and Worker `tokensburned-api`. Apply migrations before a
new deployment:

```bash
npx wrangler d1 migrations apply tokensburned --remote --config ./serverless/wrangler.toml
npm run worker:deploy
```
