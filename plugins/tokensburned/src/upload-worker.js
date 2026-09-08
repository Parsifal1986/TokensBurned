import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { API_ORIGIN, BURN_HOME, SERVER_OUTBOX_PATH, UPLOAD_INTERVAL_MS } from "./constants.js";
import { deferredEnvelopes, nextUploadAt, pendingEnvelopes, readOutbox, syncUsageEntries } from "./server-outbox.js";
import { readConfig, readCredentials } from "./storage.js";

// A single short-lived process that waits for the server's upload window and
// flushes the outbox once, then exits. Hooks fire only while the user is
// active, so without it the last data of a session could sit locally until the
// next activity. It is not a daemon: at most one exists per BURN_HOME, it lives
// for at most one window (plus server-requested deferrals, capped below), and
// it disappears as soon as nothing is pending.
export const WORKER_LOCK_PATH = path.join(BURN_HOME, "upload-worker.json");
export const WORKER_MAX_LIFETIME_MS = 2 * 60 * 60 * 1000;
const WORKER_STALE_GRACE_MS = 10 * 60 * 1000;
const MAX_SLEEP_MS = 60 * 1000; // Re-read local plan changes promptly; this does not poll the server.
const BIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "bin", "burn.js");

export function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

// A lock is live while its process exists and its planned upload time has not
// slipped far into the past (a worker that is asleep past its plan by more
// than the grace period is treated as wedged and replaced).
export function isWorkerLockActive(lock, { now = Date.now(), alive = isProcessAlive } = {}) {
  if (!lock || !Number.isInteger(lock.pid) || lock.pid <= 0) return false;
  const fireAt = Date.parse(lock.fire_at || "");
  if (Number.isFinite(fireAt) && now > fireAt + WORKER_STALE_GRACE_MS) return false;
  return alive(lock.pid);
}

async function readLock(file) {
  try {
    const value = JSON.parse(await fs.readFile(file, "utf8"));
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
}

function spawnWorker(env) {
  const child = spawn(process.execPath, [BIN, "upload-worker"], {
    detached: true,
    stdio: "ignore",
    env,
  });
  child.unref();
  return child;
}

export async function ensureUploadWorker({
  outboxFile = SERVER_OUTBOX_PATH,
  lockFile = WORKER_LOCK_PATH,
  now = Date.now(),
  env = process.env,
  spawnImpl = spawnWorker,
  alive = isProcessAlive,
} = {}) {
  const outbox = await readOutbox(outboxFile);
  if (pendingEnvelopes(outbox, now).length === 0 && deferredEnvelopes(outbox, now).length === 0) {
    return { spawned: false, reason: "nothing-pending" };
  }
  const fireAt = Math.max(now, nextUploadAt(outbox, UPLOAD_INTERVAL_MS, now));
  // A server deferral further away than a worker may live (e.g. a closed
  // write window until midnight UTC) is left to a later hook instead.
  if (fireAt - now > WORKER_MAX_LIFETIME_MS) return { spawned: false, reason: "too-far", fireAt };
  await fs.mkdir(path.dirname(lockFile), { recursive: true, mode: 0o700 });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let handle;
    try {
      handle = await fs.open(lockFile, "wx", 0o600);
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      const existing = await readLock(lockFile);
      if (isWorkerLockActive(existing, { now, alive })) {
        return { spawned: false, reason: "active", pid: existing.pid, fireAt: Date.parse(existing.fire_at || "") };
      }
      await fs.unlink(lockFile).catch(() => {});
      continue;
    }
    try {
      const child = spawnImpl(env);
      await handle.writeFile(`${JSON.stringify({
        pid: child.pid,
        fire_at: new Date(fireAt).toISOString(),
        spawned_at: new Date(now).toISOString(),
      })}\n`);
      return { spawned: true, pid: child.pid, fireAt };
    } finally {
      await handle.close();
    }
  }
  return { spawned: false, reason: "busy" };
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runUploadWorker({
  outboxFile = SERVER_OUTBOX_PATH,
  lockFile = WORKER_LOCK_PATH,
  clock = Date.now,
  sleep = wait,
  maxLifetimeMs = WORKER_MAX_LIFETIME_MS,
  fetchImpl,
} = {}) {
  const started = clock();
  const pid = process.pid;
  try {
    while (clock() - started < maxLifetimeMs) {
      const lock = await readLock(lockFile);
      if (lock?.pid !== pid) return { reason: "lost-lock" };
      const outbox = await readOutbox(outboxFile);
      const now = clock();
      if (pendingEnvelopes(outbox, now).length === 0 && deferredEnvelopes(outbox, now).length === 0) {
        return { reason: "nothing-pending" };
      }
      const due = nextUploadAt(outbox, UPLOAD_INTERVAL_MS, now);
      if (due - now > maxLifetimeMs - (now - started)) return { reason: "too-far" };
      if (now < due) {
        // Keep the plan visible to spawners, then sleep in bounded steps so a
        // machine that slept through the window re-checks promptly on wake.
        await fs.writeFile(lockFile, `${JSON.stringify({ ...lock, fire_at: new Date(due).toISOString() })}\n`, { mode: 0o600 });
        await sleep(Math.min(due - now, MAX_SLEEP_MS));
        continue;
      }
      const config = await readConfig();
      const credentials = await readCredentials();
      if (!config.server.enabled || !credentials.device_token) return { reason: "not-connected" };
      const before = outbox.last_successful_upload_at || null;
      const sendable = pendingEnvelopes(outbox, now).length;
      await syncUsageEntries([], {
        token: credentials.device_token,
        credentialApiOrigin: credentials.api_origin,
        devicePrivateKeyJwk: credentials.device_private_key_jwk,
        apiOrigin: config.server.api_origin || API_ORIGIN,
        fetchImpl,
        force: false,
        minIntervalMs: UPLOAD_INTERVAL_MS,
        outboxFile,
        now: clock(),
      });
      const after = await readOutbox(outboxFile);
      const later = clock();
      if (pendingEnvelopes(after, later).length === 0 && deferredEnvelopes(after, later).length === 0) {
        return { reason: "nothing-pending" };
      }
      // Progress means the server acknowledged something or deferred a day
      // (which drops it out of the sendable set until its retry window).
      const progressed = (after.last_successful_upload_at || null) !== before
        || pendingEnvelopes(after, later).length < sendable;
      // Nothing acknowledged and no deferral: retrying now would spin. Leave it
      // to the next hook rather than hammering the server.
      if (!progressed) return { reason: "no-progress" };
      // Otherwise loop: waits for the deferral, then tries again.
    }
    return { reason: "lifetime" };
  } catch (error) {
    // Network or auth trouble: give up quietly; the next hook spawns a fresh worker.
    return { reason: "error", error };
  } finally {
    const lock = await readLock(lockFile);
    if (lock?.pid === pid) await fs.unlink(lockFile).catch(() => {});
  }
}
