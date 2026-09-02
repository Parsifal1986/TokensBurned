import { logMetric } from "./metrics.js";
import { currentBucket } from "./protocol.js";

const TOKEN_FIELDS = [
  "input_tokens",
  "output_tokens",
  "cache_read_tokens",
  "cache_write_tokens",
  "reasoning_tokens",
];

const DAILY_SQL = `SELECT u.day, u.input_tokens, u.output_tokens,
                          u.cache_read_tokens, u.cache_write_tokens,
                          u.reasoning_tokens, u.request_count,
                          u.hours_json, u.dimensions_json, u.updated_at
                     FROM device_daily_usage u
                     JOIN devices d ON d.id = u.device_id
                    WHERE d.user_id = ? AND u.day >= ?`;

const LEGACY_SQL = `WITH user_devices AS (
  SELECT id FROM devices WHERE user_id = ?
), snapshot_rows AS (
  SELECT b.device_id, b.bucket, b.session_id, b.harness, b.provider, b.model,
         b.input_tokens, b.output_tokens, b.cache_read_tokens,
         b.cache_write_tokens, b.reasoning_tokens, b.request_count,
         ROW_NUMBER() OVER (
           PARTITION BY b.bucket, b.session_id, b.harness, b.model
           ORDER BY b.revision DESC, b.updated_at DESC
         ) AS row_number
    FROM usage_buckets b
    JOIN user_devices d ON d.id = b.device_id
   WHERE b.bucket >= ?
     AND NOT EXISTS (
       SELECT 1 FROM device_daily_usage daily
        WHERE daily.device_id = b.device_id
          AND daily.day = CAST(b.bucket / 96 AS INTEGER)
     )
), snapshots AS (
  SELECT device_id, bucket, session_id, harness, provider, model,
         input_tokens, output_tokens, cache_read_tokens,
         cache_write_tokens, reasoning_tokens, request_count
    FROM snapshot_rows WHERE row_number = 1
), selected_snapshots AS (
  SELECT selected.* FROM snapshots selected
   WHERE selected.model <> 'unknown'
      OR NOT EXISTS (
        SELECT 1 FROM snapshots identified
         WHERE identified.bucket = selected.bucket
           AND identified.session_id = selected.session_id
           AND identified.harness = selected.harness
           AND identified.model <> 'unknown'
      )
)
SELECT bucket, harness, provider, model, input_tokens, output_tokens,
       cache_read_tokens, cache_write_tokens, reasoning_tokens, request_count
  FROM selected_snapshots
UNION ALL
SELECT e.bucket, e.harness, e.provider, e.model, e.input_tokens, e.output_tokens,
       e.cache_read_tokens, e.cache_write_tokens, e.reasoning_tokens, e.request_count
  FROM usage_events e
  JOIN user_devices d ON d.id = e.device_id
 WHERE e.bucket >= ?
   AND NOT EXISTS (
     SELECT 1 FROM device_daily_usage daily
      WHERE daily.device_id = e.device_id
        AND daily.day = CAST(e.bucket / 96 AS INTEGER)
   )
   AND NOT EXISTS (
     SELECT 1 FROM selected_snapshots snapshot
      WHERE snapshot.bucket = e.bucket AND snapshot.harness = e.harness
   )`;

const MONTHLY_SQL = `SELECT month, input_tokens, output_tokens,
                            cache_read_tokens, cache_write_tokens,
                            reasoning_tokens, request_count, dimensions_json,
                            updated_at
                       FROM user_monthly_usage
                      WHERE user_id = ?`;

const RANK_SQL = `SELECT rank, participants FROM user_rankings WHERE user_id = ?`;
const SUMMARY_CACHE_TTL_MS = 60 * 60 * 1000;
const SUMMARY_CACHE_VERSION = 2;

function records(result) {
  return result?.results || [];
}

function number(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function tokens(row) {
  return TOKEN_FIELDS.reduce((sum, key) => sum + number(row[key]), 0);
}

function parseJson(value) {
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function increment(record, key, value) {
  record[key] = (record[key] || 0) + number(value);
}

function addDimensions(target, dimensions) {
  for (const kind of ["harness", "provider", "model"]) {
    for (const [key, value] of Object.entries(dimensions?.[kind] || {})) {
      increment(target[kind], key, typeof value === "object" ? value.total_tokens : value);
    }
  }
}

function top(record) {
  return Object.entries(record)
    .map(([key, value]) => ({ key, tokens: number(value) }))
    .sort((left, right) => right.tokens - left.tokens)
    .slice(0, 5);
}

function fillDaily(values, endDay, count = 84) {
  return Array.from({ length: count }, (_, index) => {
    const day = endDay - count + index + 1;
    return {
      date: new Date(day * 86_400_000).toISOString().slice(0, 10),
      tokens: number(values[day]),
    };
  });
}

function fillHourly(values) {
  return Array.from({ length: 24 }, (_, hour) => ({ hour, tokens: number(values[hour]) }));
}

function emptyAccumulator() {
  return {
    allTime: 0,
    day: 0,
    week: 0,
    month: 0,
    weekRequests: 0,
    monthRequests: 0,
    counters: Object.fromEntries([...TOKEN_FIELDS, "request_count"].map((key) => [key, 0])),
    daily: {},
    hourly: {},
    dimensions: { harness: {}, provider: {}, model: {} },
  };
}

function boundsFor(now) {
  const present = currentBucket(now);
  const today = Math.floor(now / 86_400_000);
  const currentHour = Math.floor(present / 4);
  return {
    today,
    bucket: {
      dayStart: present - 96,
      weekStart: present - 7 * 96,
      monthStart: present - 30 * 96,
    },
    // V2 envelopes are intentionally hourly. These windows therefore contain
    // the current UTC hour plus the preceding 23/167/719 complete hour slots.
    hourly: {
      dayStart: currentHour - 23,
      weekStart: currentHour - 167,
      monthStart: currentHour - 719,
    },
    daily: {
      dayStart: today - 1,
      weekStart: today - 7,
      monthStart: today - 30,
    },
  };
}

function addAllTime(accumulator, row) {
  const value = tokens(row);
  for (const key of [...TOKEN_FIELDS, "request_count"]) {
    accumulator.counters[key] += number(row[key]);
  }
  accumulator.allTime += value;
  return value;
}

function addWindow(accumulator, row, position, { dayStart, weekStart, monthStart }) {
  const value = tokens(row);
  if (position >= dayStart) accumulator.day += value;
  if (position >= weekStart) {
    accumulator.week += value;
    accumulator.weekRequests += number(row.request_count);
  }
  if (position >= monthStart) {
    accumulator.month += value;
    accumulator.monthRequests += number(row.request_count);
  }
}

function addDailyRows(accumulator, rows, bounds) {
  for (const row of rows) {
    const day = number(row.day);
    const value = addAllTime(accumulator, row);
    increment(accumulator.daily, day, value);
    const hours = parseJson(row.hours_json);
    const hourEntries = Object.entries(hours);
    if (hourEntries.length > 0) {
      for (const [hour, hourValue] of hourEntries) {
        const hourNumber = number(hour);
        const absoluteHour = day * 24 + hourNumber;
        addWindow(accumulator, hourValue, absoluteHour, bounds.hourly);
        if (absoluteHour >= bounds.hourly.monthStart) {
          increment(accumulator.hourly, hourNumber, tokens(hourValue));
        }
      }
    } else {
      // Rows within the recent window normally retain hours_json. Fall back to
      // UTC-day granularity so a malformed or manually imported row is not lost.
      addWindow(accumulator, row, day, bounds.daily);
    }
    if (day >= bounds.daily.monthStart) {
      addDimensions(accumulator.dimensions, parseJson(row.dimensions_json));
    }
  }
}

function addLegacyRows(accumulator, rows, bounds) {
  for (const row of rows) {
    const day = Math.floor(number(row.bucket) / 96);
    const bucket = number(row.bucket);
    const value = addAllTime(accumulator, row);
    addWindow(accumulator, row, bucket, bounds.bucket);
    increment(accumulator.daily, day, value);
    if (bucket >= bounds.bucket.monthStart) {
      increment(accumulator.dimensions.harness, row.harness || "unknown", value);
      increment(accumulator.dimensions.provider, row.provider || "unknown", value);
      increment(accumulator.dimensions.model, row.model || "unknown", value);
      increment(accumulator.hourly, Math.floor((number(row.bucket) % 96) / 4), value);
    }
  }
}

function addMonthlyRows(accumulator, rows) {
  for (const row of rows) {
    addAllTime(accumulator, row);
  }
}

async function cachedSummary(env, userId, now) {
  const cached = await env.DB.prepare(
    `SELECT summary_json, generated_at FROM user_summaries WHERE user_id = ?`,
  ).bind(userId).first();
  const generatedAt = Date.parse(cached?.generated_at || "");
  if (!cached || !Number.isFinite(generatedAt) || now - generatedAt >= SUMMARY_CACHE_TTL_MS) {
    return null;
  }
  try {
    const payload = JSON.parse(cached.summary_json);
    return payload?.cache_version === SUMMARY_CACHE_VERSION ? payload.summary : null;
  } catch {
    return null;
  }
}

export async function summarizeUser(env, userId, now = Date.now(), state = null) {
  const cached = await cachedSummary(env, userId, now);
  if (cached) {
    if (state) state.cache = "hit";
    logMetric(env, "summary", { cache: "hit", rows_loaded: 1 });
    return cached;
  }
  if (state) state.cache = "miss";

  const bounds = boundsFor(now);
  const today = bounds.today;
  const oldestDay = today - 90;
  const configuredLegacyDay = Number(env.LEGACY_ROLLUP_CUTOFF_DAY);
  const legacyStartDay = Number.isSafeInteger(configuredLegacyDay) && configuredLegacyDay >= 0
    ? Math.min(oldestDay, configuredLegacyDay)
    : oldestDay;
  const oldestBucket = legacyStartDay * 96;
  const [dailyResult, legacyResult, monthlyResult] = await env.DB.batch([
    env.DB.prepare(DAILY_SQL).bind(userId, oldestDay),
    env.DB.prepare(LEGACY_SQL).bind(userId, oldestBucket, oldestBucket),
    env.DB.prepare(MONTHLY_SQL).bind(userId),
  ]);
  const accumulator = emptyAccumulator();
  addMonthlyRows(accumulator, records(monthlyResult));
  addDailyRows(accumulator, records(dailyResult), bounds);
  addLegacyRows(accumulator, records(legacyResult), bounds);
  logMetric(env, "summary", {
    cache: "miss",
    daily_rows: records(dailyResult).length,
    legacy_rows: records(legacyResult).length,
    monthly_rows: records(monthlyResult).length,
  });
  const updatedAt = new Date(now).toISOString();
  const [totalsResult, rankResult] = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO user_totals (
         user_id, through_day, input_tokens, output_tokens, cache_read_tokens,
         cache_write_tokens, reasoning_tokens, request_count, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_id) DO UPDATE SET
         through_day = excluded.through_day,
         input_tokens = excluded.input_tokens,
         output_tokens = excluded.output_tokens,
         cache_read_tokens = excluded.cache_read_tokens,
         cache_write_tokens = excluded.cache_write_tokens,
         reasoning_tokens = excluded.reasoning_tokens,
         request_count = excluded.request_count,
         updated_at = excluded.updated_at`,
    ).bind(
      userId,
      today,
      accumulator.counters.input_tokens,
      accumulator.counters.output_tokens,
      accumulator.counters.cache_read_tokens,
      accumulator.counters.cache_write_tokens,
      accumulator.counters.reasoning_tokens,
      accumulator.counters.request_count,
      updatedAt,
    ),
    env.DB.prepare(RANK_SQL).bind(userId),
  ]);
  void totalsResult;
  const rank = records(rankResult)[0] || {};
  const summary = {
    day_tokens: accumulator.day,
    week_tokens: accumulator.week,
    month_tokens: accumulator.month,
    all_time_tokens: accumulator.allTime,
    month_requests: accumulator.monthRequests,
    week_requests: accumulator.weekRequests,
    by_harness: top(accumulator.dimensions.harness),
    by_provider: top(accumulator.dimensions.provider),
    by_model: top(accumulator.dimensions.model),
    daily: fillDaily(accumulator.daily, today),
    hourly: fillHourly(accumulator.hourly),
    rank: number(rank.rank),
    participants: number(rank.participants),
    generated_at: updatedAt,
  };
  await env.DB.prepare(
    `INSERT INTO user_summaries (
       user_id, source_updated_at, summary_json, generated_at
     ) VALUES (?, ?, ?, ?)
     ON CONFLICT (user_id) DO UPDATE SET
       source_updated_at = excluded.source_updated_at,
       summary_json = excluded.summary_json,
       generated_at = excluded.generated_at`,
  ).bind(
    userId,
    summary.generated_at,
    JSON.stringify({ cache_version: SUMMARY_CACHE_VERSION, summary }),
    summary.generated_at,
  ).run();
  return summary;
}

export const summaryInternals = {
  addDailyRows,
  addLegacyRows,
  addMonthlyRows,
  boundsFor,
  emptyAccumulator,
  legacySql: LEGACY_SQL,
};
