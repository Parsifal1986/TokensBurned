# TokensBurned serverless backend

The server-backed architecture for TokensBurned 0.2. It runs as one Cloudflare
Worker with D1 for aggregate usage and R2 for pre-rendered SVG cards.

- API: `https://api.tokensburned.com`
- Health: `https://api.tokensburned.com/health`
- GitHub App: `https://github.com/apps/tokensburned`
- Example card: `https://api.tokensburned.com/v1/cards/u/parsifal1986.svg?theme=auto`

## Boundaries

- Native adapters upload revisioned 15-minute snapshots to `/v1/ingest/batch`.
- The 0.2 plugin can optionally import up to 90 days of local Codex and Claude
  history after explicit user consent, then incrementally upload at `SessionEnd`.
- Native history ingestion contains only token counts, harness, provider, model,
  a hashed session identifier, a 15-minute bucket, revision and request count.
- Claude Code sends only its `claude_code.token.usage` metric.
- Codex sends OTLP logs, but the Worker allow-lists only
  `codex.sse_event` / `response.completed` token and model fields.
- Gemini CLI and other current harnesses can send standard OpenTelemetry GenAI
  usage logs or spans. Known harness aliases, providers and model families are
  canonicalized before aggregation.
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
https://api.tokensburned.com/v1/auth/github/callback
```

`GITHUB_CLIENT_ID` is a public identifier and may live in `wrangler.toml`.
Store `GITHUB_CLIENT_SECRET`, `TOKEN_PEPPER`, and `BOOTSTRAP_SECRET` only with
`wrangler secret put`. Do not put production secrets in TOML or `.dev.vars`.

## Device connection flow

Harness plugins use a short-lived TokensBurned device code:

1. `POST /v1/auth/device/start` with a display-only `device_name`.
2. Open the returned `verification_uri`, manually enter the displayed `user_code`, and verify the requesting device name.
3. Confirm in that browser, then authorize the TokensBurned GitHub App, which only verifies identity.
4. Poll `POST /v1/auth/device/status` at the returned interval.
5. Store the returned `tb_live_…` device token in the harness secret store.

The GitHub user access token is used once to read `/user` and is never stored.
Device authorizations can be claimed only once. Device tokens are returned only
to the waiting client, expire after 180 days, and are stored server-side as keyed
hashes. Public cards remain disabled until a separate authenticated privacy update.

## Ingestion endpoints

| Endpoint | Input |
| --- | --- |
| `POST /v1/ingest/batch` | Revisioned, absolute 15-minute usage snapshots. |
| `POST /v1/otel/metrics` | OTLP/HTTP JSON token metrics from Claude Code or GenAI clients. |
| `POST /v1/otel/logs` | Codex events or standard GenAI usage logs. |
| `POST /v1/otel/traces` | Standard GenAI spans containing usage attributes. |
| `GET /v1/me/summary` | Authenticated aggregate totals. |
| `GET /v1/me/privacy` | Read the server-enforced public-card policy. |
| `PUT /v1/me/privacy` | Replace the public-card policy; every field is required. |
| `DELETE /v1/me/device` | Revoke the current device credential. |
| `DELETE /v1/me/data` | Delete the authenticated user's usage, devices, account, and card. |
| `GET /v1/cards/u/:slug.svg` | Public SVG card. Supports `layout`, `heatmap`, `compare`, `rank`, `meme`, and `theme=auto|light|dark`. |

All write and self-service endpoints except device authorization require
`Authorization: Bearer <device-token>`.

Standard OTLP base endpoints are also available at `/v1/metrics`, `/v1/logs`
and `/v1/traces`. Configure exporters to send only one token-bearing signal per
harness to avoid counting the same model call once as a log and again as a span.
The examples in `serverless/config/` disable prompt logging; the Worker also
allow-lists fields and never stores raw OTLP payloads.

Revisioned native snapshots are deduplicated across devices by user, stable
hashed session, harness, model and 15-minute bucket, taking the newest revision.
When those snapshots overlap OTel events for the same user, harness and bucket,
summary queries use the snapshot and omit the overlapping OTel events. Records
remain append-only; reconnects and backfills cannot inflate public totals.

## Public card analytics

Cards are unavailable by default. An authenticated user must explicitly enable
the card and each publishable category. Query parameters may reduce this stored
policy but cannot expand it. Published cards summarize rolling 24-hour, 7-day and 30-day windows plus all retained
history. Daily cells cover 12 weeks; hourly cells group the last 30 days by UTC
hour. Harness, provider and model shares use the same 30-day window. Rank is an
all-time token rank across users with recorded activity; only the viewer's rank
and the aggregate participant count are rendered.

Aggregate records are retained until the authenticated user calls
`DELETE /v1/me/data`. That endpoint removes usage, devices, identity, and the R2
card. Expired authorization rows are cleaned up opportunistically.

## Production resources

The preview deployment uses D1 database `tokensburned`, R2 bucket
`tokensburned-cards`, and Worker `tokensburned-api`. Apply migrations before a
new deployment:

```bash
npx wrangler d1 migrations apply tokensburned --remote --config ./serverless/wrangler.toml
npm run worker:deploy
```
