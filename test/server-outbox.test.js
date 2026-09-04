import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  acknowledgeEnvelopes,
  mergeSnapshotEntries,
  outboxInternals,
  pendingEnvelopes,
  pruneOutbox,
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
