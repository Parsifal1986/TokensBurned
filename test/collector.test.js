import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readOpenCodeUsage } from "../src/opencode-usage.js";
import { runCollector, collectLocalUsage } from "../src/collector.js";
import { readOutbox } from "../src/server-outbox.js";
const exec = promisify(execFile);
const now = Date.UTC(2026, 8, 8, 12);
const message = (overrides = {}) => ({ role: "assistant", time: { completed: now - 1000 }, providerID: "provider-a", modelID: "model-a",
  tokens: { input: 100, output: 10, reasoning: 5, cache: { read: 20, write: 3 } }, ...overrides });
const quote = value => `'${String(value).replaceAll("'", "''")}'`;
async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "burn-collector-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const database = path.join(directory, "opencode.db");
  const sql = text => exec("sqlite3", [database, text]);
  await sql("CREATE TABLE message(id TEXT PRIMARY KEY, time_updated INTEGER, data TEXT); CREATE TABLE part(data TEXT);");
  const insert = (id, data) => sql(`INSERT INTO message VALUES(${quote(id)},${now},${quote(JSON.stringify(data))});`);
  return { directory, database, sql, insert };
}
const options = directory => ({ lockFile: path.join(directory, "collector.lock"), statusFile: path.join(directory, "status.json"), outboxFile: path.join(directory, "outbox.json"),
  configImpl: async () => ({ server: { enabled: true, api_origin: "https://api.example.test" } }),
  credentialsImpl: async () => ({ device_token: "test-device-token", api_origin: "https://api.example.test" }) });

test("OpenCode reads finalized numeric metadata without content, rejects unknown schemas and ambiguous counters", async t => {
  const f = await fixture(t);
  await f.insert("one", message({ text: "PRIVATE-PROMPT", directory: "/SECRET-PROJECT" }));
  await f.insert("unfinished", message({ time: {} }));
  await f.insert("user", message({ role: "user", content: "PRIVATE-PROMPT" }));
  await f.sql(`INSERT INTO part VALUES('${JSON.stringify({ text: "PRIVATE-CODE" })}');`);
  const before = await fs.readFile(f.database);
  const entries = await readOpenCodeUsage({ file: f.database, now });
  assert.equal(entries.length, 1);
  assert.deepEqual([entries[0].input_tokens, entries[0].output_tokens, entries[0].reasoning_tokens, entries[0].cache_read_tokens, entries[0].cache_write_tokens], [100, 10, 5, 20, 3]);
  assert.doesNotMatch(JSON.stringify(entries), /PRIVATE|SECRET|one/);
  assert.deepEqual(await fs.readFile(f.database), before, "read-only extraction never changes the database");
  await f.insert("invalid", message({ tokens: { input: 100, output: 10 } }));
  await assert.rejects(readOpenCodeUsage({ file: f.database, now }), /Unsupported OpenCode usage counters/);
  await f.sql("DELETE FROM message WHERE id='invalid'; CREATE TABLE session_message(id TEXT); INSERT INTO session_message VALUES('v2');");
  await assert.rejects(readOpenCodeUsage({ file: f.database, now }), /v2.*not supported/);
});

test("collector discovers new local usage, deduplicates rescans, waits for server time and retries offline without a hook", async t => {
  const f = await fixture(t), opts = options(f.directory);
  await f.insert("one", message());
  await fs.writeFile(opts.outboxFile, JSON.stringify({ version: 1, sources: {}, days: {}, server_next_upload_at: new Date(now + 120_000).toISOString() }));
  let time = now, scans = 0, sleeps = 0;
  const sent = [];
  await runCollector({ ...opts, harnesses: ["opencode"], clock: () => time, maxCycles: 4,
    collectImpl: args => { scans++; return collectLocalUsage({ ...args, openCodeImpl: parameters => readOpenCodeUsage({ ...parameters, file: f.database }) }); },
    sleep: async ms => {
      time += ms;
      if (++sleeps === 1) await f.insert("two", message({ providerID: "provider-b", modelID: "model-b" }));
    },
    fetchImpl: async (_url, init) => {
      assert.ok(time >= now + 120_000, "no early upload");
      sent.push(JSON.parse(init.body));
      if (sent.length === 1) throw new Error("offline");
      assert.ok(time >= now + 180_000, "persisted backoff is respected");
      return new Response(JSON.stringify({ acked_days: sent.at(-1).days, next_flush_after: 3600 }));
    },
  });
  assert.equal(scans, 4);
  assert.equal(sent.length, 2);
  assert.deepEqual(sent[0], sent[1], "offline retry sends the same revision");
  assert.equal(sent[1].days[0].input_tokens, 200);
  assert.equal(sent[1].days[0].request_count, 2);
  const box = await readOutbox(opts.outboxFile);
  assert.equal(Object.values(box.days)[0].revision, Object.values(box.days)[0].acked_revision);
  assert.equal(JSON.parse(await fs.readFile(opts.statusFile)).running, false);
  await assert.rejects(fs.access(opts.lockFile));
});

test("collector is single-instance, honors stop/disconnect and refuses unsupported sources before collection", async t => {
  const f = await fixture(t), opts = options(f.directory);
  let started, release;
  const entered = new Promise(resolve => { started = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const collectImpl = async () => ({ entries: [], errors: [], checkpoints: {} });
  const controller = new AbortController();
  const first = runCollector({ ...opts, harnesses: ["codex"], collectImpl, signal: controller.signal, sleep: async () => { started(); await gate; } });
  await entered;
  try { await assert.rejects(runCollector({ ...opts, collectImpl }), /already running/); }
  finally { controller.abort(); release(); }
  assert.equal((await first).reason, "stopped");
  let scanned = false;
  const disconnected = await runCollector({ ...opts, configImpl: async () => ({ server: { enabled: false } }), collectImpl: async () => { scanned = true; } });
  assert.equal(disconnected.reason, "not-connected");
  assert.equal(scanned, false);
  for (const harness of ["cursor", "aider"]) await assert.rejects(runCollector({ ...opts, harnesses: [harness], collectImpl }), /do not yet have verified/);
  await assert.rejects(fs.access(opts.lockFile));
});

test("failed source scans do not advance checkpoints or block healthy sources", async () => {
  const previous = { codex: new Date(now - 5 * 86_400_000).toISOString() };
  const result = await collectLocalUsage({ harnesses: ["codex", "opencode"], now, previous,
    historyImpl: async options => { assert.equal(options.days, 6); throw new Error("PRIVATE-CONTENT"); },
    openCodeImpl: async () => [{ fixture: true }],
  });
  assert.deepEqual(result.entries, [{ fixture: true }]);
  assert.deepEqual(result.errors, ["codex"]);
  assert.equal(result.checkpoints.codex, previous.codex);
  assert.equal(result.checkpoints.opencode, new Date(now).toISOString());
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE/);
});

test("real CLI run collects an isolated OpenCode DB, uploads, rejects a duplicate process and stops on SIGTERM", { timeout: 15_000 }, async t => {
  const f = await fixture(t);
  await f.insert("one", message());
  await fs.writeFile(path.join(f.directory, "config.json"), JSON.stringify({ server: { enabled: true, api_origin: "https://api.example.test" } }));
  await fs.writeFile(path.join(f.directory, "credentials.json"), JSON.stringify({ device_token: "test-device-token", api_origin: "https://api.example.test" }));
  const mock = path.join(f.directory, "mock.mjs");
  const log = path.join(f.directory, "sent.json");
  await fs.writeFile(mock, `
    import fs from 'node:fs/promises';
    const OriginalDate = Date;
    globalThis.Date = class extends OriginalDate { constructor(...args) { super(...(args.length ? args : [${now}])); } static now() { return ${now}; } };
    globalThis.fetch = async (url, init) => {
      if (new URL(url).pathname !== '/v1/ingest/batch') throw new Error('Unexpected endpoint');
      const body = JSON.parse(init.body); await fs.writeFile(${JSON.stringify(log)}, init.body);
      return new Response(JSON.stringify({ acked_days: body.days, next_flush_after: 3600 }));
    };
  `);
  const cli = path.resolve("bin/burn.js");
  const env = { ...process.env, HOME: f.directory, BURN_HOME: f.directory, OPENCODE_DB: f.database, NO_COLOR: "1" };
  const args = ["--import", mock, cli, "run", "--foreground", "--harness", "opencode"];
  const processResult = exec(process.execPath, args, { env });
  // Attach the rejection handler immediately so an early exit is reported below.
  const completed = processResult.then(value => ({ value }), error => ({ error }));
  const child = processResult.child;
  t.after(() => { if (child.exitCode === null) child.kill("SIGTERM"); });
  const statusFile = path.join(f.directory, "collector-status.json");
  try {
    const deadline = Date.now() + 8000;
    let status;
    while (Date.now() < deadline) {
      try { status = JSON.parse(await fs.readFile(statusFile, "utf8")); } catch {}
      if (status?.running && status.pending_days === 0) break;
      if (child.exitCode !== null) assert.fail(JSON.stringify(await completed));
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    assert.equal(status?.running, true);
    const sent = JSON.parse(await fs.readFile(log));
    assert.equal(sent.days[0].input_tokens, 100);
    await assert.rejects(exec(process.execPath, args, { env }), error => /already running/.test(error.stderr));
    assert.match((await exec(process.execPath, [cli, "status"], { env })).stdout, /collector: running/);
  } finally { child.kill("SIGTERM"); }
  const stopped = await completed;
  assert.equal(stopped.error, undefined);
  assert.equal(JSON.parse(await fs.readFile(statusFile)).running, false);
  await assert.rejects(fs.access(path.join(f.directory, "collector.lock")));
  for (const args of [["--force"], ["--harness"], ["--interval", "1"]]) {
    await assert.rejects(exec(process.execPath, [cli, "run", ...args], { env }), error => /server-controlled/.test(error.stderr));
  }
});
