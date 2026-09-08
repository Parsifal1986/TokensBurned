import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { usageObservation } from "../src/observations.js";
import { mergeSnapshotEntries, outboxInternals, readOutbox, syncUsageEntries } from "../src/server-outbox.js";
import { createClinePlugin, clineInternals } from "../integrations/cline/plugin.js";
import { capabilityLines, detectedHarness } from "../src/capabilities.js";

const now = Date.now();
const timestamp = new Date(now - 60_000).toISOString();
const raw = (overrides = {}) => ({ id: "request-a", timestamp, harness: { id: "gemini-cli" }, usage_semantics: "exclusive-delta", usage: { input_tokens: 100, output_tokens: 20 }, ...overrides });
const entry = (overrides) => usageObservation(raw(overrides), { now });
const message = (overrides = {}) => ({ assistantMessage: {
  role: "assistant", id: "msg-a", createdAt: now - 60_000,
  metrics: { inputTokens: 100, outputTokens: 20, cacheReadTokens: 30, cacheWriteTokens: 10, reasoningTokenCount: 5 },
  modelInfo: { id: "model-a", provider: "provider-a" }, ...overrides,
} });

test("strict cloud observations reject ambiguous, malformed and out-of-window usage", () => {
  for (const invalid of [
    { id: undefined }, { timestamp: undefined }, { timestamp: "2026-02-30T00:00:00Z" },
    { timestamp: new Date(now + 60_000).toISOString() }, { timestamp: "2020-01-01T00:00:00Z" },
    { usage_semantics: "cumulative" }, { usage: { prompt_tokens: 100 } }, { usage: { input_tokens: -1 } },
    { usage: { input_tokens: 1.5 } }, { usage: { input_tokens: "100" } }, { usage: { input_tokens: 1e12 + 1 } },
    { usage: {} }, { request_count: 1e6 + 1 }, { harness: { id: "../foo" } },
  ]) assert.throws(() => entry(invalid));
  const safe = entry({ prompt: "PRIVATE PROMPT", transcript_path: "/secret", api_key: "secret-key" });
  assert.equal(safe.input_tokens, 100);
  assert.doesNotMatch(JSON.stringify(safe), /PRIVATE|secret|request-a/);
});

test("independent providers with the same model add exactly once; changed identities fail atomically", () => {
  const box = outboxInternals.emptyOutbox();
  const a = entry({ backend: { provider: "a", model: "shared" } });
  const b = entry({ id: "request-b", backend: { provider: "b", model: "shared" } });
  mergeSnapshotEntries(box, [a, b, a]);
  const day = Object.values(box.days)[0];
  assert.equal(day.input_tokens, 200);
  assert.equal(day.dimensions.provider.a.total_tokens, 120);
  assert.equal(day.dimensions.provider.b.total_tokens, 120);
  const before = JSON.stringify(box);
  for (const conflict of [
    { usage: { input_tokens: 999 } }, { timestamp: new Date(now - 3_600_000).toISOString() },
    { backend: { provider: "a", model: "other" } },
  ]) {
    assert.throws(() => mergeSnapshotEntries(box, [entry({ id: "new" }), entry(conflict)]), /Conflicting/);
    assert.equal(JSON.stringify(box), before);
  }
});

test("queue-only persistence is replay safe after process state is lost and does not acquire upload leases", async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "burn-observations-"));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const outboxFile = path.join(home, "outbox.json");
  const options = { outboxFile, now, upload: false, fetchImpl: () => { throw new Error("network forbidden"); } };
  const first = await syncUsageEntries([entry()], options);
  assert.equal(first.changedSources, 1);
  const second = await syncUsageEntries([entry()], options);
  assert.equal(second.changedSources, 0);
  const box = await readOutbox(outboxFile);
  assert.equal(box.upload_lease_id, undefined);
  assert.equal(Object.values(box.days)[0].input_tokens, 100);
  const conflict = entry({ usage: { input_tokens: 500 } });
  const before = await fs.readFile(outboxFile, "utf8");
  await assert.rejects(syncUsageEntries([entry({ id: "new" }), conflict], options), /Conflicting/);
  assert.equal(await fs.readFile(outboxFile, "utf8"), before);
});

test("Cline per-model messages preserve cache/reasoning totals and never read content", async () => {
  const context = message();
  Object.defineProperty(context.assistantMessage, "content", { get() { throw new Error("must not inspect content"); } });
  Object.defineProperty(context, "snapshot", { get() { throw new Error("must not inspect snapshot"); } });
  const a = clineInternals.observationFromModel(context, now);
  assert.deepEqual([a.input_tokens, a.output_tokens, a.cache_read_tokens, a.cache_write_tokens, a.reasoning_tokens], [60, 15, 30, 10, 5]);
  assert.equal(a.requests, 1);
  const box = outboxInternals.emptyOutbox();
  const captured = [];
  const plugin = createClinePlugin({ now: () => now, connectionImpl: async () => ({}), queueImpl: async (entries, options) => {
    assert.equal(options.upload, false);
    captured.push(...entries);
    mergeSnapshotEntries(box, entries);
  }, workerImpl: async () => {} });
  await plugin.hooks.afterModel(context);
  await plugin.hooks.afterModel(message({ id: "msg-b", metrics: { inputTokens: 200, outputTokens: 0 }, modelInfo: { id: "model-b", provider: "provider-b" } }));
  await plugin.hooks.afterModel(context);
  const day = Object.values(box.days)[0];
  assert.equal(day.input_tokens + day.output_tokens + day.cache_read_tokens + day.cache_write_tokens + day.reasoning_tokens, 320);
  assert.equal(day.request_count, 2);
  assert.equal(day.dimensions.model["model-a"].total_tokens, 120);
  assert.equal(day.dimensions.model["model-b"].total_tokens, 200);
  assert.equal(plugin.hooks.afterRun, undefined, "no second run-total path can double count model calls");
});

test("Cline skips incompatible metrics and no connection; storage errors never affect model control", async () => {
  let queued = 0;
  const plugin = createClinePlugin({ now: () => now, connectionImpl: async () => ({}), queueImpl: async () => { queued += 1; throw new Error("disk full"); }, workerImpl: async () => { throw new Error("must not start"); } });
  for (const context of [{ result: { usage: { inputTokens: 100 } } }, message({ metrics: { inputTokens: 1, cacheReadTokens: 10 } }), message({ createdAt: undefined }), message({ id: undefined })]) {
    assert.equal(await plugin.hooks.afterModel(context), undefined);
  }
  assert.equal(queued, 0);
  assert.equal(await plugin.hooks.afterModel(message()), undefined);
  assert.equal(queued, 1);
  const disconnected = createClinePlugin({ connectionImpl: async () => null, queueImpl: async () => { throw new Error("must not queue"); } });
  await disconnected.hooks.afterModel(message());
});

test("doctor distinguishes supported capability from observed usage", () => {
  const lines = capabilityLines({ sources: { a: { harness: "cline", bucket: Math.floor(now / 900_000) } } });
  assert.match(lines.find(line => line.startsWith("Gemini")), /JSON\/JSONL.*history supported.*none observed/);
  assert.match(lines.find(line => line.startsWith("Cline")), /afterModel.*UTC bucket.*\d{4}-/);
});

test("unsupported harness hints never select Claude or Codex history", () => {
  assert.equal(detectedHarness({}), undefined);
  assert.equal(detectedHarness({ TOKENSBURNED_HARNESS: "gemini-cli", CODEX_PLUGIN_ROOT: "/installed" }), "gemini-cli");
  assert.equal(detectedHarness({ COPILOT_PLUGIN_ROOT: "/plugin" }), "copilot");
  assert.equal(detectedHarness({ GEMINI_SESSION_ID: "session" }), "gemini-cli");
});

test("Cline queues survive restart, concurrent replays and an offline upload", async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "burn-cline-restart-"));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const outboxFile = path.join(home, "outbox.json");
  const makePlugin = () => createClinePlugin({
    now: () => now, connectionImpl: async () => ({}), workerImpl: async () => {},
    queueImpl: (entries) => syncUsageEntries(entries, { outboxFile, now, upload: false }),
  });
  const first = makePlugin();
  await first.hooks.afterModel(message());
  await Promise.all(Array.from({ length: 4 }, () => makePlugin().hooks.afterModel(message())));
  const options = { outboxFile, now, token: `tb_live_clinefixture.${"s".repeat(43)}`, apiOrigin: "https://api.example.test", credentialApiOrigin: "https://api.example.test" };
  await assert.rejects(syncUsageEntries([], { ...options, fetchImpl: async () => { throw new Error("offline"); } }), /offline/);
  const queued = await readOutbox(outboxFile);
  assert.equal(Object.values(queued.days)[0].request_count, 1);
  assert.equal(Object.values(queued.days)[0].acked_revision, 0);
  let sent;
  await syncUsageEntries([], { ...options, now: now + 120_000, fetchImpl: async (_url, init) => {
    sent = JSON.parse(init.body);
    return new Response(JSON.stringify({ accepted: sent.days.length, acked_days: sent.days }));
  } });
  assert.equal(sent.days[0].request_count, 1);
  assert.equal(sent.days[0].input_tokens, 60);
  const final = await readOutbox(outboxFile);
  assert.equal(Object.values(final.days)[0].acked_revision, Object.values(final.days)[0].revision);
});
