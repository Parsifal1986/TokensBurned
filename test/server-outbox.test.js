import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  nextUploadAt,
  MAX_DIMENSIONS_PER_KIND,
  acknowledgeEnvelopes,
  mergeSnapshotEntries,
  outboxInternals,
  pendingEnvelopes,
  pruneOutbox,
  rejectEnvelopes,
  resetOutboxAcknowledgements,
  syncUsageEntries,
} from "../src/server-outbox.js";

function entry(overrides = {}) {
  return {
    bucket: Math.floor(Date.UTC(2026, 7, 30, 8) / 1000 / 900),
    session: "session-a",
    harness: "codex",
    provider: "openai",
    model: "gpt-5.6-sol",
    revision: 1,
    input: 100,
    output: 20,
    cache_read: 30,
    cache_write: 0,
    reasoning: 5,
    requests: 1,
    ...overrides,
  };
}

test("prototype-named dimensions remain numeric own properties in uploaded envelopes", () => {
  const outbox = outboxInternals.emptyOutbox();
  mergeSnapshotEntries(outbox, [entry({ model: "__proto__", harness: "constructor", provider: "toString" })]);
  const [day] = JSON.parse(JSON.stringify(pendingEnvelopes(outbox)));
  assert.deepEqual(day.dimensions.model.__proto__, { total_tokens: 155 });
  assert.deepEqual(day.dimensions.harness.constructor, { total_tokens: 155 });
  assert.deepEqual(day.dimensions.provider.tostring, { total_tokens: 155 });
});

test("server acknowledgements cannot mutate inherited objects", () => {
  const outbox = outboxInternals.emptyOutbox();
  acknowledgeEnvelopes(outbox, [{ day: "__proto__", revision: 99 }, { day: "constructor", revision: 99 }]);
  assert.equal(Object.hasOwn(Object.prototype, "acked_revision"), false);
  assert.equal(Object.hasOwn(Object, "acked_revision"), false);
  assert.deepEqual(outbox.days, {});
});

test("outbox combines source snapshots into one absolute UTC day", () => {
  const outbox = outboxInternals.emptyOutbox(new Date("2026-08-30T00:00:00Z"));
  const merged = mergeSnapshotEntries(outbox, [
    entry(),
    entry({ session: "session-b", model: "claude-opus-4-1", provider: "anthropic", input: 50 }),
  ]);
  assert.deepEqual(merged, { changedSources: 2, changedDays: 1 });
  const [day] = pendingEnvelopes(outbox);
  assert.equal(day.day, "2026-08-30");
  assert.equal(day.input_tokens, 150);
  assert.equal(day.output_tokens, 40);
  assert.equal(day.hours["08"].input_tokens, 150);
  assert.deepEqual(day.dimensions.provider, {
    openai: { total_tokens: 155 },
    anthropic: { total_tokens: 105 },
  });
});

test("credential rotation skips unchanged history and uploads only an updated absolute day", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "burn-reconnect-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const outboxFile = path.join(directory, "outbox.json");
  const uploads = [];
  const options = {
    outboxFile, now: Date.UTC(2026, 7, 30, 12), force: true, token: "old-token",
    fetchImpl: async (_url, init) => {
      const { days } = JSON.parse(init.body);
      uploads.push(days);
      return new Response(JSON.stringify({ accepted: days.length, acked_days: days }));
    },
  };
  await syncUsageEntries([entry()], options);
  await syncUsageEntries([entry(), entry()], { ...options, token: "renewed-token" });
  assert.equal(uploads.length, 1);
  await syncUsageEntries([entry({ revision: 2, input: 140 })], { ...options, token: "renewed-token" });
  assert.equal(uploads.length, 2);
  assert.equal(uploads[1][0].input_tokens, 140);

  await resetOutboxAcknowledgements(outboxFile);
  await syncUsageEntries([], { ...options, token: "different-account-token" });
  assert.equal(uploads.length, 3, "a genuinely new identity must receive previously acknowledged history");
});

test("an in-flight old connection cannot acknowledge history after a connection reset", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "burn-reconnect-race-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const outboxFile = path.join(directory, "outbox.json");
  await syncUsageEntries([entry()], {
    outboxFile, now: Date.UTC(2026, 7, 30, 12), force: true, token: "old-token",
    fetchImpl: async (_url, init) => {
      await resetOutboxAcknowledgements(outboxFile);
      return new Response(JSON.stringify({ acked_days: JSON.parse(init.body).days }));
    },
  });
  const outbox = JSON.parse(await fs.readFile(outboxFile, "utf8"));
  assert.equal(pendingEnvelopes(outbox).length, 1);
  assert.equal(outbox.last_successful_upload_at, null);
});

test("outbox retries are no-ops and newer absolute snapshots advance one day revision", () => {
  const outbox = outboxInternals.emptyOutbox();
  mergeSnapshotEntries(outbox, [entry()]);
  const first = pendingEnvelopes(outbox)[0];
  acknowledgeEnvelopes(outbox, [{ day: first.day, revision: first.revision }]);
  assert.equal(pendingEnvelopes(outbox).length, 0);
  assert.deepEqual(mergeSnapshotEntries(outbox, [entry()]), { changedSources: 0, changedDays: 0 });
  assert.equal(pendingEnvelopes(outbox).length, 0);

  mergeSnapshotEntries(outbox, [entry({ revision: 2, input: 140 })]);
  const second = pendingEnvelopes(outbox)[0];
  assert.ok(second.revision > first.revision);
  assert.equal(second.input_tokens, 140);
});

test("identified model snapshots replace overlapping unknown snapshots", () => {
  const outbox = outboxInternals.emptyOutbox();
  mergeSnapshotEntries(outbox, [
    entry({ model: "unknown", input: 500 }),
    entry({ model: "gpt-5.6-sol", revision: 2, input: 100 }),
  ]);
  const [day] = pendingEnvelopes(outbox);
  assert.equal(day.input_tokens, 100);
  assert.deepEqual(day.dimensions.model, { "gpt-5.6-sol": { total_tokens: 155 } });
});

test("outbox pruning removes expired and future days before upload", () => {
  const now = Date.UTC(2026, 7, 30, 12);
  const today = Math.floor(now / 86_400_000);
  const outbox = outboxInternals.emptyOutbox(new Date(now));
  outbox.sources.old = { day: today - 91 };
  outbox.sources.current = { day: today };
  outbox.sources.future = { day: today + 1 };
  outbox.days["2026-05-30"] = { day: "2026-05-30" };
  outbox.days["2026-08-30"] = { day: "2026-08-30" };
  outbox.days["2026-08-31"] = { day: "2026-08-31" };

  assert.deepEqual(pruneOutbox(outbox, now), { sources: 2, days: 2 });
  assert.deepEqual(Object.keys(outbox.sources), ["current"]);
  assert.deepEqual(Object.keys(outbox.days), ["2026-08-30"]);
});

test("throttled days stay pending and defer the next flush; only acknowledged days advance (C1)", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "burn-throttle-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const outboxFile = path.join(directory, "outbox.json");
  const now = Date.UTC(2026, 7, 30, 10, 40);
  let mode = "throttle";
  const uploads = [];
  const options = {
    outboxFile, now, token: "token",
    fetchImpl: async (_url, init) => {
      const { days } = JSON.parse(init.body);
      uploads.push(days);
      if (mode === "throttle") {
        return new Response(JSON.stringify({
          accepted: days.length, changed: 0, ignored: days.length, acked_days: [],
          throttled_days: days.map((day) => ({ day: day.day, revision: day.revision, retry_after: 1200 })),
          next_flush_after: 1200,
        }));
      }
      return new Response(JSON.stringify({ accepted: days.length, acked_days: days }));
    },
  };
  const first = await syncUsageEntries([entry()], { ...options, force: true });
  assert.equal(first.throttled_days.length, 1);
  assert.equal(first.next_flush_after, 1200);
  let outbox = JSON.parse(await fs.readFile(outboxFile, "utf8"));
  assert.equal(pendingEnvelopes(outbox).length, 1, "a throttled day is not acknowledged");
  assert.equal(outbox.last_successful_upload_at, null);
  const [throttledDay] = Object.values(outbox.days);
  assert.equal(throttledDay.retry_at, new Date(now + 1200_000).toISOString(), "the deferral is recorded on the day itself");
  assert.equal(outbox.next_flush_at, undefined, "no global deferral");
  assert.equal(pendingEnvelopes(outbox, now).length, 0, "a deferred day is not sendable before its window");
  assert.equal(nextUploadAt(outbox, 3600_000, now), now + 1200_000);

  // Without force, nothing is sent until the server's retry window opens.
  const deferred = await syncUsageEntries([entry()], { ...options, now: now + 600_000 });
  assert.equal(deferred.deferred, 1);
  assert.equal(uploads.length, 1);

  mode = "ack";
  await syncUsageEntries([entry()], { ...options, now: now + 1200_000 });
  assert.equal(uploads.length, 2);
  outbox = JSON.parse(await fs.readFile(outboxFile, "utf8"));
  assert.equal(pendingEnvelopes(outbox).length, 0);
  assert.equal(outbox.last_successful_upload_at, new Date(now + 1200_000).toISOString());
  assert.equal(Object.values(outbox.days)[0].retry_at, undefined, "acknowledgement clears the deferral");
});

test("a deferred yesterday does not block today's hourly upload", async () => {
  const outboxFile = path.join(await fs.mkdtemp(path.join(os.tmpdir(), "burn-defer-")), "outbox.json");
  const now = Date.UTC(2026, 8, 7, 18, 37, 0);
  const uploads = [];
  const fetchImpl = async (_url, init) => {
    const { days } = JSON.parse(init.body);
    uploads.push(days.map((day) => day.day));
    const today = days.filter((day) => day.day === "2026-09-07");
    const yesterday = days.filter((day) => day.day === "2026-09-06");
    return new Response(JSON.stringify({
      accepted: days.length, acked_days: today,
      throttled_days: yesterday.map((day) => ({ day: day.day, revision: day.revision, retry_after: 19_380 })),
      next_flush_after: yesterday.length ? 19_380 : 3600,
    }));
  };
  const bucketFor = (iso) => Math.floor(Date.parse(iso) / 1000 / 900);
  const entries = [
    entry({ session: "y", bucket: bucketFor("2026-09-06T10:00:00Z"), input: 10 }),
    entry({ session: "t", bucket: bucketFor("2026-09-07T18:00:00Z"), input: 20 }),
  ];
  await syncUsageEntries(entries, { outboxFile, now, token: "token", fetchImpl });
  assert.deepEqual(uploads, [["2026-09-06", "2026-09-07"]]);
  let outbox = JSON.parse(await fs.readFile(outboxFile, "utf8"));
  assert.equal(outbox.days["2026-09-06"].retry_at, new Date(now + 19_380_000).toISOString());
  assert.equal(outbox.days["2026-09-07"].acked_revision, outbox.days["2026-09-07"].revision);

  // A new turn at 18:57 changes today; the next UTC hour is 19:00, not midnight.
  const later = Date.UTC(2026, 8, 7, 18, 57, 0);
  await syncUsageEntries([entry({ session: "t", bucket: bucketFor("2026-09-07T18:45:00Z"), input: 30 })], { outboxFile, now: later, token: "token", fetchImpl });
  outbox = JSON.parse(await fs.readFile(outboxFile, "utf8"));
  assert.equal(uploads.length, 1, "still inside the 18:00 window");
  assert.equal(nextUploadAt(outbox, 3600_000, later), Date.UTC(2026, 8, 7, 19, 0, 0));
  assert.equal(pendingEnvelopes(outbox, later).length, 1, "only today is sendable");

  const nextHour = Date.UTC(2026, 8, 7, 19, 0, 1);
  await syncUsageEntries([], { outboxFile, now: nextHour, token: "token", fetchImpl });
  assert.deepEqual(uploads.at(-1), ["2026-09-07"], "yesterday stays parked until its own window");
  outbox = JSON.parse(await fs.readFile(outboxFile, "utf8"));
  assert.equal(pendingEnvelopes(outbox, nextHour).length, 0);
  assert.equal(nextUploadAt(outbox, 3600_000, nextHour), now + 19_380_000, "with only a deferred day left, the deferral decides");
});

test("acknowledgements ignore throttled_days and older Workers without the field still work", () => {
  const outbox = outboxInternals.emptyOutbox();
  mergeSnapshotEntries(outbox, [entry()]);
  const [day] = pendingEnvelopes(outbox);
  assert.equal(acknowledgeEnvelopes(outbox, [], new Date(0)), 0);
  assert.equal(outbox.last_successful_upload_at, null, "an upload that acknowledged nothing is not a successful upload");
  assert.equal(acknowledgeEnvelopes(outbox, [{ day: day.day, revision: day.revision }], new Date(0)), 1);
  assert.equal(outbox.last_successful_upload_at, new Date(0).toISOString());
  assert.equal(pendingEnvelopes(outbox).length, 0);
});

test("the hook path (force: false) uploads at most once per hour (B1)", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "burn-hook-throttle-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const outboxFile = path.join(directory, "outbox.json");
  const now = Date.UTC(2026, 7, 30, 12);
  let uploads = 0;
  const options = {
    outboxFile, token: "token",
    fetchImpl: async (_url, init) => {
      uploads += 1;
      return new Response(JSON.stringify({ acked_days: JSON.parse(init.body).days }));
    },
  };
  await syncUsageEntries([entry()], { ...options, now });
  await syncUsageEntries([entry({ revision: 2, input: 140 })], { ...options, now: now + 10 * 60_000 });
  const third = await syncUsageEntries([entry({ revision: 3, input: 180 })], { ...options, now: now + 50 * 60_000 });
  assert.equal(uploads, 1);
  assert.equal(third.deferred, 1);
  await syncUsageEntries([], { ...options, now: now + 60 * 60_000 });
  assert.equal(uploads, 2);
  assert.equal(pendingEnvelopes(JSON.parse(await fs.readFile(outboxFile, "utf8"))).length, 0);
});

test("dimension maps are capped at the Worker's 32-entry limit and still sum exactly (B2)", () => {
  const outbox = outboxInternals.emptyOutbox();
  const entries = Array.from({ length: 40 }, (_, index) => entry({
    session: `session-${index}`, model: `model-${index}`, input: 100 + index,
  }));
  mergeSnapshotEntries(outbox, entries);
  const [day] = pendingEnvelopes(outbox);
  const keys = Object.keys(day.dimensions.model);
  assert.equal(keys.length, MAX_DIMENSIONS_PER_KIND);
  assert.equal(MAX_DIMENSIONS_PER_KIND, 32);
  assert.ok(keys.includes("other"));
  const expected = day.input_tokens + day.output_tokens + day.cache_read_tokens
    + day.cache_write_tokens + day.reasoning_tokens;
  for (const kind of ["harness", "provider", "model"]) {
    const sum = Object.values(day.dimensions[kind]).reduce((total, value) => total + value.total_tokens, 0);
    assert.equal(sum, expected, `${kind} dimensions must sum to the day total`);
  }
});

test("a server-rejected day is parked at its revision and released by a new revision (B2)", () => {
  const outbox = outboxInternals.emptyOutbox();
  mergeSnapshotEntries(outbox, [entry(), entry({ bucket: entry().bucket + 96, session: "session-b" })]);
  const [bad, good] = pendingEnvelopes(outbox);
  assert.equal(rejectEnvelopes(outbox, [{ day: bad.day, revision: bad.revision, code: "too_many_dimensions" }]), 1);
  assert.deepEqual(pendingEnvelopes(outbox).map((day) => day.day), [good.day]);
  assert.equal(outbox.days[bad.day].rejected_code, "too_many_dimensions");
  assert.equal(rejectEnvelopes(outbox, [{ day: bad.day, revision: 1, code: "invalid_payload" }]), 0, "stale rejections are ignored");
  mergeSnapshotEntries(outbox, [entry({ revision: 2, input: 140 })]);
  assert.deepEqual(pendingEnvelopes(outbox).map((day) => day.day).sort(), [bad.day, good.day].sort());
  assert.ok(!("rejected_revision" in pendingEnvelopes(outbox)[0]));
});
