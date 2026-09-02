# TokensBurned Cloudflare cost model

Pricing snapshot: 2026-09-01
Architecture dependency: [daily-envelope aggregation and lazy SVG plan](./hourly-aggregation-lazy-svg.md)

This is a directional infrastructure model, not a Cloudflare quote. It intentionally exposes assumptions and ships with a reproducible calculator in [`cloudflare-cost-model.mjs`](./cloudflare-cost-model.mjs).

Run it from the repository root:

```bash
node plans/cloudflare-cost-model.mjs
```

## Official prices used

### Workers Paid

- Minimum account charge: $5/month.
- 10 million requests/month included; then $0.30/million.
- 30 million CPU milliseconds/month included; then $0.02/million CPU ms.
- Cache-served Worker requests still count as requests, but cache hits do not consume Worker CPU.

Source: [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)

### D1 on Workers Paid

- 25 billion rows read/month included; then $0.001/million rows.
- 50 million rows written/month included; then $1.00/million rows.
- 5 GB storage included; then $0.75/GB-month.
- Index mutations and deletes count as rows written.

Source: [Cloudflare D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/)

### R2 Standard

- 10 GB-month storage included; then $0.015/GB-month.
- 1 million Class A operations/month included; then $4.50/million.
- 10 million Class B operations/month included; then $0.36/million.
- Internet egress is free.
- R2 rounds billable operation usage up to the next million and storage to the next GB.

Source: [Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/)

## Typical active-user assumptions

| Variable | Assumption |
|---|---:|
| Active days/month | 20 |
| Coding hours/active day | 8 |
| Turns/hour | 12 |
| Default upload cadence | 1/hour + SessionEnd |
| Paid upload cadence | 15 minutes + SessionEnd |
| Additional changed SessionEnd flushes | 1/active day |
| Public SVG HTTP requests/month | 300 |
| Lazy SVG regenerations/month | 30 |
| Other API requests/month | 20 |
| Rows read by one optimized card rebuild | 100 |
| Canonical usage row | one device/UTC day |
| Estimated steady-state D1 storage/user | 100 KB |
| Estimated R2 card/summary storage/user | 15 KB |

The model assumes 90% default/free product users and 10% paid/low-latency product users. Product plan names are independent from the Cloudflare account's Workers Paid plan.

## Single-user model

### Default/free product user

- 160 scheduled hourly uploads plus 20 changed SessionEnd flushes/month; each
  changed upload updates one device/day row.
- 500 Worker requests/month, including 300 card requests.
- Approximately 3,620 D1 rows read/month.
- Approximately 342 D1 rows written/month in steady state.
- 30 R2 writes and 30 origin R2 reads/month.

The D1 write count includes device/day inserts and updates, one 30-day
downsample rewrite, eventual 90-day deletion and primary-key index removal,
monthly rollup, daily `last_seen_at` maintenance, and one `user_totals` plus one
cached-summary write per modeled SVG regeneration. It does not include a
separate per-upload dirty/version write.

### Paid/low-latency product user

- 1,920 turns are locally aggregated into 640 scheduled fifteen-minute uploads
  plus 20 changed SessionEnd flushes/month.
- 980 Worker requests/month.
- Approximately 5,060 D1 rows read/month.
- Approximately 822 D1 rows written/month.
- The same modeled 30 lazy card regenerations/month.

The primary paid-user cost increase is repeatedly updating the current
device/day row. Per-turn upload is deliberately excluded from the baseline; it
would add approximately 1,260 further usage-row updates per paid user-month.
SVG generation remains lazy and bounded.

## Workers Free account capacity

Workers Free currently allows:

- 100,000 Worker requests/day
- 5 million D1 rows read/day
- 100,000 D1 rows written/day

Under the modeled 90/10 user mix and evenly distributed traffic:

| Limit | Approximate modeled users before daily limit |
|---|---:|
| Worker requests | 5,470 |
| D1 rows read | 39,800 |
| D1 rows written | 7,690 |

Worker requests become the first modeled hard Free-plan limit. D1 writes are no
longer the first bottleneck, although bursts, retries, backfills, extra devices,
indexes, and uneven activity can consume the daily limit earlier. A production
service should still move to Workers Paid before reaching the theoretical
ceiling.

For comparison:

- 100% hourly/default users: roughly 8,770 modeled users before the D1 daily
  write limit and 6,000 before the Worker request limit.
- 100% 15-minute paid users: roughly 3,600 before the D1 daily write limit and
  3,060 before the Worker request limit.

## Paid-account scale scenarios

These estimates use a 90% default / 10% low-latency mix.

| Users | Worker requests/month | D1 reads/month | D1 writes/month | R2 SVG puts/month | Approx. monthly cost |
|---:|---:|---:|---:|---:|---:|
| 1,000 | 548K | 3.76M | 390K | 30K | $5 |
| 10,000 | 5.48M | 37.64M | 3.90M | 300K | $5 |
| 100,000 | 54.80M | 376.40M | 39.00M | 3.00M | about $32 |
| 1,000,000 | 548.00M | 3.76B | 390.00M | 30.00M | about $728 |

Approximate 100,000-user cost composition:

| Component | Cost/month |
|---|---:|
| Workers base | $5.00 |
| Worker requests | $13.50 |
| Worker CPU | about $0.70 |
| D1 reads | $0.00, inside 25B included |
| D1 writes | $0.00, inside 50M included |
| D1 storage | about $3.75 |
| R2 Class A writes | $9.00 |
| R2 Class B reads | $0.00 |
| R2 storage | $0.00 |

Approximate 1,000,000-user cost composition:

| Component | Cost/month |
|---|---:|
| Workers base | $5.00 |
| Worker requests | about $161.40 |
| Worker CPU | about $12.32 |
| D1 reads | $0.00, inside 25B included |
| D1 writes | about $340 |
| D1 storage | about $71.25 |
| R2 Class A writes | about $130.50 |
| R2 Class B reads | about $7.20 |
| R2 storage | less than $1 |

## What grows with users

The modeled included-usage thresholds are approximately:

| Included allowance exhausted | Approximate users |
|---|---:|
| Workers 10M requests/month | 18,200 |
| D1 50M rows written/month | 128,000 |
| D1 5 GB storage | 50,000 |
| R2 1M Class A operations/month | 33,300 |
| R2 10 GB storage | 666,000 |
| D1 25B rows read/month | 6,640,000 |

This explains the revised cost curve: the service remains close to the $5 base
charge at small scale, then Worker requests, R2 card regenerations, and storage
grow. D1 write overage begins much later than in the hourly-row model, and D1
read overage is not reached in the one-million-user scenario.

After all included allowances are exhausted, the model's approximate marginal infrastructure cost is:

| Product usage policy | Marginal cost/user-month |
|---|---:|
| Hourly/default user | about $0.00073 |
| 15-minute/low-latency user | about $0.00137 |
| 90/10 blended user | about $0.00079 |

These are infrastructure costs under the stated behavior assumptions, not suggested product prices. Support, payment processing, abuse, monitoring, backups, taxes, and engineering operations are not included.

The current production-preparation config enables Workers Logs at 1% head
sampling. At the modeled 90/10 mix this remains inside the Paid plan's included
log volume through the 1-million-user scenario, but log overage is not included
in the table. The model also excludes a future exact ranking materialization job;
its cadence must be priced before rank publication is enabled.

### Controlled but important: D1 rows written

The device/day design removes D1 writes as the first modeled Free-plan limit and
keeps 100,000 modeled users inside the Paid plan's included 50 million monthly
writes. Mutation count still matters at larger scale. Each changed upload
updates the same current-day row, and every update remains billable even though
the key is unchanged.

The strongest cost controls are:

- Keep local aggregation even for paid users.
- Use a 15-minute paid upload default; meter any future per-turn mode separately.
- Do not update `devices.last_seen_at`, dirty flags, daily totals, and multiple summary rows after every turn.
- Keep exact totals in ordinary columns and bounded hour/dimension maps in JSON.
- Downsample each day in place after 30 days, then roll it into a month after 90 days.
- Remove unused indexes and measure actual `rows_written` metadata before launch.
- Count retention deletes in the budget.

### Secondary: Worker request count

Public SVG traffic and paid uploads grow Worker requests linearly. The request price is low relative to D1 writes, but very popular public cards can make request volume larger than user count predicts.

If a future architecture can serve fresh public SVGs directly from an R2 custom domain without invoking the application Worker on CDN hits, the Worker request component can fall substantially. Lazy version checks and privacy enforcement must remain correct.

### Secondary: R2 Class A operations

Every regenerated SVG is one Class A operation. Lazy generation keeps this proportional to cards that are both requested and stale. With no card request, the modeled Class A usage is zero regardless of token uploads.

### Small: D1 reads and storage

With the proposed read model, a typical summary regeneration reads at most about
90 device/day rows plus a few monthly, totals, and state rows. D1's 25-billion
included monthly reads are therefore large relative to expected usage. Storage
is also small because hourly slots and dimensions are packed into bounded daily
payloads rather than raw turn records.

## Sensitivity

The result is most sensitive to:

1. Paid upload cadence, paid-user share, and devices per user.
2. Actual D1 insert/update/delete index costs from the final schema.
3. Public SVG request volume and cache topology.
4. Serialized device/day payload size and dimension cardinality.
5. Card regenerations, not raw card views.

The model should be recalibrated with production `meta.rows_read`, `meta.rows_written`, Worker analytics, `CF-Cache-Status`, and R2 Class A/B metrics after the first implementation.

### Pre-rollout production baseline

Cloudflare D1 metadata on 2026-09-01, before this architecture was deployed,
reported:

| Metric | Previous 24 hours |
|---|---:|
| Read queries | 2,227 |
| Rows read | 13,887,647 |
| Average rows/read query | about 6,237 |
| Write queries | 4,551 |
| Rows written | 14,194 |
| Database size | 1.9 MB |

The account hit free-tier error `7500` and even read-only migration-status SQL
was rejected for the remainder of the UTC day. This baseline is the value the
post-rollout canary must beat; request count alone hid the amplification.

## Required validation before relying on the numbers

- Run representative local/preview D1 writes and record actual `rows_written` for insert, update, and retention delete.
- Verify one typical single-device summary cache miss stays below 250 rows read.
- Test concurrent updates to the same device/day and prove an older revision
  cannot overwrite a newer absolute snapshot.
- Measure serialized day payload sizes and enforce the 64 KB target and 256 KB hard limit.
- Verify retrying an acknowledged revision produces no aggregate mutation and no card invalidation.
- Load-test a popular card with concurrent TTL expiry and confirm one regeneration lease winner.
- Verify CDN hits do not produce R2 reads or Worker CPU, and measure whether they still count as Worker requests in the selected serving topology.
- Measure the actual serialized D1 row and index storage per user after 30 and 90 days.
