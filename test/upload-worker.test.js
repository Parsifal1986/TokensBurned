import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// BURN_HOME must be fixed before the modules compute their paths.
const home = await fs.mkdtemp(path.join(os.tmpdir(), "burn-worker-unit-"));
process.env.BURN_HOME = home;
const { ensureUploadWorker, isWorkerLockActive, runUploadWorker } = await import("../src/upload-worker.js");
const { nextUploadAt } = await import("../src/server-outbox.js");

const HOUR = 60 * 60 * 1000;

function outboxWith({ lastUpload, nextFlush, pending = true, now = Date.now() } = {}) {
  const day = new Date(now).toISOString().slice(0, 10);
  return {
    version: 1,
    sources: {},
    days: pending
      ? { [day]: { day, revision: 7, acked_revision: 3, input_tokens: 1, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0, reasoning_tokens: 0, request_count: 1, hours: {}, dimensions: { harness: {}, provider: {}, model: {} }, ...(nextFlush ? { retry_at: new Date(nextFlush).toISOString() } : {}) } }
      : {},
    last_successful_upload_at: lastUpload ? new Date(lastUpload).toISOString() : null,
  };
}

test("nextUploadAt waits for the next UTC window boundary, or the deferral when only deferred days remain", () => {
  const now = 1_800_000_000_000; // exactly on an hour boundary
  assert.equal(nextUploadAt(outboxWith({ now }), HOUR, now), 0, "never uploaded: due immediately");
  assert.equal(nextUploadAt(outboxWith({ lastUpload: now, now }), HOUR, now), now + HOUR);
  assert.equal(nextUploadAt(outboxWith({ lastUpload: now + 25 * 60 * 1000, now }), HOUR, now), now + HOUR, "boundary, not spacing");
  assert.equal(nextUploadAt(outboxWith({ lastUpload: now, nextFlush: now + 2 * HOUR, now }), HOUR, now), now + 2 * HOUR);
});

test("a worker lock is live only while its process exists and its plan is not stale", () => {
  const now = 1_800_000_000_000;
  const alive = () => true;
  const dead = () => false;
  assert.equal(isWorkerLockActive(null, { now, alive }), false);
  assert.equal(isWorkerLockActive({ pid: 0 }, { now, alive }), false);
  assert.equal(isWorkerLockActive({ pid: 42, fire_at: new Date(now + HOUR).toISOString() }, { now, alive }), true);
  assert.equal(isWorkerLockActive({ pid: 42, fire_at: new Date(now + HOUR).toISOString() }, { now, alive: dead }), false);
  assert.equal(isWorkerLockActive({ pid: 42, fire_at: new Date(now - HOUR).toISOString() }, { now, alive }), false, "an hour past its plan the worker is presumed wedged");
});

test("ensureUploadWorker spawns at most one worker and only when something is pending", async () => {
  const dir = await fs.mkdtemp(path.join(home, "ensure-"));
  const outboxFile = path.join(dir, "server-outbox.json");
  const lockFile = path.join(dir, "upload-worker.json");
  const now = Date.now();
  const spawned = [];
  const spawnImpl = () => ({ pid: 1000 + spawned.push(1) });
  const alive = (pid) => pid === 1001;

  await fs.writeFile(outboxFile, JSON.stringify(outboxWith({ lastUpload: now, pending: false })));
  assert.equal((await ensureUploadWorker({ outboxFile, lockFile, now, spawnImpl, alive })).reason, "nothing-pending");
  assert.equal(spawned.length, 0);

  await fs.writeFile(outboxFile, JSON.stringify(outboxWith({ lastUpload: now })));
  const first = await ensureUploadWorker({ outboxFile, lockFile, now, spawnImpl, alive });
  assert.equal(first.spawned, true);
  assert.equal(first.fireAt, (Math.floor(now / HOUR) + 1) * HOUR, "next UTC hour boundary");
  assert.equal(JSON.parse(await fs.readFile(lockFile, "utf8")).pid, 1001);

  const second = await ensureUploadWorker({ outboxFile, lockFile, now: now + 1000, spawnImpl, alive });
  assert.equal(second.spawned, false);
  assert.equal(second.reason, "active");
  assert.equal(spawned.length, 1, "live worker is reused");

  // A deferral beyond the worker's lifetime is not worth waiting for.
  await fs.unlink(lockFile);
  await fs.writeFile(outboxFile, JSON.stringify(outboxWith({ lastUpload: now, nextFlush: now + 5 * HOUR })));
  assert.equal((await ensureUploadWorker({ outboxFile, lockFile, now, spawnImpl, alive })).reason, "too-far");
  await assert.rejects(fs.access(lockFile));
  await fs.writeFile(outboxFile, JSON.stringify(outboxWith({ lastUpload: now })));
  await ensureUploadWorker({ outboxFile, lockFile, now, spawnImpl, alive });

  // Dead process behind the lock: replaced.
  const third = await ensureUploadWorker({ outboxFile, lockFile, now, spawnImpl, alive: () => false });
  assert.equal(third.spawned, true);
  assert.equal(JSON.parse(await fs.readFile(lockFile, "utf8")).pid, 1003);
});

test("runUploadWorker sleeps until the window opens, uploads once and removes its lock", async () => {
  const dir = await fs.mkdtemp(path.join(home, "run-"));
  const outboxFile = path.join(dir, "server-outbox.json");
  const lockFile = path.join(dir, "upload-worker.json");
  await fs.writeFile(path.join(home, "config.json"), JSON.stringify({ server: { enabled: true, api_origin: "https://api.example.test" } }));
  await fs.writeFile(path.join(home, "credentials.json"), JSON.stringify({ device_token: `tb_live_unitdevice.${"o".repeat(43)}` }));
  let now = 1_800_000_000_000;
  await fs.writeFile(outboxFile, JSON.stringify(outboxWith({ lastUpload: now, now })));
  await fs.writeFile(lockFile, JSON.stringify({ pid: process.pid, fire_at: new Date(now).toISOString() }));
  const sleeps = [];
  const sleep = async (ms) => { sleeps.push(ms); now += ms; };
  const uploads = [];
  const fetchImpl = async (url, init) => {
    uploads.push(new URL(url).pathname);
    const { days } = JSON.parse(init.body);
    return new Response(JSON.stringify({ accepted: days.length, acked_days: days }));
  };
  const result = await runUploadWorker({ outboxFile, lockFile, clock: () => now, sleep, fetchImpl });
  assert.equal(result.reason, "nothing-pending");
  assert.deepEqual(sleeps, [15 * 60 * 1000, 15 * 60 * 1000, 15 * 60 * 1000, 15 * 60 * 1000], "slept in bounded steps up to the next hour boundary");
  assert.deepEqual(uploads, ["/v1/ingest/batch"]);
  await assert.rejects(fs.access(lockFile), "lock removed on exit");

  // A lock owned by someone else means another worker took over: exit at once.
  await fs.writeFile(outboxFile, JSON.stringify(outboxWith({ lastUpload: now, now })));
  await fs.writeFile(lockFile, JSON.stringify({ pid: process.pid + 1, fire_at: new Date(now).toISOString() }));
  const lost = await runUploadWorker({ outboxFile, lockFile, clock: () => now, sleep, fetchImpl });
  assert.equal(lost.reason, "lost-lock");
  await fs.access(lockFile);

  // A deferral further away than the remaining lifetime: exit instead of idling.
  await fs.writeFile(outboxFile, JSON.stringify(outboxWith({ lastUpload: now, nextFlush: now + 5 * HOUR, now })));
  await fs.writeFile(lockFile, JSON.stringify({ pid: process.pid, fire_at: new Date(now).toISOString() }));
  sleeps.length = 0;
  const far = await runUploadWorker({ outboxFile, lockFile, clock: () => now, sleep, fetchImpl });
  assert.equal(far.reason, "too-far");
  assert.deepEqual(sleeps, []);
  await assert.rejects(fs.access(lockFile));
});
