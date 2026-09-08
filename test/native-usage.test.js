import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readGeminiUsage, geminiObservation } from "../src/gemini-usage.js";
import { readClineUsage, clineObservation, clineIdeObservation } from "../src/cline-usage.js";
import { readOpenCodeUsage } from "../src/opencode-usage.js";
import { copilotObservation } from "../src/copilot-usage.js";
import { attachCopilotUsage } from "../integrations/copilot/plugin.js";
import { createClinePlugin } from "../integrations/cline/plugin.js";
import { installCopilotExtension } from "../src/integration-install.js";
import { collectLocalUsage } from "../src/collector.js";
import { collectHistoryEntries } from "../src/history.js";
import { readOutbox, syncUsageEntries, mergeSnapshotEntries, outboxInternals } from "../src/server-outbox.js";

const exec = promisify(execFile);
const now = Date.UTC(2026, 8, 8, 12);
const stamp = new Date(now - 1000).toISOString();
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "burn-native-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const write = async (name, data) => {
    const file = path.join(root, name);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, typeof data === "string" ? data : JSON.stringify(data));
    return file;
  };
  return { root, write };
}
const gemini = (overrides = {}) => ({ id: "g1", type: "gemini", timestamp: stamp, model: "gemini-test",
  tokens: { input: 100, output: 20, cached: 30, thoughts: 5, tool: 2, total: 127 }, ...overrides });
const cline = (overrides = {}) => ({ id: "c1", role: "assistant", createdAt: now - 1000,
  metrics: { inputTokens: 100, outputTokens: 20, cacheReadTokens: 30, cacheWriteTokens: 10, reasoningTokenCount: 5 },
  modelInfo: { id: "model-a", provider: "provider-a" }, ...overrides });
const storedCline = overrides => {
  const { createdAt, metrics, ...message } = cline(overrides);
  const { reasoningTokenCount, ...storedMetrics } = metrics;
  return { ...message, ts: createdAt, metrics: storedMetrics };
};
const copilot = (overrides = {}) => ({ type: "assistant.usage", id: "cp1", timestamp: stamp,
  data: { inputTokens: 100, outputTokens: 20, cacheReadTokens: 30, cacheWriteTokens: 10, reasoningTokens: 5, model: "model-a" }, ...overrides });
const total = row => ["input_tokens", "output_tokens", "reasoning_tokens", "cache_read_tokens", "cache_write_tokens"].reduce((n, key) => n + row[key], 0);

test("Gemini JSON + JSONL updates, rewind, child sessions and migration count each message once", async t => {
  const f = await fixture(t);
  await f.write("project/chats/session-old.json", { sessionId: "s1", messages: [gemini(), gemini({ type: "user", id: "u" })] });
  await f.write("project/chats/session-new.jsonl", [
    { sessionId: "s1" }, gemini({ tokens: null }), gemini(), { $rewindTo: "u" }, gemini({ content: "PRIVATE-RESPONSE" }),
    gemini({ id: "g2", timestamp: new Date(now + 1000).toISOString() }),
  ].map(JSON.stringify).join("\n") + '\n{"incomplete":');
  await f.write("project/chats/s1/child.jsonl", [{ sessionId: "child" }, gemini({ model: "gemini-child" })].map(JSON.stringify).join("\n"));
  await f.write("project/settings.json", { sessionId: "secret", messages: [gemini()] });
  const rows = await readGeminiUsage({ root: f.root, now });
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(total), [127, 127]);
  assert.equal(rows[0].input_tokens, 72);
  assert.doesNotMatch(JSON.stringify(rows), /PRIVATE|RESPONSE|project|session-new/);
  assert.throws(() => geminiObservation(gemini({ tokens: { input: 1, output: 2, cached: 10 } }), "s1", { now }));
  const outside = await f.write("outside.json", { sessionId: "outside", messages: [gemini()] });
  await fs.symlink(outside, path.join(f.root, "project/chats/linked.json"));
  assert.equal((await readGeminiUsage({ root: f.root, now })).length, 2);
});

test("Cline SDK histories and afterModel hooks share durable identities across concurrent replays", async t => {
  const f = await fixture(t), outboxFile = path.join(f.root, "outbox.json");
  await f.write("sessions/main/main.messages.json", { version: 1, sessionId: "main", messages: [storedCline()] });
  await f.write("sessions/main/child.messages.json", { version: 1, sessionId: "child", messages: [storedCline({ id: "c2", modelInfo: { id: "model-b", provider: "provider-b" } })] });
  const rows = await readClineUsage({ root: path.join(f.root, "sessions"), ideRoots: [], now });
  const queueImpl = entries => syncUsageEntries(entries, { outboxFile, now, upload: false });
  const plugin = createClinePlugin({ now: () => now, connectionImpl: async () => ({}), queueImpl, workerImpl: async () => {} });
  await Promise.all([queueImpl(rows), plugin.hooks.afterModel({ assistantMessage: cline() }), queueImpl(rows)]);
  const box = await readOutbox(outboxFile);
  assert.equal(Object.values(box.sources).length, 2);
  assert.equal(Object.values(box.days)[0].request_count, 2);
  assert.equal(total(Object.values(box.days)[0]), 240);
  assert.equal(Object.values(box.days)[0].reasoning_tokens, 5, "richer live detail survives a history replay");
  const m = cline();
  Object.defineProperty(m, "content", { get() { throw new Error("private content"); } });
  assert.equal(total(clineObservation(m, { now })), 120);
});

test("Cline's lossy persistence codec refines one request in either arrival order without weakening immutable imports", () => {
  const live = clineObservation(cline(), { now }), stored = clineObservation(storedCline(), { now });
  assert.equal(live.observation_id, stored.observation_id);
  assert.equal(live.cline_usage_scope, stored.cline_usage_scope);
  for (const order of [[live, stored], [stored, live]]) {
    const box = outboxInternals.emptyOutbox();
    for (const row of order) mergeSnapshotEntries(box, [row]);
    mergeSnapshotEntries(box, [stored, live, stored]);
    const day = Object.values(box.days)[0];
    assert.equal(day.request_count, 1);
    assert.equal(total(day), 120);
    assert.equal(day.reasoning_tokens, 5);
    assert.throws(() => mergeSnapshotEntries(box, [clineObservation(storedCline({ createdAt: now - 2000 }), { now })]), /Conflicting/);
    assert.throws(() => mergeSnapshotEntries(box, [clineObservation(storedCline({ metrics: { inputTokens: 999, outputTokens: 20 } }), { now })]), /Conflicting/);
    assert.throws(() => mergeSnapshotEntries(box, [clineObservation(cline({ metrics: { ...cline().metrics, reasoningTokenCount: 6 } }), { now })]), /Conflicting/);
  }
  const legacy = outboxInternals.emptyOutbox();
  const { cline_usage_scope, cline_usage_detail, ...oldLive } = live;
  mergeSnapshotEntries(legacy, [oldLive]);
  mergeSnapshotEntries(legacy, [stored]);
  assert.equal(Object.values(legacy.days)[0].reasoning_tokens, 5);
});

test("classic Cline IDE reads only completed request metrics and skips SDK projections", async t => {
  const f = await fixture(t);
  const msg = { ts: now - 1000, type: "say", say: "api_req_started", modelInfo: { modelId: "classic", providerId: "anthropic" },
    text: JSON.stringify({ request: "PRIVATE-PROMPT", tokensIn: 100, tokensOut: 20, cacheReads: 30, cacheWrites: 10, cost: 0.01 }) };
  await f.write("ide/old/ui_messages.json", [msg, { ...msg, ts: now - 500, partial: true }]);
  await f.write("ide/old/api_conversation_history.json", "PRIVATE NEVER PARSED");
  await f.write("ide/main/ui_messages.json", [msg]);
  await f.write("ide/main/api_conversation_history.json", "PRIVATE NEVER PARSED");
  await f.write("sdk/main/main.messages.json", { version: 1, sessionId: "main", messages: [cline()] });
  const rows = await readClineUsage({ root: path.join(f.root, "sdk"), ideRoots: [path.join(f.root, "ide")], now });
  assert.equal(rows.length, 2);
  assert.equal(total(clineIdeObservation(msg, "old", { now })), 160);
  assert.doesNotMatch(JSON.stringify(rows), /PRIVATE|PROMPT/);
});

test("OpenCode v2-only, mixed v1/v2 and legacy JSON retain the same request identity", async t => {
  const f = await fixture(t), file = path.join(f.root, "opencode.db");
  const quote = value => "'" + JSON.stringify(value).replaceAll("'", "''") + "'";
  const tokens = { input: 100, output: 20, reasoning: 5, cache: { read: 30, write: 10 } };
  const time = { completed: now - 1000 };
  const v1 = { id: "m1", role: "assistant", time, tokens, providerID: "p", modelID: "m" };
  const v2 = { time, tokens, model: { providerID: "p", id: "m" }, content: "PRIVATE" };
  await f.write("storage/message/session/m1.json", v1);
  const legacy = await readOpenCodeUsage({ file, now });
  await exec("sqlite3", [file, `CREATE TABLE session_message(id TEXT, type TEXT, time_updated INTEGER, data TEXT);
    INSERT INTO session_message VALUES ('m1','assistant',${now},${quote(v2)});`]);
  assert.deepEqual(await readOpenCodeUsage({ file, now }), legacy);
  await exec("sqlite3", [file, `CREATE TABLE message(id TEXT, time_updated INTEGER, data TEXT);
    INSERT INTO message VALUES ('m1',${now},${quote(v1)});
    INSERT INTO session_message VALUES ('m2','assistant',${now},${quote(v2)});
    INSERT INTO session_message VALUES ('u','user',${now},${quote(v2)});`]);
  const rows = await readOpenCodeUsage({ file, now });
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(total), [165, 165]);
  assert.doesNotMatch(JSON.stringify(rows), /PRIVATE/);
});

test("Copilot official event subscription queues once, excludes context/credits, and tolerates disconnection", async t => {
  const f = await fixture(t), outboxFile = path.join(f.root, "outbox.json");
  let listener, workers = 0, connected = true;
  const unsubscribe = () => {};
  assert.equal(attachCopilotUsage({ on(name, fn) { assert.equal(name, "assistant.usage"); listener = fn; return unsubscribe; } }, {
    now: () => now, configImpl: async () => ({ server: { enabled: connected } }), credentialsImpl: async () => ({ device_token: "fixture" }),
    queueImpl: entries => syncUsageEntries(entries, { outboxFile, now, upload: false }), workerImpl: async () => { workers++; },
  }), unsubscribe);
  const event = copilot();
  Object.defineProperty(event, "content", { get() { throw new Error("PRIVATE"); } });
  await Promise.all([listener(event), listener(event)]);
  await listener(copilot({ id: "child", agentId: "subagent", data: { ...event.data, model: "model-b" } }));
  connected = false;
  await listener(copilot({ id: "disconnected" }));
  assert.equal(workers, 3);
  assert.equal(Object.values((await readOutbox(outboxFile)).days)[0].request_count, 2);
  assert.equal(copilotObservation({ type: "session.usage_info", data: { currentTokens: 999 } }), null);
  assert.equal(copilotObservation(copilot({ data: { cost: 100 } }), { now }), null);
  assert.throws(() => copilotObservation(copilot({ data: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 10 } }), { now }));
  const installed = await installCopilotExtension({ home: f.root });
  assert.match(await fs.readFile(installed, "utf8"), /joinSession.*copilot-sdk/s);
  await installCopilotExtension({ home: f.root });
  await fs.writeFile(installed, "unmanaged user extension");
  await assert.rejects(installCopilotExtension({ home: f.root }), /unmanaged/);
  assert.equal(await fs.readFile(installed, "utf8"), "unmanaged user extension");
});

test("native history backfill, source isolation and scoped CLI dry-run use exact totals", async t => {
  const f = await fixture(t);
  await f.write(".gemini/tmp/project/chats/session.json", { sessionId: "g", messages: [gemini({ timestamp: new Date().toISOString() })] });
  const history = await collectHistoryEntries({ harnesses: ["gemini-cli"], roots: { "gemini-cli": path.join(f.root, ".gemini/tmp") }, now: Date.now(), days: 90 });
  assert.equal(total(history.entries[0]), 127);
  const result = await collectLocalUsage({ harnesses: ["gemini-cli", "cline"], now,
    geminiImpl: async () => { throw new Error("PRIVATE"); }, clineImpl: async () => [clineObservation(cline(), { now })] });
  assert.deepEqual(result.errors, ["gemini-cli"]);
  assert.equal(result.entries.length, 1);
  const { stdout } = await exec(process.execPath, ["bin/burn.js", "backfill", "--harness", "gemini-cli", "--dry-run"], {
    env: { ...process.env, HOME: f.root, GEMINI_CLI_HOME: f.root, BURN_HOME: path.join(f.root, ".burn") },
  });
  assert.match(stdout, /127 tokens.*gemini-cli/);
  await assert.rejects(fs.access(path.join(f.root, ".burn/server-outbox.json")));
});
