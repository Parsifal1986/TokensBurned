import { createHash } from "node:crypto";

const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const COUNTERS = ["input_tokens", "output_tokens", "cache_read_tokens", "cache_write_tokens", "reasoning_tokens"];

// Cloud imports are finalized request deltas, never cumulative session totals.
// All five counters are mutually exclusive; convert provider-specific usage first.
export function usageObservation(raw, { harness, provider = "unknown", model = "unknown", now = Date.now() } = {}) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Usage observation must be an object.");
  if (typeof raw.id !== "string" || !raw.id.trim() || raw.id.length > 512) throw new Error("Cloud import requires a stable request id (1–512 characters).");
  if (raw.usage_semantics !== "exclusive-delta") throw new Error('Cloud import requires usage_semantics: "exclusive-delta"; cumulative counters are not supported.');
  if (typeof raw.timestamp !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(raw.timestamp)) {
    throw new Error("Cloud import requires an explicit timestamp with a timezone.");
  }
  const timestamp = Date.parse(raw.timestamp);
  const [year, month, date] = raw.timestamp.slice(0, 10).split("-").map(Number);
  if (month < 1 || month > 12 || date < 1 || date > new Date(Date.UTC(year, month, 0)).getUTCDate()) throw new Error("Usage has an invalid calendar date.");
  const day = Math.floor(timestamp / 86_400_000), today = Math.floor(now / 86_400_000);
  if (!Number.isFinite(timestamp) || day < today - 90 || timestamp > now) throw new Error("Usage must be within the last 90 UTC days and not in the future.");
  const harnessId = raw.harness?.id ?? raw.harness_id ?? harness;
  if (typeof harnessId !== "string" || !/^[a-z0-9][a-z0-9._-]{0,63}$/.test(harnessId)) throw new Error("Cloud import requires a valid harness id.");
  const providerId = raw.backend?.provider ?? provider;
  const modelId = raw.backend?.resolved_model ?? raw.backend?.reported_model ?? raw.backend?.model ?? model;
  if (typeof providerId !== "string" || !/^[a-z0-9][a-z0-9._:-]{0,63}$/.test(providerId)) throw new Error("Invalid provider id.");
  if (typeof modelId !== "string" || !modelId.trim() || modelId.length > 160 || /[\u0000-\u001f]/.test(modelId)) throw new Error("Invalid model id.");
  if (!raw.usage || typeof raw.usage !== "object" || Array.isArray(raw.usage)) throw new Error("Cloud import requires canonical usage counters.");
  const usage = {};
  // Unknown usage fields are rejected so provider aliases cannot silently vanish.
  if (Object.keys(raw.usage).some((key) => !COUNTERS.includes(key))) throw new Error("Use canonical exclusive token counters for cloud import; provider usage aliases must be converted first.");
  for (const key of COUNTERS) {
    const value = raw.usage[key] ?? 0;
    if (!Number.isSafeInteger(value) || value < 0 || value > 1_000_000_000_000) throw new Error(`Invalid ${key}; expected an integer from 0 to 1,000,000,000,000.`);
    usage[key] = value;
  }
  const total = Object.values(usage).reduce((sum, value) => sum + value, 0);
  if (!Number.isSafeInteger(total) || total === 0) throw new Error("Usage observation must contain a positive, safe token total.");
  const requests = raw.request_count ?? 1;
  if (!Number.isSafeInteger(requests) || requests < 0 || requests > 1_000_000) throw new Error("Invalid request_count.");
  const id = hash([harnessId, raw.id]);
  const fingerprint = hash([new Date(timestamp).toISOString(), harnessId, providerId, modelId, usage, requests]);
  return {
    observation_id: id,
    observation_hash: fingerprint,
    session: id,
    bucket: Math.floor(timestamp / 900_000),
    harness: harnessId,
    provider: providerId,
    model: modelId,
    revision: 1,
    ...usage,
    requests,
  };
}
