import { normalizeBatch } from "./protocol.js";

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

export async function ingestBatch(env, device, raw, now = Date.now()) {
  const batch = normalizeBatch(raw, now);
  const updatedAt = new Date(now).toISOString();
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
  statements.push(env.DB.prepare(
    "UPDATE devices SET last_seen_at = ? WHERE id = ?",
  ).bind(updatedAt, device.id));
  await env.DB.batch(statements);
  return {
    accepted: batch.entries.length,
    next_flush_after: 900,
  };
}

