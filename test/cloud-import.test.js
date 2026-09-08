import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readOutbox } from "../src/server-outbox.js";
const exec = promisify(execFile);
const cli = path.resolve("bin/burn.js");
const observation = (id = "fixture-1") => ({ id, timestamp: new Date(Date.now() - 86_400_000).toISOString(), usage_semantics: "exclusive-delta", usage: { input_tokens: 100, output_tokens: 10, reasoning_tokens: 5 }, prompt: "PRIVATE-CONTENT", repository: "SECRET-REPO" });

test("cloud CLI only queues across processes; sync --cloud obeys server time and keeps local ingest separate", async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "burn-import-cli-"));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const data = path.join(home, "input.json"), log = path.join(home, "requests.jsonl");
  await fs.writeFile(data, JSON.stringify(observation()));
  const initialNow = Date.now();
  const env = { ...process.env, HOME: home, BURN_HOME: home, NO_COLOR: "1", BURN_TEST_NOW: String(initialNow) };
  const run = (...args) => exec(process.execPath, [cli, "ingest", data, "--harness", "opencode", ...args], { env });
  assert.match((await run("--upload", "--dry-run")).stdout, /No files written/);
  assert.deepEqual(await fs.readdir(home), ["input.json"]);
  await assert.rejects(run("--upload"), error => /Connect before cloud import/.test(error.stderr));
  await assert.rejects(exec(process.execPath, [cli, "sync", "--cloud"], { env }), error => /Connect before cloud sync/.test(error.stderr));
  assert.deepEqual(await fs.readdir(home), ["input.json"]);
  const mock = path.join(home, "mock.mjs");
  await fs.writeFile(mock, `
    import fs from 'node:fs/promises';
    const NativeDate = Date, clockNow = Number(process.env.BURN_TEST_NOW);
    globalThis.Date = class extends NativeDate { constructor(...args) { super(...(args.length ? args : [clockNow])); } static now() { return clockNow; } };
    globalThis.fetch = async (url, init) => {
      if (new URL(url).pathname !== "/v1/ingest/batch") throw new Error("Unexpected endpoint");
      const body = JSON.parse(init.body);
      await fs.appendFile(${JSON.stringify(log)}, JSON.stringify(body) + "\\n");
      return new Response(JSON.stringify({ accepted: body.days.length, acked_days: body.days }));
    };
  `);
  const outboxFile = path.join(home, "server-outbox.json");
  const allowedAt = initialNow + 3 * 3_600_000;
  await fs.writeFile(outboxFile, JSON.stringify({ version: 1, sources: {}, days: {}, server_next_upload_at: new Date(allowedAt).toISOString() }));
  await fs.writeFile(path.join(home, "config.json"), JSON.stringify({ server: { enabled: true, api_origin: "https://api.example.test" } }));
  await fs.writeFile(path.join(home, "credentials.json"), JSON.stringify({ device_token: `tb_live_importdevice.${"o".repeat(43)}`, api_origin: "https://api.example.test" }));
  const upload = (harness = "opencode") => exec(process.execPath, ["--import", mock, cli, "ingest", data, "--harness", harness, "--upload"], { env });
  assert.match((await upload()).stdout, /1 new cloud observation/);
  assert.match((await upload()).stdout, /0 new cloud observation/);
  for (const harness of ["cursor", "aider"]) assert.match((await upload(harness)).stdout, /1 new cloud observation/);
  await assert.rejects(fs.access(log));
  await assert.rejects(fs.access(path.join(home, "upload-worker.json")));
  assert.equal(Date.parse((await readOutbox(outboxFile)).server_next_upload_at), allowedAt);
  const cloudSync = (at) => exec(process.execPath, ["--import", mock, cli, "sync", "--cloud", "--force"], { env: { ...env, BURN_TEST_NOW: String(at) } });
  assert.match((await cloudSync(initialNow)).stdout, /next upload window/);
  await assert.rejects(fs.access(log));
  assert.match((await cloudSync(allowedAt)).stdout, /Server is up to date/);
  const requests = (await fs.readFile(log, "utf8")).trim().split("\n").map(JSON.parse);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].v, 2);
  assert.deepEqual(Object.keys(requests[0].days[0].dimensions.harness).sort(), ["aider", "cursor", "opencode"]);
  assert.equal(requests[0].days[0].input_tokens, 300);
  assert.equal(requests[0].days[0].reasoning_tokens, 15);
  assert.doesNotMatch(JSON.stringify(requests), /PRIVATE|SECRET|fixture-1|observation_hash|observation_id/);
  await assert.rejects(fs.access(path.join(home, "stats.json")));
  const changed = observation(); changed.usage.input_tokens = 200;
  await fs.writeFile(data, JSON.stringify(changed));
  await assert.rejects(upload(), error => /Conflicting/.test(error.stderr));
  assert.equal(requests.length, 1);
  assert.match((await run()).stdout, /Local statistics only/);
  await fs.access(path.join(home, "stats.json"));
});

test("cloud dry run rejects an invalid batch without writing partial observations", async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "burn-import-invalid-"));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const file = path.join(home, "input.json");
  await fs.writeFile(file, JSON.stringify([observation(), { ...observation("second"), usage_semantics: "cumulative" }]));
  await assert.rejects(exec(process.execPath, [cli, "ingest", file, "--harness", "cursor", "--upload", "--dry-run"], { env: { ...process.env, BURN_HOME: home } }), error => /exclusive-delta/.test(error.stderr));
  assert.deepEqual(await fs.readdir(home), ["input.json"]);
});

test("unsupported current harness backfill stops before reading another harness", async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "burn-harness-scope-"));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  await assert.rejects(exec(process.execPath, [cli, "backfill", "--dry-run"], { env: { ...process.env, BURN_HOME: home, TOKENSBURNED_HARNESS: "copilot", CODEX_PLUGIN_ROOT: "/installed" } }), error => /not supported for copilot/.test(error.stderr));
  assert.deepEqual(await fs.readdir(home), []);
});
