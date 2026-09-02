# TokensBurned daily-envelope production rollout

Status: server rollout complete at 100%; v2 client publication still pending
Prepared: 2026-09-01
Executed: 2026-09-02

## Current state

Migrations `0005` and `0006`, the fixed-cutoff legacy backfill, materialized
totals, rankings, and the v1+v2 Worker are live. The final Worker version is
`538e5776-ce44-44b5-930d-5c310b2c6a5b` at 100% traffic. No v2 client package was
published as part of this server rollout.

Recorded baseline on 2026-09-01:

- D1 Time Travel bookmark:
  `0000003f-00000000-000050d9-5106542faaf0eed23d4d5977232ad5c8`
- Current 100% Worker version:
  `81eb7fe8-13e0-4ee5-9b3f-ea5397373395`

Execution record on 2026-09-02:

- Pre-migration Time Travel bookmark:
  `00000043-00000000-000050da-5d7bae11ed340785d6920e903709c3de`
- Fixed legacy cutoff: `2026-06-04` UTC (`LEGACY_ROLLUP_CUTOFF_DAY=20608`)
- Backfilled legacy range: June 2026 rows before the cutoff
- Rebuilt `user_totals`: 60,755 rows read and 3 rows written in D1 metadata
- Materialized rankings: 14 rows read and 4 rows written in D1 metadata
- First 5% canary was rolled back when aggregate parity failed. The defect was
  corrected and the replacement version passed 5%, 25%, and 100% stages.
- Final exact parity check matched old production for 24-hour, 7-day, 30-day,
  all-time, month-request, and ranking fields. The new version intentionally
  fixes the old `week_requests` field, which duplicated `month_requests`.
- Final warm-summary log: `cache=hit`, `rows_loaded=1`, no compaction and no
  exception. Post-deploy health, SVG, and authenticated summary all returned 200.
- Final D1 snapshot: 16,391,074 rows read and 14,230 rows written in the trailing
  24 hours. This window includes migration diagnostics and repeated parity
  queries, so it is not the steady-state cost baseline.

## Compatibility rule

Deploy the v1+v2-compatible Worker before releasing any v2 client. During the
Worker canary all public clients must still send v1, because a request routed to
the previous Worker version cannot accept v2. Once the new Worker reaches 100%,
v2 clients may be released. After v2 clients exist, prefer a forward fix over
rolling the Worker back to a version that only understands v1.

## 1. Local and remote read-only preflight

```bash
npm run worker:preflight
npm run worker:preflight -- --remote
```

The remote preflight reads D1 identity, pending migrations, the current Time
Travel bookmark, and Worker versions. It does not migrate or deploy anything.
Record the bookmark and current production Worker version ID in the release log.

## 2. Choose a fixed legacy cutoff

Pick one UTC date, normally deployment day minus 90 days. Do not let each batch
calculate its own moving cutoff. Discover the oldest legacy month using an
indexed minimum rather than `COUNT(*)` over the event tables:

```sql
SELECT MIN(bucket) AS oldest_bucket FROM usage_buckets;
SELECT MIN(bucket) AS oldest_bucket FROM usage_events;
```

Convert the older result to its UTC month. Preview every monthly statement
before execution:

```bash
npm run worker:backfill:legacy -- \
  --from=YYYY-MM \
  --through=YYYY-MM \
  --cutoff-day=YYYY-MM-DD \
  --print-sql
```

The backfill is deliberately separate from schema migrations. It operates one
month at a time, folds only rows before the fixed cutoff into
`user_monthly_usage`, preserves bounded dimension totals, and uses
`ON CONFLICT DO NOTHING`. It never deletes legacy rows.

## 3. Production database sequence

1. Verify no v2 client has been published.
2. Record a D1 Time Travel bookmark.
3. Apply migrations `0005` and `0006` remotely.
4. Run the monthly legacy backfill with the reviewed range:

```bash
npm run worker:backfill:legacy -- \
  --from=YYYY-MM \
  --through=YYYY-MM \
  --cutoff-day=YYYY-MM-DD \
  --execute-remote \
  --confirm-database=tokensburned
```

5. Verify a small sample of user totals against the old summary before changing
   Worker traffic. Do not use an unbounded global `COUNT(*)` as a health check.

All schema changes are additive, so the old Worker continues to operate while
the backfill runs. D1 Time Travel restore overwrites the database in place and
cancels in-flight queries; it is an incident-only recovery action, not the
normal application rollback.

## 4. Worker canary

Upload a version without sending traffic to it:

```bash
npm run worker:version:upload -- \
  --tag=daily-envelope-v2 \
  --message="daily envelope read/write model"
npm run worker:versions:list
```

Use the returned current and new version IDs to deploy 5% traffic:

```bash
npx wrangler versions deploy OLD_VERSION_ID@95% NEW_VERSION_ID@5% \
  --config ./serverless/wrangler.toml \
  --message="daily-envelope canary 5%"
```

Hold each stage long enough to cover normal ingest, authenticated summary, and
public-card traffic. Suggested stages are 5%, 25%, 50%, and 100%. Gradual
deployment is safe here only because both versions receive v1 clients during
the canary.

## 5. Canary acceptance checks

- Error and exception rate does not regress.
- v1 ingest remains accepted.
- `summary` cache-hit logs report `rows_loaded: 1`.
- Summary misses stay within 90 daily rows per ordinary one-device user plus the
  fixed legacy-transition tail and a small monthly set. Warm hits read one row.
- Ingest logs show one changed usage row per changed v2 day and zero changed
  usage rows for an equal revision.
- No ingest request triggers card generation.
- R2 card requests regenerate only after the one-hour interval.
- `rows_read`, `rows_written`, R2 Class A, and Worker requests remain below the
  release budget for at least one full active-day cycle.

Worker Logs are enabled at 1% head sampling. Structured events contain aggregate
operation counts and no user, device, prompt, repository, or token credential.

Emergency load-shedding variables default to `true`:

- `V2_INGEST_ENABLED=false` returns a retryable 503 so clients retain their outbox.
- `CARD_REGENERATION_ENABLED=false` serves existing R2 cards without starting
  stale rebuilds and rejects only missing-card generation.
- `COMPACTION_ENABLED=false` stops read-triggered background retention work.

Apply a switch through a new forward-compatible Worker Version; do not route v2
clients to the old v1-only Worker.

## 6. Client rollout and compatibility tail

After the Worker is at 100%, release v2 clients gradually. Keep v1 ingestion
available while old clients age out. The initial backfill covers legacy data
older than the fixed cutoff. The Worker deliberately keeps reading legacy rows
from that fixed cutoff rather than moving the boundary each day; this prevents
all-time totals from silently losing an unrolled day, but the compatibility read
set will remain until a final rollup. Before retiring v1, either:

- run a reviewed final legacy rollup and then retire v1, or
- implement the bounded legacy compactor described in the architecture plan.

Do not drop `usage_buckets` or `usage_events` during the initial rollout.

## 7. Ranking publication

Rank is never calculated on a card request. After enough active users have
populated `user_totals`, preview one explicit materialization pass:

```bash
npm run worker:rankings -- --print-sql
```

Then publish it only after reviewing the measured scan/write budget:

```bash
npm run worker:rankings -- \
  --execute-remote \
  --confirm-database=tokensburned
```

Until this runs, cards show ranking as pending. Do not schedule it daily until
its real `rows_read` and `rows_written` cost is measured; the initial rollout
uses explicit publication rather than putting another recurring global job on
the free tier.

## 8. Rollback

- Before v2 client release: route 100% traffic back to the recorded old Worker
  version. Additive D1 tables can remain.
- After v2 client release: pause the client release and ship a forward-compatible
  Worker fix. Rolling back to a v1-only Worker would reject v2 uploads.
- For data corruption only: stop writes, confirm the recorded D1 bookmark and
  blast radius, then explicitly approve a Time Travel restore.

References: [Cloudflare gradual deployments](https://developers.cloudflare.com/workers/versions-and-deployments/gradual-deployments/), [D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/), and [Workers Logs sampling](https://developers.cloudflare.com/workers/observability/logs/workers-logs/).
