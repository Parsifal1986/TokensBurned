import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readPiUsage, piObservation, piSessionRoots } from "../src/pi-usage.js";
import { collectHistoryEntries } from "../src/history.js";
import { collectLocalUsage } from "../src/collector.js";

const exec = promisify(execFile);
const now = Date.UTC(2026, 10, 2, 12);
const stamp = (offset = 1000, base = now) => new Date(base - offset).toISOString();
const total = row => ["input_tokens", "output_tokens", "reasoning_tokens", "cache_read_tokens", "cache_write_tokens"].reduce((n, key) => n + row[key], 0);
const usage = (overrides = {}) => ({ input: 100, output: 20, cacheRead: 30, cacheWrite: 10, reasoning: 5, totalTokens: 160,
  cost: { input: 0.1, output: 0.2, cacheRead: 0.01, cacheWrite: 0.02, total: 0.33 }, ...overrides });
const header = (id = "s1") => ({ type: "session", version: 3, id, timestamp: stamp(9000), cwd: "/Users/private/project" });
const assistant = (overrides = {}, base = now) => ({ type: "message", id: "a1b2c3d4", parentId: null, timestamp: stamp(1000, base),
  message: { role: "assistant", content: [{ type: "text", text: "PRIVATE-RESPONSE" }], api: "anthropic-messages",
    provider: "anthropic", model: "claude-requested", responseModel: "claude-served", usage: usage(), stopReason: "stop", timestamp: base - 5000 },
  ...overrides });
const warm = (base = now) => ({ type: "usage", id: "e5f6a7b8", parentId: "a1b2c3d4", timestamp: stamp(500, base), kind: "cache_warm",
  provider: "anthropic", model: "claude-served", usage: usage({ input: 2, output: 1, cacheRead: 500, cacheWrite: 0, reasoning: undefined }) });
const lines = records => records.map(JSON.stringify).join("\n") + "\n";

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "burn-pi-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const write = async (name, data) => {
    const file = path.join(root, name);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, data);
    return file;
  };
  return { root, write };
}

test("Pi session JSONL counts assistant, usage, summary and tool usage once across forks", async t => {
  const f = await fixture(t);
  const sessions = path.join(f.root, ".pi/agent/sessions");
  const records = [
    header(), { type: "model_change", id: "m0", parentId: null, timestamp: stamp(8000), provider: "anthropic", modelId: "claude-served" },
    { type: "message", id: "u0", parentId: null, timestamp: stamp(7000), message: { role: "user", content: "PRIVATE-PROMPT", timestamp: now - 7000 } },
    assistant(), warm(),
    { type: "compaction", id: "c0c0c0c0", parentId: "e5f6a7b8", timestamp: stamp(400), summary: "PRIVATE-SUMMARY", firstKeptEntryId: "u0",
      tokensBefore: 90000, usage: usage({ input: 1000, output: 200, cacheRead: 0, cacheWrite: 0, reasoning: undefined }) },
    { type: "message", id: "t0t0t0t0", parentId: "c0c0c0c0", timestamp: stamp(300), message: { role: "toolResult", toolCallId: "x", toolName: "code",
      content: [{ type: "text", text: "PRIVATE-TOOL" }], usage: usage({ input: 7, output: 3, cacheRead: 0, cacheWrite: 0, reasoning: 0 }), isError: false, timestamp: now - 300 } },
    // Extension-supplied summary usage that is malformed is skipped, not estimated.
    { type: "branch_summary", id: "b0b0b0b0", parentId: null, timestamp: stamp(200), fromId: "u0", summary: "x", usage: { input: 1.5, output: 2 } },
    assistant({ id: "p0p0p0p0", message: { ...assistant().message, stopReason: "pending" } }),
    assistant({ id: "z0z0z0z0", message: { ...assistant().message, stopReason: "error", usage: usage({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0 }) } }),
    // A v1 entry without an id cannot be deduplicated after Pi rewrites it.
    { type: "message", timestamp: stamp(100), message: { ...assistant().message } },
  ];
  await f.write(".pi/agent/sessions/--Users-private-project--/2026-11-02T11-59-50-000Z_s1.jsonl", lines(records) + '{"incomplete":');
  // /fork copies every entry verbatim under a new session header.
  await f.write(".pi/agent/sessions/--Users-private-project--/2026-11-02T11-59-55-000Z_s2.jsonl", lines([header("s2"), ...records.slice(1)]));
  await f.write(".pi/agent/sessions/--Users-private-project--/notes.jsonl", lines([assistant({ id: "n0n0n0n0" })]));
  const rows = await readPiUsage({ root: sessions, now });
  assert.equal(rows.length, 4);
  const byModel = Object.fromEntries(rows.map(row => [`${row.provider}/${row.model}:${total(row)}`, row]));
  assert.deepEqual(Object.keys(byModel).sort(), ["anthropic/claude-served:160", "anthropic/claude-served:503", "unknown/unknown:10", "unknown/unknown:1200"]);
  const main = byModel["anthropic/claude-served:160"];
  assert.deepEqual([main.input_tokens, main.output_tokens, main.reasoning_tokens, main.cache_read_tokens, main.cache_write_tokens], [100, 15, 5, 30, 10]);
  assert.equal(main.harness, "pi");
  assert.doesNotMatch(JSON.stringify(rows), /PRIVATE|Users|project|s1\.jsonl|cost/);
});

test("Oh My Pi profiles, model_usage, reasoningTokens and orchestration are read from session trees only", async t => {
  const f = await fixture(t);
  const omp = assistant({ id: "o1o1o1o1", message: { ...assistant().message, provider: "openai", model: "gpt-test", responseModel: undefined,
    usage: { input: 50, output: 10, cacheRead: 0, cacheWrite: 0, reasoningTokens: 4, orchestration: { input: 3, output: 2, cacheRead: 1 }, totalTokens: 66 } } });
  const ledger = { type: "model_usage", id: "l1l1l1l1", parentId: "o1o1o1o1", timestamp: stamp(200), purpose: "title", api: "x",
    provider: "openai", model: "gpt-small", usage: { input: 9, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 10 }, stopReason: "stop" };
  await f.write(".omp/agent/sessions/--work--/2026-11-02_s.jsonl", lines([header("o"), omp]));
  // Subagent transcripts nest under the parent session's artifact directory.
  await f.write(".omp/agent/sessions/--work--/2026-11-02_s/Explore.jsonl", lines([header("sub"), ledger]));
  await f.write(".omp/profiles/work/agent/sessions/--work--/p.jsonl", lines([header("p"), assistant({ id: "w1w1w1w1" })]));
  await f.write(".omp/profiles/work/agent/history.jsonl", lines([header("h"), assistant({ id: "h1h1h1h1" })]));
  const rows = await readPiUsage({ root: piSessionRoots({}, f.root), now });
  assert.deepEqual(rows.map(row => `${row.model}:${total(row)}`).sort(), ["claude-served:160", "gpt-small:10", "gpt-test:66"]);
  const openai = rows.find(row => row.model === "gpt-test");
  assert.deepEqual([openai.input_tokens, openai.output_tokens, openai.reasoning_tokens, openai.cache_read_tokens], [53, 8, 4, 1]);
});

test("Pi usage validation, time window and session root overrides", () => {
  assert.throws(() => piObservation(assistant({ message: { ...assistant().message, usage: usage({ reasoning: 21 }) } }), { now }), /Unsupported Pi usage/);
  assert.throws(() => piObservation(assistant({ message: { ...assistant().message, usage: { input: 1, output: 1 } } }), { now }), /Unsupported Pi usage/);
  assert.equal(piObservation(assistant({ timestamp: stamp(3 * 86_400_000) }), { now, days: 2 }), null);
  assert.equal(piObservation(assistant({ timestamp: stamp(-1000) }), { now }), null);
  assert.equal(piObservation(assistant({ message: { ...assistant().message, provider: "Custom Proxy!" } }), { now }).provider, "unknown");
  const home = "/home/user";
  assert.deepEqual(piSessionRoots({}, home), ["/home/user/.pi/agent/sessions", "/home/user/.omp/agent/sessions", "/home/user/.omp/profiles"]);
  assert.equal(piSessionRoots({ PI_CODING_AGENT_DIR: "~/alt" }, home)[0], "/home/user/alt/sessions");
  assert.equal(piSessionRoots({ PI_CODING_AGENT_DIR: "~/alt", PI_CODING_AGENT_SESSION_DIR: "/data/pi" }, home)[0], "/data/pi");
  assert.deepEqual(piSessionRoots({ XDG_DATA_HOME: "/xdg" }, home).slice(3), ["/xdg/omp/sessions", "/xdg/omp/profiles"]);
});

test("Pi history backfill, collector isolation and CLI dry-run report exact totals", async t => {
  const f = await fixture(t);
  const current = Date.now();
  await f.write(".pi/agent/sessions/--project--/s.jsonl", lines([header(), assistant({}, current), warm(current)]));
  const history = await collectHistoryEntries({ harnesses: ["pi"], roots: { pi: [path.join(f.root, ".pi/agent/sessions")] }, now: current, days: 90 });
  assert.equal(history.entries.map(total).reduce((a, b) => a + b), 663);
  const result = await collectLocalUsage({ harnesses: ["pi"], now, piImpl: async () => { throw new Error("PRIVATE"); } });
  assert.deepEqual(result.errors, ["pi"]);
  const { stdout } = await exec(process.execPath, ["bin/burn.js", "backfill", "--harness", "pi", "--days", "7", "--dry-run"], {
    env: { ...process.env, HOME: f.root, BURN_HOME: path.join(f.root, ".burn"), PI_CODING_AGENT_DIR: "", PI_CODING_AGENT_SESSION_DIR: "", XDG_DATA_HOME: "", NO_COLOR: "1" },
  });
  assert.match(stdout, /Would import 663 tokens from pi: 2 usage records/);
  await assert.rejects(fs.access(path.join(f.root, ".burn/server-outbox.json")));
});
