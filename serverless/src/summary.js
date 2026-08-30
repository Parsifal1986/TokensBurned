import { currentBucket } from "./protocol.js";

const UNION = `WITH snapshot_rows AS (
  SELECT d.user_id, b.bucket, b.session_id, b.harness, b.provider, b.model,
         b.input_tokens, b.output_tokens, b.cache_read_tokens,
         b.cache_write_tokens, b.reasoning_tokens, b.request_count,
         ROW_NUMBER() OVER (
           PARTITION BY d.user_id, b.bucket, b.session_id, b.harness, b.model
           ORDER BY b.revision DESC, b.updated_at DESC
         ) AS row_number
    FROM usage_buckets b JOIN devices d ON d.id = b.device_id
), snapshots AS (
  SELECT user_id, bucket, harness, provider, model,
         input_tokens, output_tokens, cache_read_tokens,
         cache_write_tokens, reasoning_tokens, request_count
    FROM snapshot_rows selected
   WHERE row_number = 1
     AND (
       model <> 'unknown'
       OR NOT EXISTS (
         SELECT 1 FROM snapshot_rows identified
          WHERE identified.user_id = selected.user_id
            AND identified.bucket = selected.bucket
            AND identified.session_id = selected.session_id
            AND identified.harness = selected.harness
            AND identified.model <> 'unknown'
            AND identified.row_number = 1
       )
     )
), all_usage AS (
  SELECT user_id, bucket, harness, provider, model,
         input_tokens, output_tokens, cache_read_tokens,
         cache_write_tokens, reasoning_tokens, request_count
    FROM snapshots
  UNION ALL
  SELECT d.user_id, e.bucket, e.harness, e.provider, e.model,
         e.input_tokens, e.output_tokens, e.cache_read_tokens,
         e.cache_write_tokens, e.reasoning_tokens, e.request_count
    FROM usage_events e JOIN devices d ON d.id = e.device_id
   WHERE NOT EXISTS (
     SELECT 1 FROM snapshots s
      WHERE s.user_id = d.user_id
        AND s.bucket = e.bucket
        AND s.harness = e.harness
   )
)`;

const TOTAL = `(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens + reasoning_tokens)`;

function records(result) {
  return result?.results || [];
}

function dimensionQuery(dimension) {
  return `${UNION}
    SELECT ${dimension} AS key, SUM(${TOTAL}) AS tokens
      FROM all_usage WHERE user_id = ? AND bucket >= ?
     GROUP BY ${dimension} ORDER BY tokens DESC LIMIT 5`;
}

function fillDaily(rows, endDay, count = 84) {
  const lookup = new Map(rows.map((row) => [Number(row.day), Number(row.tokens || 0)]));
  return Array.from({ length: count }, (_, index) => {
    const day = endDay - count + index + 1;
    return {
      date: new Date(day * 86_400_000).toISOString().slice(0, 10),
      tokens: lookup.get(day) || 0,
    };
  });
}

function fillHourly(rows) {
  const lookup = new Map(rows.map((row) => [Number(row.hour), Number(row.tokens || 0)]));
  return Array.from({ length: 24 }, (_, hour) => ({ hour, tokens: lookup.get(hour) || 0 }));
}

function mapped(result) {
  return records(result).map((row) => ({ key: row.key, tokens: Number(row.tokens || 0) }));
}

export async function summarizeUser(env, userId, now = Date.now()) {
  const present = currentBucket(now);
  const dayStart = present - 24 * 4;
  const weekStart = present - 7 * 24 * 4;
  const monthStart = present - 30 * 24 * 4;
  const endDay = Math.floor(now / 86_400_000);
  const heatStart = (endDay - 83) * 96;

  const totals = env.DB.prepare(`${UNION}
    SELECT COALESCE(SUM(${TOTAL}), 0) AS all_time,
           COALESCE(SUM(CASE WHEN bucket >= ? THEN ${TOTAL} ELSE 0 END), 0) AS day,
           COALESCE(SUM(CASE WHEN bucket >= ? THEN ${TOTAL} ELSE 0 END), 0) AS week,
           COALESCE(SUM(CASE WHEN bucket >= ? THEN ${TOTAL} ELSE 0 END), 0) AS month,
           COALESCE(SUM(CASE WHEN bucket >= ? THEN request_count ELSE 0 END), 0) AS requests
      FROM all_usage WHERE user_id = ?`).bind(dayStart, weekStart, monthStart, monthStart, userId);
  const byHarness = env.DB.prepare(dimensionQuery("harness")).bind(userId, monthStart);
  const byProvider = env.DB.prepare(dimensionQuery("provider")).bind(userId, monthStart);
  const byModel = env.DB.prepare(dimensionQuery("model")).bind(userId, monthStart);
  const daily = env.DB.prepare(`${UNION}
    SELECT CAST(bucket / 96 AS INTEGER) AS day, SUM(${TOTAL}) AS tokens
      FROM all_usage WHERE user_id = ? AND bucket >= ?
     GROUP BY CAST(bucket / 96 AS INTEGER) ORDER BY day`).bind(userId, heatStart);
  const hourly = env.DB.prepare(`${UNION}
    SELECT CAST((bucket % 96) / 4 AS INTEGER) AS hour, SUM(${TOTAL}) AS tokens
      FROM all_usage WHERE user_id = ? AND bucket >= ?
     GROUP BY CAST((bucket % 96) / 4 AS INTEGER) ORDER BY hour`).bind(userId, monthStart);
  const ranking = env.DB.prepare(`${UNION}, user_totals AS (
    SELECT user_id, SUM(${TOTAL}) AS tokens FROM all_usage GROUP BY user_id
  ), ranked AS (
    SELECT user_id, tokens, RANK() OVER (ORDER BY tokens DESC) AS rank,
           COUNT(*) OVER () AS participants FROM user_totals
  ) SELECT rank, participants FROM ranked WHERE user_id = ?`).bind(userId);

  const [totalsResult, harnessResult, providerResult, modelResult, dailyResult, hourlyResult, rankResult] =
    await env.DB.batch([totals, byHarness, byProvider, byModel, daily, hourly, ranking]);
  const value = records(totalsResult)[0] || {};
  const rank = records(rankResult)[0] || {};
  return {
    day_tokens: Number(value.day || 0),
    week_tokens: Number(value.week || 0),
    month_tokens: Number(value.month || 0),
    all_time_tokens: Number(value.all_time || 0),
    month_requests: Number(value.requests || 0),
    week_requests: Number(value.requests || 0),
    by_harness: mapped(harnessResult),
    by_provider: mapped(providerResult),
    by_model: mapped(modelResult),
    daily: fillDaily(records(dailyResult), endDay),
    hourly: fillHourly(records(hourlyResult)),
    rank: Number(rank.rank || 0),
    participants: Number(rank.participants || 0),
    generated_at: new Date(now).toISOString(),
  };
}
