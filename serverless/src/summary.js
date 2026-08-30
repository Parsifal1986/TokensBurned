import { currentBucket } from "./protocol.js";

const UNION = `WITH all_usage AS (
  SELECT d.user_id, b.bucket, b.harness, b.provider, b.model,
         b.input_tokens, b.output_tokens, b.cache_read_tokens,
         b.cache_write_tokens, b.reasoning_tokens, b.request_count
    FROM usage_buckets b JOIN devices d ON d.id = b.device_id
  UNION ALL
  SELECT d.user_id, e.bucket, e.harness, e.provider, e.model,
         e.input_tokens, e.output_tokens, e.cache_read_tokens,
         e.cache_write_tokens, e.reasoning_tokens, e.request_count
    FROM usage_events e JOIN devices d ON d.id = e.device_id
)`;

const TOTAL = `(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens + reasoning_tokens)`;

function records(result) {
  return result?.results || [];
}

export async function summarizeUser(env, userId, now = Date.now()) {
  const weekStart = currentBucket(now) - 7 * 24 * 4;
  const total = env.DB.prepare(`${UNION}
    SELECT COALESCE(SUM(${TOTAL}), 0) AS all_time,
           COALESCE(SUM(CASE WHEN bucket >= ? THEN ${TOTAL} ELSE 0 END), 0) AS week,
           COALESCE(SUM(CASE WHEN bucket >= ? THEN request_count ELSE 0 END), 0) AS requests
      FROM all_usage WHERE user_id = ?`).bind(weekStart, weekStart, userId);
  const byHarness = env.DB.prepare(`${UNION}
    SELECT harness AS key, SUM(${TOTAL}) AS tokens
      FROM all_usage WHERE user_id = ? AND bucket >= ?
     GROUP BY harness ORDER BY tokens DESC LIMIT 5`).bind(userId, weekStart);
  const byProvider = env.DB.prepare(`${UNION}
    SELECT provider AS key, SUM(${TOTAL}) AS tokens
      FROM all_usage WHERE user_id = ? AND bucket >= ?
     GROUP BY provider ORDER BY tokens DESC LIMIT 5`).bind(userId, weekStart);
  const byModel = env.DB.prepare(`${UNION}
    SELECT model AS key, SUM(${TOTAL}) AS tokens
      FROM all_usage WHERE user_id = ? AND bucket >= ?
     GROUP BY model ORDER BY tokens DESC LIMIT 5`).bind(userId, weekStart);
  const [totalsResult, harnessResult, providerResult, modelResult] = await env.DB.batch([
    total, byHarness, byProvider, byModel,
  ]);
  const totals = records(totalsResult)[0] || { all_time: 0, week: 0, requests: 0 };
  return {
    all_time_tokens: Number(totals.all_time || 0),
    week_tokens: Number(totals.week || 0),
    week_requests: Number(totals.requests || 0),
    by_harness: records(harnessResult).map((row) => ({ key: row.key, tokens: Number(row.tokens) })),
    by_provider: records(providerResult).map((row) => ({ key: row.key, tokens: Number(row.tokens) })),
    by_model: records(modelResult).map((row) => ({ key: row.key, tokens: Number(row.tokens) })),
    generated_at: new Date(now).toISOString(),
  };
}

