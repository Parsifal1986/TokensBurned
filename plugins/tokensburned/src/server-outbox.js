import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
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
    key: entry.observation_id ? `observation\u0000${entry.observation_id}` : [session, bucket, harness, model].join("\u0000"),
    value: {
      ...(entry.observation_id ? { observation_id: entry.observation_id, observation_hash: entry.observation_hash } : {}),
      ...(entry.harness === "cline" && entry.cline_usage_scope && entry.cline_usage_detail ? {
        cline_usage_scope: entry.cline_usage_scope, cline_usage_detail: entry.cline_usage_detail,
      } : {}),
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

// Bound attribution metadata while preserving totals in an overflow category.
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
  // Validate the whole observation batch before changing any source. Immutable
  // request identities survive restarts, provider/model changes and bucket moves.
  const observations = new Map();
  for (const entry of entries) {
    if (!entry.observation_id) continue;
    if (!/^[a-f0-9]{64}$/.test(entry.observation_id) || !/^[a-f0-9]{64}$/.test(entry.observation_hash || "")) {
      throw new Error("Invalid usage observation identity.");
    }
    const { key, value } = snapshot(entry);
    const previous = observations.get(key) || outbox.sources[key];
    const clineCompatible = previous && compatibleClineDetail(previous, value);
    if (previous && JSON.stringify(previous) !== JSON.stringify(value) && !clineCompatible) {
      throw new Error("Conflicting usage for an existing request id; no observations were imported.");
    }
    observations.set(key, clineCompatible && value.cline_usage_detail === "output-total" && previous.cline_usage_detail !== "output-total" ? previous : value);
  }
  const affected = new Set();
  let changedSources = 0;
  for (const entry of entries) {
    const parsed = snapshot(entry);
    const key = parsed.key, value = entry.observation_id ? observations.get(key) : parsed.value;
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

// Cline's official persistence codec drops reasoning detail, not output tokens.
// This narrowly permits a richer partition of the same request; general imports
// and two contradictory detailed observations remain immutable.
function compatibleClineDetail(previous, next) {
  if (next.harness !== "cline" || !/^[a-f0-9]{64}$/.test(next.cline_usage_scope || "")) return false;
  if (!["reported", "output-total"].includes(next.cline_usage_detail)) return false;
  if (previous.cline_usage_scope) {
    if (previous.cline_usage_scope !== next.cline_usage_scope) return false;
    if (previous.cline_usage_detail !== "output-total" && next.cline_usage_detail !== "output-total") return false;
  } else if (previous.observation_hash === next.observation_hash) {
    return true; // Add detail metadata to an otherwise identical pre-upgrade row.
  } else if (next.cline_usage_detail !== "output-total") return false;
  for (const key of ["observation_id", "session", "bucket", "harness", "provider", "model", "input_tokens", "cache_read_tokens", "cache_write_tokens", "request_count"]) {
    if (previous[key] !== next[key]) return false;
  }
  return previous.output_tokens + previous.reasoning_tokens === next.output_tokens + next.reasoning_tokens;
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

// Keep pending days queued until their individual retry times have passed.
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

// Only `acked_days` advance acknowledgements. Days the response lists in
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

export function uploadWindowMs(outbox, fallback = 3_600_000, now = Date.now()) {
  const plan = outbox.plan;
  return plan?.id === "pro_preview" && plan.upload_interval_seconds === 300
    && Date.parse(plan.expires_at || "") > now ? 300_000 : fallback;
}

function normalizedPlan(plan, now) {
  return plan?.id === "pro_preview" && plan.upload_interval_seconds === 300
    && Date.parse(plan.expires_at || "") > now
    ? { id: "pro_preview", upload_interval_seconds: 300, expires_at: new Date(plan.expires_at).toISOString() }
    : { id: "free", upload_interval_seconds: 3600, expires_at: null };
}

export async function rememberServerPlan(plan, outboxFile = SERVER_OUTBOX_PATH, now = Date.now()) {
  return mutateOutbox(outboxFile, async (outbox) => { outbox.plan = normalizedPlan(plan, now); });
}

// Earliest time the next upload may run. The client waits for the next UTC
// window boundary after its last
// successful upload rather than a fixed spacing; when every pending day is
// deferred by the server, the earliest deferral decides instead.
export function nextUploadAt(outbox, windowMs, now = Date.now()) {
  windowMs = uploadWindowMs(outbox, windowMs, now);
  const retry = Date.parse(outbox.upload_retry_at || "") || 0;
  const inflight = Date.parse(outbox.upload_lease_until || "") || 0;
  const serverNext = Date.parse(outbox.server_next_upload_at || "") || 0;
  const blockedUntil = Math.max(retry, inflight, serverNext);
  const lastUpload = Date.parse(outbox.last_successful_upload_at || "");
  const boundary = Number.isFinite(lastUpload) ? (Math.floor(lastUpload / windowMs) + 1) * windowMs : 0;
  if (pendingEnvelopes(outbox, now).length > 0) return Math.max(boundary, blockedUntil);
  const deferred = deferredEnvelopes(outbox, now);
  if (deferred.length === 0) return Math.max(boundary, blockedUntil);
  return Math.max(boundary, blockedUntil, Math.min(...deferred.map(retryAt)));
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
    delete outbox.plan;
    delete outbox.server_next_upload_at;
    delete outbox.upload_retry_at;
    delete outbox.upload_lease_until;
    delete outbox.upload_lease_id;
    delete outbox.upload_failures;
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
  upload = true,
  minIntervalMs = 60 * 60 * 1000,
  outboxFile = SERVER_OUTBOX_PATH,
  now = Date.now(),
} = {}) {
  const snapshot = await mutateOutbox(outboxFile, async (outbox) => {
    pruneOutbox(outbox, now);
    const merged = mergeSnapshotEntries(outbox, entries);
    pruneOutbox(outbox, now);
    // All callers, including legacy callers passing force, share this gate.
    const due = upload && now >= nextUploadAt(outbox, minIntervalMs, now);
    const pending = pendingEnvelopes(outbox, now);
    const waiting = pendingByRevision(outbox).length;
    const leaseId = due && pending.length ? randomUUID() : null;
    if (leaseId) {
      outbox.upload_lease_until = new Date(now + 10 * 60_000).toISOString();
      outbox.upload_lease_id = leaseId;
    }
    return { merged, due, waiting, leaseId, days: due ? pending : [], generation: Number(outbox.generation || 0) };
  });
  if (!snapshot.due || snapshot.days.length === 0) {
    return { accepted: 0, deferred: snapshot.waiting, ...snapshot.merged };
  }
  let result;
  try {
    result = await uploadDailyEnvelopes(snapshot.days, {
      token,
      credentialApiOrigin,
      devicePrivateKeyJwk,
      apiOrigin,
      fetchImpl,
      timeoutMs,
    });
  } catch (error) {
    await mutateOutbox(outboxFile, async (outbox) => {
      if (Number(outbox.generation || 0) !== snapshot.generation || outbox.upload_lease_id !== snapshot.leaseId) return;
      delete outbox.upload_lease_until;
      delete outbox.upload_lease_id;
      outbox.upload_failures = Math.min(7, Number(outbox.upload_failures || 0) + 1);
      const backoff = Math.min(3_600_000, 60_000 * 2 ** (outbox.upload_failures - 1));
      const requested = Date.parse(error.retry_at || "") || 0;
      // Persist across hooks/processes; force uploads must also obey failures.
      outbox.upload_retry_at = new Date(Math.max(now + backoff, Math.min(requested, now + 86_400_000))).toISOString();
    });
    throw error;
  }
  await mutateOutbox(outboxFile, async (outbox) => {
    if (Number(outbox.generation || 0) === snapshot.generation && outbox.upload_lease_id === snapshot.leaseId) {
      delete outbox.upload_lease_until;
      delete outbox.upload_lease_id;
      delete outbox.upload_retry_at;
      outbox.upload_failures = 0;
      outbox.plan = normalizedPlan(result.plan, now);
      acknowledgeEnvelopes(outbox, result.acked_days, new Date(now));
      // A successful batch can specify a longer wait than the local UTC
      // boundary. Mixed/throttled responses carry per-day waits instead.
      const seconds = Number(result.next_flush_after);
      const serverNext = now + seconds * 1000;
      if (!result.throttled_days.length && result.acked_days.length
        && Number.isFinite(seconds) && seconds > 0 && Number.isFinite(new Date(serverNext).getTime())) {
        outbox.server_next_upload_at = new Date(Math.max(
          Date.parse(outbox.server_next_upload_at || "") || 0, serverNext,
        )).toISOString();
      }
      // Even a malformed/empty acknowledgement must not create a tight loop.
      if (!result.acked_days.length && !result.throttled_days.length) {
        outbox.upload_retry_at = new Date(now + 60_000).toISOString();
      }
      rejectEnvelopes(outbox, result.rejected_days);
      deferOutbox(outbox, result.throttled_days, result.next_flush_after, now);
    }
  });
  return { ...result, ...snapshot.merged };
}

export const outboxInternals = { emptyOutbox, snapshot, buildDay };
