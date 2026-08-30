import { HttpError } from "./http.js";
import { identifyDimensions } from "./identity.js";

export const BUCKET_SECONDS = 15 * 60;
const MAX_ENTRIES = 100;
const MAX_TOKENS = 1_000_000_000_000;
const DIMENSION = /^[a-z0-9][a-z0-9._-]{0,63}$/;

function integer(value, field, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new HttpError(400, "invalid_payload", `${field} must be an integer between ${min} and ${max}.`);
  }
  return parsed;
}

function dimension(value, field, fallback = "unknown") {
  const normalized = String(value ?? fallback).trim().toLowerCase();
  if (!DIMENSION.test(normalized)) {
    throw new HttpError(400, "invalid_payload", `${field} is invalid.`);
  }
  return normalized;
}

function text(value, field, { fallback = "unknown", max = 160 } = {}) {
  const normalized = String(value ?? fallback).trim();
  if (!normalized || normalized.length > max || /[\u0000-\u001f]/.test(normalized)) {
    throw new HttpError(400, "invalid_payload", `${field} is invalid.`);
  }
  return normalized;
}

export function currentBucket(now = Date.now()) {
  return Math.floor(now / 1000 / BUCKET_SECONDS);
}

export function normalizeEntry(raw, now = Date.now()) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new HttpError(400, "invalid_payload", "Each entry must be an object.");
  }
  const bucket = integer(raw.bucket, "bucket");
  const present = currentBucket(now);
  if (bucket < present - 96 * 90 || bucket > present + 1) {
    throw new HttpError(400, "invalid_payload", "bucket must be within the last 90 days.");
  }
  const dimensions = identifyDimensions({
    harness: dimension(raw.harness, "harness"),
    provider: dimension(raw.provider, "provider"),
    model: text(raw.model, "model"),
  });
  return {
    bucket,
    session_id: text(raw.session ?? raw.session_id, "session", { max: 128 }),
    ...dimensions,
    revision: integer(raw.revision, "revision", { min: 1, max: 2_147_483_647 }),
    input_tokens: integer(raw.input ?? raw.input_tokens ?? 0, "input", { max: MAX_TOKENS }),
    output_tokens: integer(raw.output ?? raw.output_tokens ?? 0, "output", { max: MAX_TOKENS }),
    cache_read_tokens: integer(raw.cache_read ?? raw.cache_read_tokens ?? 0, "cache_read", { max: MAX_TOKENS }),
    cache_write_tokens: integer(raw.cache_write ?? raw.cache_write_tokens ?? 0, "cache_write", { max: MAX_TOKENS }),
    reasoning_tokens: integer(raw.reasoning ?? raw.reasoning_tokens ?? 0, "reasoning", { max: MAX_TOKENS }),
    request_count: integer(raw.requests ?? raw.request_count ?? 0, "requests", { max: 1_000_000 }),
  };
}

export function normalizeBatch(raw, now = Date.now()) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new HttpError(400, "invalid_payload", "Payload must be an object.");
  }
  if (raw.v !== 1) throw new HttpError(400, "unsupported_version", "Only protocol version 1 is supported.");
  if (!Array.isArray(raw.entries) || raw.entries.length === 0 || raw.entries.length > MAX_ENTRIES) {
    throw new HttpError(400, "invalid_payload", `entries must contain between 1 and ${MAX_ENTRIES} items.`);
  }
  return {
    version: 1,
    entries: raw.entries.map((entry) => normalizeEntry(entry, now)),
  };
}
