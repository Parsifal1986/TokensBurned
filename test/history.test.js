import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { collectHistoryEntries, parseHistoryFile, ZSTD_SUPPORTED } from "../src/history.js";

async function fixture(lines) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "tokensburned-history-"));
  const file = path.join(root, "session.jsonl");
  await fs.writeFile(file, `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`);
  return { root, file };
}

test("Codex history converts cumulative usage to non-overlapping bucket deltas", async () => {
  const now = Date.UTC(2026, 7, 30, 12);
  const first = new Date(now - 20 * 60 * 1000).toISOString();
  const second = new Date(now - 2 * 60 * 1000).toISOString();
  const { root, file } = await fixture([
    { timestamp: first, type: "event_msg", payload: { type: "turn_context", model: "gpt-test", content: "never retain" } },
    { timestamp: first, type: "event_msg", payload: { type: "token_count", info: { total_token_usage: { input_tokens: 100, cached_input_tokens: 40, output_tokens: 50, reasoning_output_tokens: 20 } } } },
    { timestamp: first, type: "event_msg", payload: { type: "token_count", info: { total_token_usage: { input_tokens: 100, cached_input_tokens: 40, output_tokens: 50, reasoning_output_tokens: 20 } } } },
    { timestamp: second, type: "event_msg", payload: { type: "token_count", info: { total_token_usage: { input_tokens: 180, cached_input_tokens: 80, output_tokens: 70, reasoning_output_tokens: 30 } } } },
  ]);
  const entries = await parseHistoryFile(file, {
    harness: "codex",
    root,
    now,
    backend: { provider: "openai" },
  });
  assert.equal(entries.length, 2);
  assert.deepEqual(entries.map(({ input, output, cache_read, reasoning, requests }) => ({ input, output, cache_read, reasoning, requests })), [
    { input: 60, output: 30, cache_read: 40, reasoning: 20, requests: 1 },
    { input: 40, output: 10, cache_read: 40, reasoning: 10, requests: 1 },
  ]);
  assert.equal(JSON.stringify(entries).includes("never retain"), false);
  await fs.rm(root, { recursive: true, force: true });
});

test("Codex history recognizes top-level turn_context records from desktop rollouts", async () => {
  const now = Date.UTC(2026, 7, 30, 12);
  const at = new Date(now - 60_000).toISOString();
  const { root, file } = await fixture([
    { timestamp: at, type: "session_meta", payload: { session_id: "session-new" } },
    { timestamp: at, type: "turn_context", payload: { model: "gpt-5.6-sol", summary: "never retain" } },
    { timestamp: at, type: "event_msg", payload: { type: "token_count", info: { total_token_usage: { input_tokens: 100, cached_input_tokens: 25, output_tokens: 50, reasoning_output_tokens: 10 } } } },
  ]);
  const entries = await parseHistoryFile(file, {
    harness: "codex",
    root,
    now,
    backend: { provider: "unknown" },
  });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].model, "gpt-5.6-sol");
  assert.equal(JSON.stringify(entries).includes("never retain"), false);
  await fs.rm(root, { recursive: true, force: true });
});

test("Claude history keeps the final usage record for each assistant message", async () => {
  const now = Date.UTC(2026, 7, 30, 12);
  const at = new Date(now - 60_000).toISOString();
  const { root, file } = await fixture([
    { timestamp: at, type: "user", message: { content: "private prompt" }, sessionId: "session-private" },
    { timestamp: at, type: "assistant", message: { id: "msg-1", model: "claude-test", content: "private response", usage: { input_tokens: 1, output_tokens: 5, cache_read_input_tokens: 50, cache_creation_input_tokens: 10 } }, sessionId: "session-private" },
    { timestamp: at, type: "assistant", message: { id: "msg-1", model: "claude-test", usage: { input_tokens: 1, output_tokens: 20, cache_read_input_tokens: 50, cache_creation_input_tokens: 10 } }, sessionId: "session-private" },
    { timestamp: at, type: "assistant", message: { id: "msg-2", model: "claude-test", usage: { input_tokens: 2, output_tokens: 5, cache_read_input_tokens: 60, cache_creation_input_tokens: 5 } }, sessionId: "session-private" },
  ]);
  const entries = await parseHistoryFile(file, {
    harness: "claude-code",
    root,
    now,
    backend: { provider: "anthropic" },
  });
  assert.equal(entries.length, 1);
  assert.deepEqual({
    input: entries[0].input,
    output: entries[0].output,
    cache_read: entries[0].cache_read,
    cache_write: entries[0].cache_write,
    requests: entries[0].requests,
  }, { input: 3, output: 25, cache_read: 110, cache_write: 15, requests: 2 });
  assert.equal(JSON.stringify(entries).includes("private"), false);
  await fs.rm(root, { recursive: true, force: true });
});

test("history parser refuses files outside the selected harness directory", async () => {
  const inside = await fixture([]);
  const outside = await fixture([]);
  await assert.rejects(() => parseHistoryFile(outside.file, {
    harness: "codex",
    root: inside.root,
  }), /outside/);
  await fs.rm(inside.root, { recursive: true, force: true });
  await fs.rm(outside.root, { recursive: true, force: true });
});

const jsonl = (lines) => `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`;
const tokens = (rows) => rows.reduce((sum, row) => sum + row.input + row.output + row.cache_read + row.cache_write + row.reasoning, 0);

test("Codex history reads compressed rollouts and prefers the plain copy during compression", { skip: !ZSTD_SUPPORTED }, async () => {
  const now = Date.UTC(2026, 10, 2, 12);
  const at = (minutes) => new Date(now - minutes * 60_000).toISOString();
  const rollout = (id, input) => jsonl([
    { timestamp: at(30), type: "session_meta", payload: { session_id: id } },
    { timestamp: at(30), type: "turn_context", payload: { model: "gpt-test" } },
    { timestamp: at(20), type: "event_msg", payload: { type: "token_count", info: { total_token_usage: { input_tokens: input, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 10, reasoning_output_tokens: 0, total_tokens: input + 10 } } } },
  ]);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "tokensburned-zst-"));
  const day = path.join(root, "2026", "11", "02");
  await fs.mkdir(day, { recursive: true });
  await fs.writeFile(path.join(day, "cold.jsonl.zst"), zlib.zstdCompressSync(rollout("cold", 100)));
  // Mid-compression both forms exist; only one may count.
  await fs.writeFile(path.join(day, "warm.jsonl"), rollout("warm", 200));
  await fs.writeFile(path.join(day, "warm.jsonl.zst"), zlib.zstdCompressSync(rollout("warm", 200)));
  const { entries, summary } = await collectHistoryEntries({ harnesses: ["codex"], roots: { codex: root }, now, days: 2 });
  assert.equal(summary.codex.files, 2);
  assert.equal(tokens(entries), 320);
  await fs.rm(root, { recursive: true, force: true });
});

test("Claude history counts messages copied into forked sessions once", async () => {
  const now = Date.UTC(2026, 10, 2, 12);
  const at = (minutes) => new Date(now - minutes * 60_000).toISOString();
  const assistant = (id, minutes, sessionId) => ({
    timestamp: at(minutes), type: "assistant", sessionId,
    message: { id, model: "claude-test", usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } },
  });
  const session = (sessionId, startMinutes, messages) => jsonl([
    { type: "custom-title", sessionId },
    { timestamp: at(startMinutes), type: "queue-operation", sessionId },
    ...messages.map(([id, minutes]) => assistant(id, minutes, sessionId)),
  ]);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "tokensburned-fork-"));
  const project = path.join(root, "-project");
  await fs.mkdir(project);
  const write = async (name, text) => {
    const file = path.join(project, `${name}.jsonl`);
    await fs.writeFile(file, text);
    await fs.utimes(file, now / 1000, now / 1000);
  };
  const collect = () => collectHistoryEntries({ harnesses: ["claude-code"], roots: { "claude-code": root }, now, days: 2 });
  await write("c-original", session("c-original", 100, [["m1", 90], ["m2", 80]]));
  // The fork copies m1 and m2 with their timestamps, then continues with m3.
  await write("a-fork", session("a-fork", 60, [["m1", 90], ["m2", 80], ["m3", 50]]));
  let { entries } = await collect();
  assert.equal(tokens(entries), 45);
  const retracted = entries.filter((row) => row.requests === 0);
  assert.equal(retracted.length, 1, "the fork retracts the bucket it previously double-counted");
  assert.equal(tokens(retracted), 0);

  // Once the original is deleted, exactly one remaining copy counts.
  await fs.rm(path.join(project, "c-original.jsonl"));
  await write("b-fork", session("b-fork", 40, [["m1", 90], ["m2", 80], ["m4", 30]]));
  ({ entries } = await collect());
  assert.equal(tokens(entries), 60);

  // A live hook parses one transcript and still finds the original.
  await write("c-original", session("c-original", 100, [["m1", 90], ["m2", 80]]));
  const forked = await parseHistoryFile(path.join(project, "b-fork.jsonl"), { harness: "claude-code", root, now });
  assert.equal(tokens(forked), 15);
  await fs.rm(root, { recursive: true, force: true });
});
