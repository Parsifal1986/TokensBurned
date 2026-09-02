import { HttpError } from "./http.js";
import {
  identifyDimensions,
  normalizeHarness,
  normalizeModel,
  normalizeProvider,
} from "./identity.js";

export const BUCKET_SECONDS = 15 * 60;
const MAX_ENTRIES = 100;
const MAX_DAYS = 20;
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

function tokenCounters(raw, prefix = "") {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  return {
    input_tokens: integer(source.input ?? source.input_tokens ?? 0, `${prefix}input`, { max: MAX_TOKENS }),
    output_tokens: integer(source.output ?? source.output_tokens ?? 0, `${prefix}output`, { max: MAX_TOKENS }),
    cache_read_tokens: integer(source.cache_read ?? source.cache_read_tokens ?? 0, `${prefix}cache_read`, { max: MAX_TOKENS }),
    cache_write_tokens: integer(source.cache_write ?? source.cache_write_tokens ?? 0, `${prefix}cache_write`, { max: MAX_TOKENS }),
    reasoning_tokens: integer(source.reasoning ?? source.reasoning_tokens ?? 0, `${prefix}reasoning`, { max: MAX_TOKENS }),
    request_count: integer(source.requests ?? source.request_count ?? 0, `${prefix}requests`, { max: 1_000_000 }),
  };
}

function addCounters(target, source) {
  for (const key of [
    "input_tokens", "output_tokens", "cache_read_tokens",
    "cache_write_tokens", "reasoning_tokens", "request_count",
  ]) target[key] += source[key];
}

function sameCounters(left, right) {
  return [
    "input_tokens", "output_tokens", "cache_read_tokens",
    "cache_write_tokens", "reasoning_tokens", "request_count",
  ].every((key) => left[key] === right[key]);
}

function totalTokens(counters) {
  return counters.input_tokens + counters.output_tokens + counters.cache_read_tokens
    + counters.cache_write_tokens + counters.reasoning_tokens;
}

function normalizeHours(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new HttpError(400, "invalid_payload", "hours must be an object.");
  }
  const hours = {};
  const totals = tokenCounters({});
  for (const [key, value] of Object.entries(raw)) {
    if (!/^(?:[01]\d|2[0-3])$/.test(key)) {
      throw new HttpError(400, "invalid_payload", "hours keys must be UTC hours from 00 through 23.");
    }
    const counters = tokenCounters(value, `hours.${key}.`);
    hours[key] = counters;
    addCounters(totals, counters);
  }
  return { hours, totals };
}

function normalizeDimensionMap(raw, kind, expectedTotal) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new HttpError(400, "invalid_payload", `dimensions.${kind} must be an object.`);
  }
  const normalized = {};
  for (const [rawKey, value] of Object.entries(raw)) {
    const key = kind === "harness"
      ? normalizeHarness(rawKey)
      : kind === "provider"
        ? normalizeProvider(rawKey)
        : normalizeModel(rawKey);
    const tokens = integer(
      typeof value === "object" && value !== null ? value.total_tokens : value,
      `dimensions.${kind}.${key}.total_tokens`,
      { max: MAX_TOKENS * 5 },
    );
    normalized[key] = (normalized[key] || 0) + tokens;
  }
  const actual = Object.values(normalized).reduce((sum, value) => sum + value, 0);
  if (actual !== expectedTotal) {
    throw new HttpError(400, "invalid_payload", `dimensions.${kind} must sum to the exact day token total.`);
  }
  return Object.fromEntries(Object.entries(normalized).map(([key, tokens]) => [
    key, { total_tokens: tokens },
  ]));
}

export function currentDay(now = Date.now()) {
  return Math.floor(now / 86_400_000);
}

export function normalizeDailyEnvelope(raw, now = Date.now()) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new HttpError(400, "invalid_payload", "Each day must be an object.");
  }
  const dayKey = String(raw.day || "");
  const parsedTime = /^\d{4}-\d{2}-\d{2}$/.test(dayKey)
    ? Date.parse(`${dayKey}T00:00:00.000Z`)
    : Number.NaN;
  const parsedDay = Number.isFinite(parsedTime)
    && new Date(parsedTime).toISOString().slice(0, 10) === dayKey
    ? parsedTime / 86_400_000
    : Number.NaN;
  const day = integer(parsedDay, "day");
  const present = currentDay(now);
  if (day < present - 90 || day > present) {
    throw new HttpError(400, "invalid_payload", "day must be within the last 90 UTC days.");
  }
  const counters = tokenCounters(raw);
  const { hours, totals: hourTotals } = normalizeHours(raw.hours);
  if (!sameCounters(counters, hourTotals)) {
    throw new HttpError(400, "invalid_payload", "hours must sum to the exact day counters.");
  }
  const expectedTotal = totalTokens(counters);
  const dimensions = raw.dimensions;
  if (!dimensions || typeof dimensions !== "object" || Array.isArray(dimensions)) {
    throw new HttpError(400, "invalid_payload", "dimensions must be an object.");
  }
  return {
    day,
    day_key: new Date(day * 86_400_000).toISOString().slice(0, 10),
    revision: integer(raw.revision, "revision", { min: 1, max: Number.MAX_SAFE_INTEGER }),
    ...counters,
    hours,
    dimensions: {
      harness: normalizeDimensionMap(dimensions.harness, "harness", expectedTotal),
      provider: normalizeDimensionMap(dimensions.provider, "provider", expectedTotal),
      model: normalizeDimensionMap(dimensions.model, "model", expectedTotal),
    },
  };
}

export function normalizeDailyBatch(raw, now = Date.now()) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new HttpError(400, "invalid_payload", "Payload must be an object.");
  }
  if (raw.v !== 2) throw new HttpError(400, "unsupported_version", "Only protocol version 2 is supported.");
  if (!Array.isArray(raw.days) || raw.days.length === 0 || raw.days.length > MAX_DAYS) {
    throw new HttpError(400, "invalid_payload", `days must contain between 1 and ${MAX_DAYS} items.`);
  }
  const days = raw.days.map((day) => normalizeDailyEnvelope(day, now));
  if (new Set(days.map((day) => day.day)).size !== days.length) {
    throw new HttpError(400, "invalid_payload", "days must not contain duplicate UTC dates.");
  }
  return { version: 2, days };
}
