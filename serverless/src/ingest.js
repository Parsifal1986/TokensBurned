import { normalizeBatch, normalizeDailyBatch } from "./protocol.js";
import { d1Meta, logMetric } from "./metrics.js";

const UPSERT = `INSERT INTO usage_buckets (
  device_id, bucket, session_id, harness, provider, model, revision,
  input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
  reasoning_tokens, request_count, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (device_id, bucket, session_id, harness, provider, model)
DO UPDATE SET
  revision = excluded.revision,
  input_tokens = excluded.input_tokens,
  output_tokens = excluded.output_tokens,
  cache_read_tokens = excluded.cache_read_tokens,
  cache_write_tokens = excluded.cache_write_tokens,
  reasoning_tokens = excluded.reasoning_tokens,
  request_count = excluded.request_count,
  updated_at = excluded.updated_at
WHERE excluded.revision > usage_buckets.revision`;

const UPSERT_DAILY = `INSERT INTO device_daily_usage (
  device_id, day, revision, input_tokens, output_tokens, cache_read_tokens,
  cache_write_tokens, reasoning_tokens, request_count, hours_json,
  dimensions_json, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (device_id, day)
DO UPDATE SET
  revision = excluded.revision,
  input_tokens = excluded.input_tokens,
  output_tokens = excluded.output_tokens,
  cache_read_tokens = excluded.cache_read_tokens,
  cache_write_tokens = excluded.cache_write_tokens,
  reasoning_tokens = excluded.reasoning_tokens,
  request_count = excluded.request_count,
  hours_json = excluded.hours_json,
  dimensions_json = excluded.dimensions_json,
  updated_at = excluded.updated_at
WHERE excluded.revision > device_daily_usage.revision`;

function lastSeenStatement(env, deviceId, updatedAt, dayStart) {
  return env.DB.prepare(
    `UPDATE devices SET last_seen_at = ?
      WHERE id = ? AND (last_seen_at IS NULL OR last_seen_at < ?)`,
  ).bind(updatedAt, deviceId, dayStart);
}

async function ingestDailyBatch(env, device, raw, now) {
  const batch = normalizeDailyBatch(raw, now);
  const updatedAt = new Date(now).toISOString();
  const dayStart = new Date(Math.floor(now / 86_400_000) * 86_400_000).toISOString();
  const statements = batch.days.map((day) => env.DB.prepare(UPSERT_DAILY).bind(
    device.id,
    day.day,
    day.revision,
    day.input_tokens,
    day.output_tokens,
    day.cache_read_tokens,
    day.cache_write_tokens,
    day.reasoning_tokens,
    day.request_count,
    JSON.stringify(day.hours),
    JSON.stringify(day.dimensions),
    updatedAt,
  ));
  statements.push(lastSeenStatement(env, device.id, updatedAt, dayStart));
  const results = await env.DB.batch(statements);
  const changed = results.slice(0, batch.days.length)
    .reduce((sum, result) => sum + Number(result?.meta?.changes || 0), 0);
  logMetric(env, "ingest", {
    protocol: 2,
    received: batch.days.length,
    changed,
    ignored: batch.days.length - changed,
    ...d1Meta(results),
  });
  return {
    accepted: batch.days.length,
    received: batch.days.length,
    changed,
    ignored: batch.days.length - changed,
    acked_days: batch.days.map((day) => ({ day: day.day_key, revision: day.revision })),
    next_flush_after: 3600,
  };
}

export async function ingestBatch(env, device, raw, now = Date.now()) {
  if (raw?.v === 2) return ingestDailyBatch(env, device, raw, now);
  const batch = normalizeBatch(raw, now);
  const updatedAt = new Date(now).toISOString();
  const dayStart = new Date(Math.floor(now / 86_400_000) * 86_400_000).toISOString();
  const statements = batch.entries.map((entry) => env.DB.prepare(UPSERT).bind(
    device.id,
    entry.bucket,
    entry.session_id,
    entry.harness,
    entry.provider,
    entry.model,
    entry.revision,
    entry.input_tokens,
    entry.output_tokens,
    entry.cache_read_tokens,
    entry.cache_write_tokens,
    entry.reasoning_tokens,
    entry.request_count,
    updatedAt,
  ));
  statements.push(lastSeenStatement(env, device.id, updatedAt, dayStart));
  const results = await env.DB.batch(statements);
  const changed = results.slice(0, batch.entries.length)
    .reduce((sum, result) => sum + Number(result?.meta?.changes || 0), 0);
  logMetric(env, "ingest", {
    protocol: 1,
    received: batch.entries.length,
    changed,
    ignored: batch.entries.length - changed,
    ...d1Meta(results),
  });
  return {
    accepted: batch.entries.length,
    received: batch.entries.length,
    changed,
    ignored: batch.entries.length - changed,
    next_flush_after: 3600,
  };
}
