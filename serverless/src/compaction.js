import { d1Meta, logMetric } from "./metrics.js";

const TOKEN_FIELDS = [
  "input_tokens",
  "output_tokens",
  "cache_read_tokens",
  "cache_write_tokens",
  "reasoning_tokens",
  "request_count",
];
const MAX_ROLLUP_ROWS = 40;

function records(result) {
  return result?.results || [];
}

function number(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseDimensions(value) {
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function mergeDimensions(target, source) {
  for (const kind of ["harness", "provider", "model"]) {
    target[kind] ||= {};
    for (const [key, value] of Object.entries(source?.[kind] || {})) {
      const tokens = typeof value === "object" ? number(value.total_tokens) : number(value);
      target[kind][key] = { total_tokens: number(target[kind][key]?.total_tokens) + tokens };
    }
  }
}

function monthForDay(day) {
  const date = new Date(day * 86_400_000);
  return date.getUTCFullYear() * 100 + date.getUTCMonth() + 1;
}

function emptyMonth(userId, month, now) {
  return {
    user_id: userId,
    month,
    source_through_day: -1,
    input_tokens: 0,
    output_tokens: 0,
    cache_read_tokens: 0,
    cache_write_tokens: 0,
    reasoning_tokens: 0,
    request_count: 0,
    dimensions: { harness: {}, provider: {}, model: {} },
    updated_at: now,
  };
}

export async function compactUserUsage(env, userId, now = Date.now()) {
  const today = Math.floor(now / 86_400_000);
  const hourlyCutoff = today - 30;
  const dailyCutoff = today - 90;
  const updatedAt = new Date(now).toISOString();

  const downsample = await env.DB.prepare(
    `UPDATE device_daily_usage
        SET hours_json = NULL, updated_at = ?
      WHERE hours_json IS NOT NULL
        AND day < ? AND day >= ?
        AND device_id IN (SELECT id FROM devices WHERE user_id = ?)`,
  ).bind(updatedAt, hourlyCutoff, dailyCutoff, userId).run();

  const eligibleResult = await env.DB.prepare(
    `SELECT usage.device_id, usage.day, usage.input_tokens,
            usage.output_tokens, usage.cache_read_tokens,
            usage.cache_write_tokens, usage.reasoning_tokens,
            usage.request_count, usage.dimensions_json
       FROM device_daily_usage usage
       JOIN devices device ON device.id = usage.device_id
      WHERE device.user_id = ? AND usage.day < ?
      ORDER BY usage.day, usage.device_id
      LIMIT ?`,
  ).bind(userId, dailyCutoff, MAX_ROLLUP_ROWS).all();
  const eligible = records(eligibleResult);
  if (eligible.length === 0) {
    const result = { downsampled: Number(downsample?.meta?.changes || 0), rolled_up: 0 };
    logMetric(env, "compaction", { ...result, ...d1Meta(downsample) });
    return result;
  }

  const touchedMonths = [...new Set(eligible.map((row) => monthForDay(number(row.day))))];
  const monthlyResult = await env.DB.prepare(
    `SELECT * FROM user_monthly_usage
      WHERE user_id = ? AND month IN (${touchedMonths.map(() => "?").join(", ")})`,
  ).bind(userId, ...touchedMonths).all();
  const months = new Map(records(monthlyResult).map((row) => [number(row.month), {
    ...row,
    dimensions: parseDimensions(row.dimensions_json),
  }]));
  const touched = new Set();
  for (const row of eligible) {
    const month = monthForDay(number(row.day));
    const target = months.get(month) || emptyMonth(userId, month, updatedAt);
    for (const field of TOKEN_FIELDS) target[field] = number(target[field]) + number(row[field]);
    mergeDimensions(target.dimensions, parseDimensions(row.dimensions_json));
    target.source_through_day = Math.max(number(target.source_through_day), number(row.day));
    target.updated_at = updatedAt;
    months.set(month, target);
    touched.add(month);
  }

  const statements = [...touched].map((month) => {
    const value = months.get(month);
    return env.DB.prepare(
      `INSERT INTO user_monthly_usage (
         user_id, month, source_through_day, input_tokens, output_tokens,
         cache_read_tokens, cache_write_tokens, reasoning_tokens, request_count,
         dimensions_json, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_id, month) DO UPDATE SET
         source_through_day = excluded.source_through_day,
         input_tokens = excluded.input_tokens,
         output_tokens = excluded.output_tokens,
         cache_read_tokens = excluded.cache_read_tokens,
         cache_write_tokens = excluded.cache_write_tokens,
         reasoning_tokens = excluded.reasoning_tokens,
         request_count = excluded.request_count,
         dimensions_json = excluded.dimensions_json,
         updated_at = excluded.updated_at`,
    ).bind(
      userId,
      month,
      value.source_through_day,
      value.input_tokens,
      value.output_tokens,
      value.cache_read_tokens,
      value.cache_write_tokens,
      value.reasoning_tokens,
      value.request_count,
      JSON.stringify(value.dimensions),
      value.updated_at,
    );
  });
  const predicates = eligible.map(() => "(device_id = ? AND day = ?)").join(" OR ");
  const bindings = eligible.flatMap((row) => [row.device_id, row.day]);
  statements.push(env.DB.prepare(
    `DELETE FROM device_daily_usage WHERE ${predicates}`,
  ).bind(...bindings));
  const rollupResults = await env.DB.batch(statements);
  const result = {
    downsampled: Number(downsample?.meta?.changes || 0),
    rolled_up: eligible.length,
  };
  logMetric(env, "compaction", {
    ...result,
    ...d1Meta([downsample, ...rollupResults]),
  });
  return result;
}

export const compactionInternals = { mergeDimensions, monthForDay };
