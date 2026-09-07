import fs from "node:fs/promises";
import path from "node:path";
import { SERVER_OUTBOX_PATH } from "./constants.js";
import { uploadDailyEnvelopes } from "./server.js";
import { atomicWrite } from "./atomic-write.js";
import { incrementOwnCounter } from "./utils.js";

const COUNTERS = [
  "input_tokens",
  "output_tokens",
  "cache_read_tokens",
  "cache_write_tokens",
  "reasoning_tokens",
  "request_count",
];
const EMPTY_COUNTERS = Object.freeze(Object.fromEntries(COUNTERS.map((key) => [key, 0])));
const LOCK_STALE_MS = 30_000;
const MAX_DAY_AGE = 90;

function emptyOutbox(now = new Date()) {
  return {
    version: 1,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    last_successful_upload_at: null,
    sources: {},
    days: {},
  };
}

function count(value) {
  const number = Number(value || 0);
  return Number.isSafeInteger(number) && number >= 0 ? number : 0;
}

function clean(value, fallback, max) {
  const normalized = String(value || fallback)
    .trim()
    .toLowerCase()
    .replace(/[\s/]+/g, "-")
    .replace(/[^a-z0-9._:-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return (normalized || fallback).slice(0, max);
}

function cleanModel(value) {
  let normalized = String(value || "unknown")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._:/-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160) || "unknown";
  if (normalized.includes("/")) normalized = normalized.split("/").at(-1) || "unknown";
  return normalized;
}

function snapshot(entry) {
  const bucket = count(entry.bucket);
  const day = Math.floor(bucket / 96);
  const hour = Math.floor((bucket % 96) / 4);
  const harness = clean(entry.harness, "unknown", 64);
  const provider = clean(entry.provider, "unknown", 64);
  const model = cleanModel(entry.model);
  const session = String(entry.session ?? entry.session_id ?? "unknown").slice(0, 128);
  const counters = {
    input_tokens: count(entry.input ?? entry.input_tokens),
    output_tokens: count(entry.output ?? entry.output_tokens),
    cache_read_tokens: count(entry.cache_read ?? entry.cache_read_tokens),
    cache_write_tokens: count(entry.cache_write ?? entry.cache_write_tokens),
    reasoning_tokens: count(entry.reasoning ?? entry.reasoning_tokens),
    request_count: count(entry.requests ?? entry.request_count),
  };
  return {
    key: [session, bucket, harness, model].join("\u0000"),
    value: {
      bucket,
      day,
      hour,
      session,
      harness,
      provider,
      model,
      revision: Math.max(1, count(entry.revision)),
      ...counters,
    },
  };
}

function addCounters(target, source) {
  for (const key of COUNTERS) target[key] += source[key];
}

function tokenTotal(value) {
  return value.input_tokens + value.output_tokens + value.cache_read_tokens
    + value.cache_write_tokens + value.reasoning_tokens;
}

function addDimension(target, key, tokens) {
  incrementOwnCounter(target, key, tokens);
}

// Must not exceed MAX_DIMENSIONS_PER_KIND in the Worker's src/protocol.js (32);
// a larger map makes the whole upload fail with 400 too_many_dimensions (B2).
export const MAX_DIMENSIONS_PER_KIND = 32;

function boundedDimensions(values, maximum = MAX_DIMENSIONS_PER_KIND) {
  const entries = Object.entries(values).sort((left, right) => right[1] - left[1]);
  if (entries.length <= maximum) return Object.fromEntries(entries);
  const kept = entries.slice(0, maximum - 1);
  const remainder = entries.slice(maximum - 1)
    .reduce((sum, [, value]) => sum + value, 0);
  const existingOther = kept.findIndex(([key]) => key === "other");
  if (existingOther >= 0) kept[existingOther][1] += remainder;
  else kept.push(["other", remainder]);
  return Object.fromEntries(kept);
}

function selectedSources(outbox, day) {
  const sources = Object.values(outbox.sources).filter((source) => source.day === day);
  const identified = new Set(sources
    .filter((source) => source.model !== "unknown")
    .map((source) => [source.session, source.bucket, source.harness].join("\u0000")));
  return sources.filter((source) => source.model !== "unknown"
    || !identified.has([source.session, source.bucket, source.harness].join("\u0000")));
}

function buildDay(outbox, day, previous) {
  const counters = { ...EMPTY_COUNTERS };
  const hours = {};
  const dimensions = { harness: {}, provider: {}, model: {} };
  for (const source of selectedSources(outbox, day)) {
    addCounters(counters, source);
    const hour = String(source.hour).padStart(2, "0");
    hours[hour] ||= { ...EMPTY_COUNTERS };
    addCounters(hours[hour], source);
    const tokens = tokenTotal(source);
    addDimension(dimensions.harness, source.harness, tokens);
    addDimension(dimensions.provider, source.provider, tokens);
    addDimension(dimensions.model, source.model, tokens);
  }
  const wrappedDimensions = Object.fromEntries(Object.entries(dimensions).map(([kind, values]) => [
    kind,
    Object.fromEntries(Object.entries(boundedDimensions(values))
      .map(([key, total_tokens]) => [key, { total_tokens }])),
  ]));
  return {
    day: new Date(day * 86_400_000).toISOString().slice(0, 10),
    revision: Math.max(Number(previous?.revision || 0) + 1, Date.now()),
    acked_revision: Number(previous?.acked_revision || 0),
    ...counters,
    hours,
    dimensions: wrappedDimensions,
  };
}

function comparableDay(day) {
  const { revision: _revision, acked_revision: _acked, ...value } = day || {};
  return JSON.stringify(value);
}

export function mergeSnapshotEntries(outbox, entries) {
  const affected = new Set();
  let changedSources = 0;
  for (const entry of entries) {
    const { key, value } = snapshot(entry);
    const previous = outbox.sources[key];
    if (previous && value.revision < previous.revision) continue;
    if (previous && JSON.stringify(previous) === JSON.stringify(value)) continue;
    outbox.sources[key] = value;
    affected.add(value.day);
    if (previous && previous.day !== value.day) affected.add(previous.day);
    changedSources += 1;
  }
  let changedDays = 0;
  for (const day of affected) {
    const key = new Date(day * 86_400_000).toISOString().slice(0, 10);
    const previous = outbox.days[key];
    const next = buildDay(outbox, day, previous);
    if (comparableDay(previous) === comparableDay(next)) continue;
    outbox.days[key] = next;
    changedDays += 1;
  }
  return { changedSources, changedDays };
}

function pendingByRevision(outbox) {
  return Object.values(outbox.days)
    .filter((day) => Number(day.revision) > Number(day.acked_revision || 0))
    // A day the server rejected as invalid stays parked at that revision so it
    // cannot poison later batches; any new local change (new revision) retries it.
    .filter((day) => Number(day.revision) !== Number(day.rejected_revision || 0))
    .sort((left, right) => left.day.localeCompare(right.day));
}

function retryAt(day) {
  const at = Date.parse(day.retry_at || "");
  return Number.isFinite(at) ? at : 0;
}

// Days that may be sent now: pending by revision and not inside a server
// deferral. Deferrals are per day because the Worker closes yesterday's write
// window for the rest of the UTC day while today stays writable every hour.
export function pendingEnvelopes(outbox, now = Date.now()) {
  return pendingByRevision(outbox)
    .filter((day) => retryAt(day) <= now)
    .map(({ acked_revision: _acked, rejected_revision: _rejected, rejected_code: _code, retry_at: _retry, ...day }) => day);
}

// Days still waiting for their server retry window.
export function deferredEnvelopes(outbox, now = Date.now()) {
  return pendingByRevision(outbox).filter((day) => retryAt(day) > now);
}

export function rejectEnvelopes(outbox, rejections) {
  let rejected = 0;
  for (const rejection of rejections || []) {
    if (!rejection || !Object.hasOwn(outbox.days, rejection.day)) continue;
    const day = outbox.days[rejection.day];
    if (!day || Number(day.revision) !== Number(rejection.revision)) continue;
    day.rejected_revision = Number(rejection.revision);
    day.rejected_code = String(rejection.code || "invalid_payload").slice(0, 64);
    rejected += 1;
  }
  return rejected;
}

// Only `acked_days` advance acknowledgements. Days the Worker reports in
// `throttled_days` (write window not yet open) are deliberately ignored here so
// they stay pending and are retried after `next_flush_after` seconds (C1).
export function acknowledgeEnvelopes(outbox, acknowledgements, uploadedAt = new Date()) {
  let acknowledged = 0;
  for (const acknowledgement of acknowledgements || []) {
    if (!acknowledgement || !Object.hasOwn(outbox.days, acknowledgement.day)) continue;
    const day = outbox.days[acknowledgement.day];
    if (!day) continue;
    const previous = Number(day.acked_revision || 0);
    day.acked_revision = Math.max(
      previous,
      Math.min(Number(day.revision), Number(acknowledgement.revision || 0)),
    );
    if (day.acked_revision > previous) {
      acknowledged += 1;
      delete day.retry_at;
    }
  }
  if (acknowledged > 0) outbox.last_successful_upload_at = uploadedAt.toISOString();
  return acknowledged;
}

export function deferOutbox(outbox, throttledDays, nextFlushAfter, now = Date.now()) {
  delete outbox.next_flush_at; // pre-0.6.8 global deferral
  let earliest = null;
  for (const throttled of Array.isArray(throttledDays) ? throttledDays : []) {
    if (!throttled || !Object.hasOwn(outbox.days, throttled.day)) continue;
    const day = outbox.days[throttled.day];
    if (!day || Number(day.revision) !== Number(throttled.revision)) continue;
    const seconds = Number(throttled.retry_after ?? nextFlushAfter);
    const delay = Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 86_400) : 3600;
    const at = now + delay * 1000;
    day.retry_at = new Date(at).toISOString();
    earliest = earliest === null ? at : Math.min(earliest, at);
  }
  return earliest === null ? null : new Date(earliest).toISOString();
}

// Earliest time the next upload may run. The Worker accepts one write per UTC
// window, so the client waits for the next window boundary after its last
// successful upload rather than a fixed spacing; when every pending day is
// deferred by the server, the earliest deferral decides instead.
export function nextUploadAt(outbox, windowMs, now = Date.now()) {
  const lastUpload = Date.parse(outbox.last_successful_upload_at || "");
  const boundary = Number.isFinite(lastUpload) ? (Math.floor(lastUpload / windowMs) + 1) * windowMs : 0;
  if (pendingEnvelopes(outbox, now).length > 0) return boundary;
  const deferred = deferredEnvelopes(outbox, now);
  if (deferred.length === 0) return boundary;
  return Math.max(boundary, Math.min(...deferred.map(retryAt)));
}

export function pruneOutbox(outbox, now = Date.now()) {
  const today = Math.floor(now / 86_400_000);
  const oldest = today - MAX_DAY_AGE;
  let sources = 0;
  let days = 0;
  for (const [key, source] of Object.entries(outbox.sources)) {
    if (source.day < oldest || source.day > today) {
      delete outbox.sources[key];
      sources += 1;
    }
  }
  for (const [key, day] of Object.entries(outbox.days)) {
    const parsed = Math.floor(Date.parse(`${day.day}T00:00:00.000Z`) / 86_400_000);
    if (!Number.isFinite(parsed) || parsed < oldest || parsed > today) {
      delete outbox.days[key];
      days += 1;
    }
  }
  return { sources, days };
}

export async function readOutbox(file) {
  try {
    const value = JSON.parse(await fs.readFile(file, "utf8"));
    if (value?.version !== 1 || !value.sources || !value.days) {
      throw new Error("unsupported server outbox format");
    }
    return value;
  } catch (error) {
    if (error?.code === "ENOENT") return emptyOutbox();
    throw error;
  }
}

async function acquireLock(file) {
  const lock = `${file}.lock`;
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const handle = await fs.open(lock, "wx", 0o600);
      return async () => {
        await handle.close();
        await fs.unlink(lock).catch(() => {});
      };
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      const stat = await fs.stat(lock).catch(() => null);
      if (stat && Date.now() - stat.mtimeMs > LOCK_STALE_MS) {
        await fs.unlink(lock).catch(() => {});
        continue;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  throw new Error("TokensBurned server outbox is busy. Try again shortly.");
}

async function mutateOutbox(file, callback) {
  const release = await acquireLock(file);
  try {
    const outbox = await readOutbox(file);
    const result = await callback(outbox);
    outbox.updated_at = new Date().toISOString();
    await atomicWrite(file, `${JSON.stringify(outbox, null, 2)}\n`);
    return result;
  } finally {
    await release();
  }
}

export async function resetOutboxAcknowledgements(outboxFile = SERVER_OUTBOX_PATH) {
  return mutateOutbox(outboxFile, async (outbox) => {
    for (const day of Object.values(outbox.days)) day.acked_revision = 0;
    outbox.last_successful_upload_at = null;
    // An upload started under the old connection must not acknowledge the new one.
    outbox.generation = Number(outbox.generation || 0) + 1;
  });
}

export async function syncUsageEntries(entries, {
  token,
  credentialApiOrigin,
  devicePrivateKeyJwk,
  apiOrigin,
  fetchImpl,
  timeoutMs,
  force = false,
  minIntervalMs = 60 * 60 * 1000,
  outboxFile = SERVER_OUTBOX_PATH,
  now = Date.now(),
} = {}) {
  const snapshot = await mutateOutbox(outboxFile, async (outbox) => {
    pruneOutbox(outbox, now);
    const merged = mergeSnapshotEntries(outbox, entries);
    pruneOutbox(outbox, now);
    const due = force || now >= nextUploadAt(outbox, minIntervalMs, now);
    const pending = pendingEnvelopes(outbox, now);
    const waiting = pendingByRevision(outbox).length;
    return { merged, due, waiting, days: due ? pending : [], generation: Number(outbox.generation || 0) };
  });
  if (!snapshot.due || snapshot.days.length === 0) {
    return { accepted: 0, deferred: snapshot.waiting, ...snapshot.merged };
  }
  const result = await uploadDailyEnvelopes(snapshot.days, {
    token,
    credentialApiOrigin,
    devicePrivateKeyJwk,
    apiOrigin,
    fetchImpl,
    timeoutMs,
  });
  await mutateOutbox(outboxFile, async (outbox) => {
    if (Number(outbox.generation || 0) === snapshot.generation) {
      acknowledgeEnvelopes(outbox, result.acked_days, new Date(now));
      rejectEnvelopes(outbox, result.rejected_days);
      deferOutbox(outbox, result.throttled_days, result.next_flush_after, now);
    }
  });
  return { ...result, ...snapshot.merged };
}

export const outboxInternals = { emptyOutbox, snapshot, buildDay };
