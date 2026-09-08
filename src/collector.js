import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { adapterFor } from "./adapters/index.js";
import { collectHistoryEntries } from "./history.js";
import { readOpenCodeUsage } from "./opencode-usage.js";
import { readConfig, readCredentials } from "./storage.js";
import { atomicWrite } from "./atomic-write.js";
import { API_ORIGIN, BURN_HOME, SERVER_OUTBOX_PATH, UPLOAD_INTERVAL_MS } from "./constants.js";
import { nextUploadAt, readOutbox, pendingEnvelopes, deferredEnvelopes, syncUsageEntries } from "./server-outbox.js";
import { isProcessAlive } from "./upload-worker.js";

export const COLLECTOR_SOURCES = ["codex", "claude-code", "opencode"];
export const COLLECT_INTERVAL_MS = 60_000;
export const COLLECTOR_LOCK = path.join(BURN_HOME, "collector.lock");
export const COLLECTOR_STATUS = path.join(BURN_HOME, "collector-status.json");
async function json(file) {
  try { return JSON.parse(await fs.readFile(file, "utf8")); } catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

export async function collectLocalUsage({ harnesses, now, previous = {}, historyImpl = collectHistoryEntries, openCodeImpl = readOpenCodeUsage } = {}) {
  const entries = [], errors = [], checkpoints = { ...previous };
  for (const harness of harnesses) {
    const last = Date.parse(previous[harness] || "");
    const days = Number.isFinite(last) ? Math.min(90, Math.max(2, Math.ceil((now - last) / 86_400_000) + 1)) : 2;
    try {
      if (harness === "opencode") entries.push(...await openCodeImpl({ now, days }));
      else {
        const adapter = adapterFor(harness);
        const backend = await adapter.detectBackend();
        const result = await historyImpl({ harnesses: [harness], now, days, backendByHarness: { [harness]: backend } });
        entries.push(...result.entries);
      }
      checkpoints[harness] = new Date(now).toISOString();
    } catch { errors.push(harness); } // Do not retain raw provider errors or paths.
  }
  return { entries, errors, checkpoints };
}

async function acquire(file, alive) {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const handle = await fs.open(file, "wx", 0o600);
      const token = randomUUID();
      await handle.writeFile(JSON.stringify({ pid: process.pid, token }));
      await handle.close();
      return token;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      let lock;
      try { lock = await json(file); } catch { lock = null; }
      const stat = await fs.stat(file).catch(() => null);
      // A new empty lock may still be being initialized by another process.
      if (Number.isInteger(lock?.pid) && lock.pid > 0 && alive(lock.pid) || stat && Date.now() - stat.mtimeMs < 30_000) throw new Error("Collector already running; do not start a second run.");
      await fs.unlink(file).catch(() => {});
    }
  }
  throw new Error("Collector lock is busy");
}

export async function runCollector({
  harnesses = COLLECTOR_SOURCES, signal, lockFile = COLLECTOR_LOCK, statusFile = COLLECTOR_STATUS,
  outboxFile = SERVER_OUTBOX_PATH, clock = Date.now, sleep = ms => delay(ms, undefined, { signal }),
  collectImpl = collectLocalUsage, configImpl = readConfig, credentialsImpl = readCredentials,
  fetchImpl, alive = isProcessAlive, onStatus = () => {}, maxCycles = Infinity,
} = {}) {
  if (!harnesses.length || harnesses.some(id => !COLLECTOR_SOURCES.includes(id))) throw new Error("Automatic collection supports codex, claude-code and OpenCode v1 SQLite only. Cursor/Aider do not yet have verified automatic sources.");
  const token = await acquire(lockFile, alive);
  let status = {}, nextCollect = 0;
  try {
    status = (await json(statusFile)) || {};
    for (let cycle = 0; cycle < maxCycles && !signal?.aborted; cycle++) {
      if ((await json(lockFile))?.token !== token) return { reason: "lost-lock" };
      const config = await configImpl(), credentials = await credentialsImpl();
      if (!config.server.enabled || !credentials.device_token) return { reason: "not-connected" };
      const now = clock();
      let entries = [], checkpoints = status.checkpoints;
      if (now >= nextCollect) {
        const result = await collectImpl({ harnesses, now, previous: status.checkpoints });
        entries = result.entries;
        checkpoints = result.checkpoints;
        status.source_errors = result.errors;
        nextCollect = now + COLLECT_INTERVAL_MS;
      }
      let uploadError = false;
      // Persist all collected data before advancing scan checkpoints or using
      // the network. A failed merge must be retried, never marked collected.
      await syncUsageEntries(entries, { outboxFile, now, upload: false });
      status.checkpoints = checkpoints;
      if (signal?.aborted) break;
      try {
        await syncUsageEntries([], { outboxFile, now: clock(), token: credentials.device_token,
          credentialApiOrigin: credentials.api_origin, devicePrivateKeyJwk: credentials.device_private_key_jwk,
          apiOrigin: config.server.api_origin || API_ORIGIN, fetchImpl });
      } catch { uploadError = true; } // Shared outbox persists retry/backoff.
      const box = await readOutbox(outboxFile), later = clock();
      const pending = pendingEnvelopes(box, later).length + deferredEnvelopes(box, later).length;
      const due = pending ? nextUploadAt(box, UPLOAD_INTERVAL_MS, later) : null;
      status = { ...status, running: true, run_id: token, pid: process.pid, harnesses, checked_at: new Date(later).toISOString(),
        pending_days: pending, upload_error: uploadError, next_upload_at: due === null ? null : new Date(Math.max(later, due)).toISOString() };
      await atomicWrite(statusFile, JSON.stringify(status) + "\n");
      onStatus(status);
      const next = Math.min(nextCollect, due === null ? Infinity : due);
      await sleep(Math.max(1000, Math.min(COLLECT_INTERVAL_MS, next - later)));
    }
    return { reason: signal?.aborted ? "stopped" : "complete" };
  } catch (error) {
    if (signal?.aborted && error.name === "AbortError") return { reason: "stopped" };
    throw error;
  } finally {
    if ((await json(lockFile))?.token === token) {
      await atomicWrite(statusFile, JSON.stringify({ ...status, running: false, stopped_at: new Date(clock()).toISOString() }) + "\n");
      await fs.unlink(lockFile);
    }
  }
}
