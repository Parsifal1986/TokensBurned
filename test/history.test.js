import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseHistoryFile } from "../src/history.js";

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
