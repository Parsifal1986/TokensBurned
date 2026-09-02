# TokensBurned daily-envelope aggregation and lazy SVG plan

Status: implementation in progress
Pricing snapshot: 2026-09-01
Scope: local collection, upload cadence, D1 storage, summary generation, R2 cards, and CDN caching

## Goals

- Keep prompt, response, source code, repository names, and paths off the server.
- Store only token counts, UTC time, harness, provider, model, and the
  authenticated device identifier; do not store server-side session history.
- Make upload frequency independent from summary and SVG generation frequency.
- Store one canonical D1 row per device per UTC day, not one row per
  hour/session/dimension combination.
- Eliminate full-history queries from normal ingest and card-read paths.
- Let inactive cards consume no regeneration work.
- Offer paid users lower freshness latency without changing the privacy boundary.
- Keep retries idempotent and tolerate missing lifecycle hooks or temporary network failures.

## Non-goals

- Per-request or per-turn history on the public server.
- Exact real-time delivery through third-party image proxies such as GitHub's cache.
- Rebuilding an SVG after every upload.
- Running a permanent local daemon or cron job.

## Data captured and retained

Each local aggregate contains only:

- UTC hour
- harness
- provider
- model
- input, output, cache-read, cache-write, and reasoning token counts
- request count
- monotonically increasing revision
- authenticated device identity needed for idempotency

The client must aggregate before transmission, including for paid users. It
must not upload raw prompts, responses, turn contents, repository names, or
paths. Session identifiers are not required in the canonical server row.

The server keeps exact total counters in ordinary integer columns. It stores
the 24 UTC-hour slots and harness/provider/model breakdown in bounded JSON
payloads. Hourly dimension cross-products are not retained unless a product
feature explicitly requires them; the default payload stores hourly token
counters plus daily dimension totals.

## Local collection

### Persistent daily envelope

The local primary key is:

```text
authenticated device + UTC day
```

Each model response updates the applicable UTC-hour slot and the daily
harness/provider/model breakdown. The envelope is an absolute cumulative
snapshot of that device's day. Its revision increases monotonically. Re-sending
the same or an older revision is a no-op on the server.

The local outbox records:

```text
UTC day
latest_local_revision
latest_acked_revision
absolute day counters
24 hourly slots
daily dimension breakdown
```

Writes to the local outbox must be atomic and tolerate concurrent hook processes.
Before upload, sources and envelopes outside the server's accepted 90-day UTC
window are pruned so the file remains bounded and one expired pending day cannot
cause an otherwise valid batch to fail.

### Flush policy

TokensBurned does not assume a persistent timer because the current plugin hooks are short-lived processes. The current plugin exposes SessionStart and SessionEnd hooks, not a permanent background service.

Free/default policy:

- On every available response/telemetry hook, update the local accumulator.
- If at least one hour elapsed since the last successful upload, upload dirty day envelopes.
- Always attempt a final upload at SessionEnd.
- At SessionStart, retry pending aggregates left by an interrupted session.
- Backfill assembles each closed UTC day locally and uploads each day at most
  once, subject to transport retries.

Paid/low-latency policy:

- On every available response/telemetry hook, update the same local daily envelope.
- Upload at a default 15-minute interval. The interval is configurable but
  remains bounded by the server-authoritative product plan.
- SessionEnd and SessionStart use the same finalization and retry behavior as the free policy.
- Per-turn durable upload is an optional high-cost mode, not the baseline. It
  cannot use fewer than one persistent mutation per changed turn.

Harnesses without a reliable post-response hook use OTel when available and
SessionEnd transcript parsing as a fallback. Raw OTLP events must be folded into
the same absolute local device/day envelope before canonical D1 storage. The v2
path must not retain one immutable D1 event row per model request.

## Upload protocol

Introduce a versioned daily-envelope endpoint. A logical upload may contain
multiple UTC days and multiple HTTP parts, but transport parts do not define
cache invalidation or card generation. One day envelope must not be split
across parts unless it exceeds the hard payload limit.

```json
{
  "v": 2,
  "upload_id": "opaque-random-id",
  "part": 1,
  "final": false,
  "days": [
    {
      "day": "2026-09-01",
      "revision": 12,
      "input_tokens": 120000,
      "output_tokens": 18000,
      "cache_read_tokens": 90000,
      "cache_write_tokens": 0,
      "reasoning_tokens": 6000,
      "request_count": 12,
      "hours": {
        "08": {
          "input_tokens": 120000,
          "output_tokens": 18000,
          "cache_read_tokens": 90000,
          "cache_write_tokens": 0,
          "reasoning_tokens": 6000,
          "request_count": 12
        }
      },
      "dimensions": {
        "harness": {"codex": {"total_tokens": 234000}},
        "provider": {"openai": {"total_tokens": 234000}},
        "model": {"gpt-5.6": {"total_tokens": 234000}}
      }
    }
  ]
}
```

The final transport part sets `final: true`.

The response distinguishes transport acceptance from actual mutations:

```json
{
  "received": 100,
  "changed": 3,
  "ignored": 97,
  "acked_days": [
    {"day": "2026-09-01", "revision": 12}
  ]
}
```

Only `changed > 0` may affect freshness state. Retries and stale revisions must not invalidate summaries or cards.

The client targets at most 64 KB per serialized day and the server enforces a
256 KB hard limit. Exact token totals are never truncated. If dimension
cardinality exceeds the limit, the client retains the largest named dimension
buckets and combines the remainder into an `other` bucket. A future overflow
shard protocol requires a separate version and is not part of v2.

## Server write path

The ingest path performs:

1. One indexed device/user authentication lookup.
2. One conditional upsert for each supplied device/day envelope.
3. No daily/monthly rollup, summary query, or SVG rendering on the hot path.
4. A response derived from actual conditional-upsert results.

The upsert changes only counters, JSON payloads, revision, and `updated_at` when
the incoming revision is newer. These fields must not be indexed. A stale or
retried revision must write zero rows.

`devices.last_seen_at` must be throttled to at most once per UTC day or written
at SessionEnd, rather than updated after every upload.

The new schema should avoid redundant indexes. Every index that contains a changed column increases D1 rows written.

## Server read model

Recommended tables:

### `device_daily_usage`

- One absolute row per authenticated device and UTC day.
- Primary key: `(device_id, day)`.
- Exact total counters are ordinary integer columns.
- `hours_json` contains at most 24 hourly counter slots.
- `dimensions_json` contains daily harness/provider/model totals.
- Rows younger than 30 days retain hours and dimensions.
- Rows from 30 through 90 days retain daily totals and dimension totals but no
  hourly slots.
- Updating the current day changes only non-indexed columns, so the target is
  one D1 row written per changed upload.

Do not add a second `(device_id, day)` index: the primary-key index already
serves that lookup. Summary reads first obtain the user's small device set, then
use the primary-key prefix and day range. Global retention scans are avoided by
lazy per-user compaction.

Suggested shape:

```sql
CREATE TABLE device_daily_usage (
  device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  day INTEGER NOT NULL,
  revision INTEGER NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  cache_read_tokens INTEGER NOT NULL,
  cache_write_tokens INTEGER NOT NULL,
  reasoning_tokens INTEGER NOT NULL,
  request_count INTEGER NOT NULL,
  hours_json TEXT,
  dimensions_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (device_id, day)
);
```

### `user_monthly_usage`

- One materialized row per user and UTC month for data older than 90 days.
- Used for long-term history, not current heatmaps.
- Stores exact totals and monthly harness/provider/model breakdown.
- It does not retain hourly or session-level data.

### `user_totals`

- One row per user.
- Stores all-time counters and supports an indexed ranking calculation without scanning raw usage.

### `user_summaries`

- One cached JSON summary per user.
- Stores the generation time and uses a one-hour TTL for the free/default path.
- Normal authenticated summary reads return this row instead of rebuilding history.

### `user_card_state`

- Stores the last generation time and the plan-specific minimum refresh interval.
- May be merged with `user_summaries` if doing so avoids an extra write and query.
- Cross-POP singleflight should use a per-user Durable Object without persistent
  lease writes when possible. A D1 lease is the fallback, not the default.

### Freshness without a per-upload state read or write

Do not update a separate `stats_version` or dirty row after every ingest. The
summary and card caches expire on a plan-specific TTL. A normal cache hit reads
only its own cached row or R2 object and never scans source rows merely to decide
whether it is stale. On expiry, the summary is rebuilt from bounded source rows.
For the free/default path this intentionally permits up to roughly one hour of
staleness in exchange for eliminating both a dirty-row write on upload and a
freshness scan on every read.

## Accepted tradeoffs and boundaries

The daily envelope is a deliberate middle ground, not a universally normalized
analytics schema:

- Ad-hoc SQL by hour/model/provider is less convenient because the breakdown is
  JSON. Common exact totals remain ordinary integer columns, and card/summary
  code reads only one user's bounded row set.
- Updating one token counter rewrites the current day's larger row internally.
  This reduces billable row mutations but can cost more bytes and parsing CPU
  than updating a narrow row; production latency and serialized size must be
  measured.
- Conditional revision checks are mandatory. One device/day has one writer
  sequence; separate devices use separate rows and cannot overwrite each other.
- Corruption or a bad migration affects at most one device-day, rather than a
  whole month. This is why the plan rejects the cheaper device/month envelope
  as the default.
- Global product analytics and ranking do not scan JSON payloads. They use the
  bounded `user_totals`/materialized ranking path or a separate non-canonical
  analytics system.
- The 256 KB day limit is a correctness boundary. Exact token totals take
  priority over named breakdown cardinality.

## Compaction

- Current-day uploads repeatedly update the same device/day row.
- After 30 days, compaction rewrites the same row once with
  `hours_json = NULL`; exact daily totals and daily dimension totals remain.
- After 90 days, all device/day rows for a user/month are merged idempotently
  into one `user_monthly_usage` row and then deleted.
- `user_totals` is finalized at most once per closed UTC day or during bounded
  compaction, never after every upload and never by rescanning all history.
- All boundaries use UTC.
- Inactive users are compacted lazily on their next upload or read; a low-frequency bounded sweeper may be added as a fallback, but it must not scan the entire usage database in one invocation.

Compaction records a deterministic source watermark so retries cannot add the
same daily rows to a monthly total twice. Deletes and index removals count as D1
rows written and are included in the capacity model.

## Summary generation

A summary cache miss reads only:

- at most 90 daily rows per active device for the 90-day heatmap and rolling totals
- the `hours_json` payloads from the most recent 30 days
- a small number of monthly rows for older history
- one all-time totals row
- indexed ranking data or a materialized rank

Target acceptance criteria:

- One bounded summary query or one D1 batch with no repeated full-history CTE.
- At most 250 D1 rows read for the modeled typical one-device user.
- At most 1,000 D1 rows read for a multi-device outlier.
- One cached summary row for normal API reads.
- No analytical reads during ingest.

## Lazy SVG generation

Uploading usage changes only the applicable device/day row; it does not write a
separate dirty/version row and does not render an SVG.

The public card lifecycle is:

1. CDN serves a fresh cached response without origin regeneration.
2. After TTL expiry, the request reaches the card Worker/origin.
3. If the R2 object is still inside the plan's minimum regeneration interval,
   return it without a D1 query.
4. Otherwise, enter the per-user singleflight, rebuild through the TTL-backed
   summary read model, and write one R2 object.
5. Concurrent requests serve the existing SVG rather than starting duplicate rebuilds.

When no one requests a card, no SVG is regenerated.

Privacy changes to private must delete the R2 object before the privacy update is reported as complete. Private users never enter the public lazy-generation path.

## CDN behavior

Use standard Workers/CDN caching or an R2 custom domain rather than manually populating per-data-center Cache API entries.

Use asynchronous stale-while-revalidate so the first request after expiry receives the previous SVG while regeneration happens in the background. Do not combine `s-maxage` with `stale-while-revalidate`; current Cloudflare behavior disables stale serving in that combination. Use the appropriate Worker/CDN cache headers and test `CF-Cache-Status` in production.

Suggested product policy defaults:

| Policy | Free/default | Paid/low latency |
|---|---:|---:|
| Upload cadence | hourly + SessionEnd | 15 minutes + SessionEnd |
| Card minimum regeneration interval | 60 minutes | 15 minutes |
| CDN freshness TTL | about 60 minutes | short, but bounded |
| Stale-while-revalidate window | 24 hours | 1-24 hours |
| No card requests | no regeneration | no regeneration |

The product can promise origin freshness bounds. It cannot guarantee that third-party image proxies immediately discard their own cached copies.

## Abuse and correctness controls

- Server-side plan enforcement; never trust a client-supplied paid/free flag.
- Per-user/device upload rate limits.
- Maximum entries and payload bytes per request.
- Target 64 KB and hard-limit 256 KB per serialized device/day envelope.
- Absolute snapshot revisions for retry safety.
- Exact counters remain exact when excess dimension cardinality is combined
  into an `other` presentation bucket.
- One active generation singleflight per user.
- CPU limits on card generation.
- Budget alerts for Worker requests, D1 rows written, D1 rows read, and R2 Class A operations.
- Metrics for `received`, `changed`, ignored revisions, cache hits, regenerations, and D1 query metadata.

## Migration phases

Implementation checkpoint (2026-09-01): Phase 0 is implemented locally. Phase
1 and the core Phase 2 schema/read path are implemented behind protocol v2 with
legacy v1 compatibility. The core Phase 3 lazy R2 path and per-isolate
singleflight are also implemented; cross-POP singleflight and production CDN
verification remain open. The migrations have been applied and exercised
against local D1 only; no remote migration or production deployment has been
performed. The production sequence, canary gates, legacy rollup, and rollback
rules are tracked in [production-rollout.md](./production-rollout.md). Ranking
materialization is implemented as an explicit, measured production task rather
than a recurring job or request-time global scan.

### Phase 0: stop the current amplification

- Remove `refreshUserCard()` from every ingest/OTel request.
- Stop dynamic card options from rebuilding history on every request.
- Return actual changed/no-op counts from snapshot upserts.

### Phase 1: local daily envelopes

- Add the persistent local day envelope with 24 hourly slots and acknowledged revisions.
- Add the v2 absolute device/day upload protocol.
- Implement free hourly/SessionEnd upload policy.

### Phase 2: server read model

- Add device/day, user/month, totals, and summary tables.
- Backfill the read model once from existing D1 data.
- Measure real insert, non-indexed update, downsample, and delete
  `meta.rows_written` before dropping the legacy tables.
- Switch `/v1/me/summary` to cached reads.
- Keep cache-hit validation to one summary row; do not scan detail rows for a watermark.

### Phase 3: lazy card and CDN

- Add plan-specific card TTL state and per-user singleflight.
- Generate on demand and store in R2.
- Configure and verify CDN TTL, ETag, and stale-while-revalidate behavior.

### Phase 4: paid freshness

- Add server-authoritative plan fields.
- Enable the 15-minute upload policy for eligible users.
- Keep per-turn upload behind a separately metered experiment if it is ever required.
- Apply a 15-minute card regeneration interval.
- Measure rows written before widening availability.

## Success metrics

- Ingest analytical rows read: zero.
- Default card CDN hit: zero D1 rows and zero R2 operations at origin.
- Cached authenticated summary: one bounded row lookup after authentication, preferably combined into one route-specific query.
- Summary cache miss: at most 250 D1 rows read for the typical modeled
  one-device user and at most 1,000 for a multi-device outlier.
- Changed upload: one usage-row mutation, with no separate dirty/version write.
- Free/default modeled user: target 250-350 D1 rows written per month.
- Paid 15-minute modeled user: target 700-850 D1 rows written per month.
- One logical backfill: no separate invalidation write and zero eager SVG generations;
  it becomes visible after the applicable summary/card TTL.
- No-op/retry upload: zero summary invalidations and zero card generations.

## Pricing references

- [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/)
- [R2 pricing](https://developers.cloudflare.com/r2/pricing/)
- [Workers cache configuration](https://developers.cloudflare.com/workers/cache/configuration/)
- [Cloudflare cache revalidation](https://developers.cloudflare.com/cache/concepts/revalidation/)
- [R2 custom-domain caching](https://developers.cloudflare.com/r2/buckets/public-buckets/)
