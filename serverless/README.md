# TokensBurned serverless backend

The server-backed architecture for TokensBurned 0.2. It runs as one Cloudflare
Worker with D1 for aggregate usage and R2 for pre-rendered SVG cards.

- API: `https://api.tokensburned.com`
- Health: `https://api.tokensburned.com/health`
- GitHub App: `https://github.com/apps/tokensburned`
- Example card: `https://api.tokensburned.com/v1/cards/u/parsifal1986.svg?theme=auto`

## Boundaries

- Current native adapters aggregate locally and upload one revisioned, absolute
  device/day envelope to `/v1/ingest/batch`. Protocol v1 15-minute snapshots
  remain accepted during the client migration.
- The 0.2 plugin can optionally import up to 90 days of local Codex and Claude
  history after explicit user consent, then incrementally upload at `SessionEnd`.
- Native history ingestion contains only exact token counters, UTC hour,
  harness, provider, model, revision and request count. Session identifiers
  remain in the local outbox and are not part of the v2 server row.
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
2. Open the returned `verification_uri_complete`, which fills the short code automatically, and verify the requesting device name. The plain `verification_uri` and displayed `user_code` remain available as a manual fallback.
3. Confirm in that browser, then authorize the TokensBurned GitHub App, which only verifies identity.
4. Poll `POST /v1/auth/device/status` at the returned interval.
5. Store the returned `tb_live_…` device token in the harness secret store.

The confirmation page carries a one-time, server-hashed nonce in its approval
URL, so the first click proceeds even in privacy-focused and embedded browsers
that lose cookies or hidden form fields between submissions. Same-origin posts
from older confirmation pages also proceed without an extra review click;
cross-origin posts still require a valid nonce. Browser-facing OAuth failures
render an HTML recovery page rather than a JSON API error. The page CSP allows
form navigation only to TokensBurned and GitHub so Safari can follow the OAuth
redirect without broadening the destination policy.

The GitHub user access token is used once to read `/user` and is never stored.
Device authorizations can be claimed only once. Device tokens are returned only
to the waiting client, expire after 180 days, and are stored server-side as keyed
hashes. New accounts start private. Privacy policy is stored on the GitHub-backed
user record, returned to each newly connected device, and is never reset by a
later device connection.

Clients can check `GET /v1/client/version` at most once per day for the latest
and minimum supported release. The check only reports an available update;
the user's plugin manager remains responsible for installing it.

## Ingestion endpoints

| Endpoint | Input |
| --- | --- |
| `POST /v1/ingest/batch` | v2 absolute device/day envelopes; legacy v1 snapshots remain compatible. |
| `POST /v1/otel/metrics` | OTLP/HTTP JSON token metrics from Claude Code or GenAI clients. |
| `POST /v1/otel/logs` | Codex events or standard GenAI usage logs. |
| `POST /v1/otel/traces` | Standard GenAI spans containing usage attributes. |
| `GET /v1/me/summary` | Authenticated aggregate totals. |
| `GET /v1/me/privacy` | Read the server-enforced public-card policy. |
| `PUT /v1/me/privacy` | Replace the public-card policy; every field is required. |
| `DELETE /v1/me/device` | Revoke the current device credential. |
| `DELETE /v1/me/data` | Delete the authenticated user's usage, devices, account, and card. |
| `GET /v1/client/version` | Public latest/minimum client release metadata for daily update checks. |
| `GET /v1/cards/u/:slug.svg` | Public SVG card served from R2/CDN and lazily regenerated after its minimum interval. |

All write and self-service endpoints except device authorization require
`Authorization: Bearer <device-token>`.

Standard OTLP base endpoints are also available at `/v1/metrics`, `/v1/logs`
and `/v1/traces`. Configure exporters to send only one token-bearing signal per
harness to avoid counting the same model call once as a log and again as a span.
The examples in `serverless/config/` disable prompt logging; the Worker also
allow-lists fields and never stores raw OTLP payloads.

The local outbox deduplicates revisioned source snapshots and folds them into
one absolute UTC-day payload per device. Server updates are conditional on a
strictly newer day revision, so retries write zero usage rows. During migration,
a v2 device/day row takes precedence over legacy snapshots and OTLP events for
the same device/day, preventing double counting.

Authenticated summaries use a one-hour cached `user_summaries` row. A cache hit
therefore reads one row rather than scanning source rows to calculate a freshness
watermark. A miss rebuilds from the bounded daily, legacy-transition, and monthly
read models.

## Public card analytics

Cards are unavailable by default. An authenticated user must explicitly enable
the card and each publishable category. Public query parameters no longer cause
live analytical rebuilds; the stored account policy controls the rendered R2
object. Published cards summarize UTC day, 7-day and 30-day windows plus all retained
history. Daily cells cover 12 weeks; hourly cells group the last 30 days by UTC
hour. Harness, provider and model shares use the same 30-day window. Rank is a
materialized value read by user ID; a request never scans all users to calculate
an exact live rank. Until a bounded ranking job publishes a value, the card
shows that ranking is pending.

Device/day rows keep hourly slots for 30 days, daily totals for 90 days, and are
then rolled into user/month rows. `DELETE /v1/me/data` removes daily/monthly
usage, totals, summaries, devices, identity, and the R2 card through foreign-key
cascades. Expired authorization rows are cleaned up opportunistically.

## Production resources

The preview deployment uses D1 database `tokensburned`, R2 bucket
`tokensburned-cards`, and Worker `tokensburned-api`. Apply migrations before a
new deployment:

```bash
npx wrangler d1 migrations apply tokensburned --remote --config ./serverless/wrangler.toml
npm run worker:deploy
```

For production, use the staged version/backfill procedure in
[`plans/production-rollout.md`](../plans/production-rollout.md) instead of the
direct deploy command. The Worker persists a 1% sample of structured operation
metrics. `V2_INGEST_ENABLED`, `CARD_REGENERATION_ENABLED`, and
`COMPACTION_ENABLED` provide forward-compatible emergency load shedding.
