import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const cli = path.resolve("bin/burn.js");

test("connect preserves the legacy device ID and ACKs, including across disconnect", async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "burn-connect-test-"));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const oldId = "original_device";
  const newId = "new_account_device";
  let mode = "reuse";
  const apiOrigin = "https://api.example.test";
  const mockFetch = path.join(home, "mock-fetch.mjs");
  const hintFile = path.join(home, "hint.json");
  await fs.writeFile(mockFetch, `
  import fs from "node:fs/promises";
  const mode = process.env.BURN_TEST_RECONNECT_MODE;
  const oldId = "original_device";
  const newId = "new_account_device";
  const apiOrigin = "https://api.example.test";
  globalThis.fetch = async (url, init) => {
    const body = init.body ? JSON.parse(init.body) : {};
    const pathname = new URL(url).pathname;
    let result = {};
    if (pathname === "/v1/auth/device/start") {
      result = { device_code: "test-code", user_code: "ABCD-2345", verification_uri: apiOrigin + "/verify", interval: 1 };
    } else if (pathname === "/v1/auth/device/status") {
      await fs.writeFile(process.env.BURN_TEST_HINT_FILE, JSON.stringify(body.previous_device_id));
      result = {
        status: "authorized", token: "tb_live_" + (mode === "reuse" ? oldId : newId) + "." + "s".repeat(43),
        user: { github_login: "test-user" }, privacy: { public_card: false },
        ...(mode === "legacy" ? {} : { device_reused: mode === "reuse" }),
      };
    }
    if (pathname === "/v1/me/device" && init.method === "DELETE") {
      result = { disconnected_at: "2026-09-04T00:00:00.000Z", slot_reusable_at: "2026-10-04T00:00:00.000Z" };
    }
    return new Response(JSON.stringify(result));
  };
  `);
  const env = { ...process.env, BURN_HOME: home, NO_COLOR: "1", BURN_TEST_HINT_FILE: hintFile };
  const configFile = path.join(home, "config.json");
  const credentialsFile = path.join(home, "credentials.json");
  const outboxFile = path.join(home, "server-outbox.json");
  await fs.writeFile(configFile, JSON.stringify({ server: { enabled: true, api_origin: apiOrigin }, updates: { last_checked_at: new Date().toISOString() } }));
  await fs.writeFile(credentialsFile, JSON.stringify({ device_token: `tb_live_${oldId}.${"o".repeat(43)}` }));
  await fs.writeFile(outboxFile, JSON.stringify({ version: 1, sources: {}, days: { day: { revision: 5, acked_revision: 5 } } }));
  const connect = () => execFileAsync(process.execPath, ["--import", mockFetch, cli, "connect", "--api-origin", apiOrigin, "--no-open", "--no-backfill"], { env: { ...env, BURN_TEST_RECONNECT_MODE: mode } });
  await connect();
  assert.equal(JSON.parse(await fs.readFile(hintFile)), oldId, "upgrades recover identity from the old token");
  assert.equal(JSON.parse(await fs.readFile(outboxFile)).days.day.acked_revision, 5);
  await execFileAsync(process.execPath, ["--import", mockFetch, cli, "disconnect", "--yes"], { env });
  const disconnected = JSON.parse(await fs.readFile(configFile));
  assert.equal(disconnected.server.device_id, oldId);
  assert.equal(disconnected.server.api_origin, apiOrigin);
  assert.equal(disconnected.server.slot_reusable_at, "2026-10-04T00:00:00.000Z");
  assert.deepEqual(JSON.parse(await fs.readFile(credentialsFile)), { version: 2, device_token: null, expires_at: null });
  const repeat = await execFileAsync(process.execPath, [cli, "disconnect", "--yes"], { env });
  assert.match(repeat.stdout, /already disconnected/);
  assert.match(repeat.stdout, /2026-10-04T00:00:00.000Z/);
  await connect();
  assert.equal(JSON.parse(await fs.readFile(hintFile)), oldId);
  assert.equal(JSON.parse(await fs.readFile(configFile)).server.slot_reusable_at, null);
  assert.equal(JSON.parse(await fs.readFile(outboxFile)).days.day.acked_revision, 5);

  mode = "legacy";
  const savedCredentials = await fs.readFile(credentialsFile, "utf8");
  await assert.rejects(connect, (error) => /does not support safe device reconnection/.test(error.stderr));
  assert.equal(await fs.readFile(credentialsFile, "utf8"), savedCredentials);
  assert.equal(JSON.parse(await fs.readFile(outboxFile)).days.day.acked_revision, 5);

  mode = "new-account";
  await connect();
  assert.equal(JSON.parse(await fs.readFile(configFile)).server.device_id, newId);
  assert.equal(JSON.parse(await fs.readFile(outboxFile)).days.day.acked_revision, 0);
});

test("legacy local ingest remains offline; retired commands cannot mutate data", async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "burn-test-"));
  const env = { ...process.env, BURN_HOME: home, NO_COLOR: "1" };
  const fixture = path.join(home, "event.json");
  await fs.writeFile(fixture, JSON.stringify({
    timestamp: new Date().toISOString(),
    harness: { id: "claude-code" },
    backend: { provider: "deepseek", confidence: "detected" },
    usage: { input_tokens: 1000 },
  }));
  const ingest = await execFileAsync(process.execPath, [cli, "ingest", fixture], { env });
  assert.match(ingest.stdout, /1 event added locally/);
  const status = await execFileAsync(process.execPath, [cli], { env });
  assert.match(status.stdout, /Claude Code/);
  assert.match(status.stdout, /DeepSeek/);
  const before = await fs.readFile(path.join(home, "stats.json"), "utf8");
  for (const command of ["setup", "sync", "render", "clean"]) {
    await assert.rejects(execFileAsync(process.execPath, [cli, command, "--yes"], { env }), error => /is retired/.test(error.stderr));
    assert.equal(await fs.readFile(path.join(home, "stats.json"), "utf8"), before);
  }
  await assert.rejects(fs.access(path.join(home, "stats.svg")));
  await fs.rm(home, { recursive: true, force: true });
});

test("backfill defaults to the current harness and requires explicit cross-harness scope", async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "tokensburned-scope-"));
  const codexRoot = path.join(home, ".codex", "sessions");
  const claudeRoot = path.join(home, ".claude", "projects");
  await Promise.all([
    fs.mkdir(codexRoot, { recursive: true }),
    fs.mkdir(claudeRoot, { recursive: true }),
  ]);
  const timestamp = new Date().toISOString();
  await fs.writeFile(path.join(codexRoot, "codex.jsonl"), [
    { timestamp, type: "session_meta", payload: { session_id: "codex-session" } },
    { timestamp, type: "turn_context", payload: { model: "gpt-test" } },
    { timestamp, type: "event_msg", payload: { type: "token_count", info: { total_token_usage: { input_tokens: 100, output_tokens: 50 } } } },
  ].map((line) => JSON.stringify(line)).join("\n") + "\n");
  await fs.writeFile(path.join(claudeRoot, "claude.jsonl"), `${JSON.stringify({
    timestamp,
    type: "assistant",
    sessionId: "claude-session",
    message: { id: "message-1", model: "claude-test", usage: { input_tokens: 20, output_tokens: 10 } },
  })}\n`);

  const baseEnv = {
    ...process.env,
    HOME: home,
    BURN_HOME: path.join(home, ".burn"),
    NO_COLOR: "1",
  };
  const codex = await execFileAsync(process.execPath, [cli, "backfill", "--dry-run", "--days", "1"], {
    env: { ...baseEnv, CODEX_PLUGIN_ROOT: "/example/codex-plugin" },
  });
  assert.match(codex.stdout, /from 1 codex history files/);
  assert.doesNotMatch(codex.stdout, /claude-code/);

  const all = await execFileAsync(process.execPath, [cli, "backfill", "--dry-run", "--days", "1", "--all-harnesses"], {
    env: baseEnv,
  });
  assert.match(all.stdout, /claude-code, codex, gemini-cli, opencode, cline: 2 usage records/);

  await assert.rejects(
    execFileAsync(process.execPath, [cli, "backfill", "--dry-run", "--days", "1"], { env: baseEnv }),
    (error) => /Could not determine the current harness/.test(error.stderr),
  );
  await fs.rm(home, { recursive: true, force: true });
});

test("privacy commands refuse to claim success before connection", async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "tokensburned-privacy-"));
  const env = { ...process.env, BURN_HOME: home, NO_COLOR: "1" };
  await assert.rejects(
    execFileAsync(process.execPath, [cli, "privacy", "public"], { env }),
    (error) => /TokensBurned is not connected/.test(error.stderr)
      && !/Public visibility enabled/.test(error.stdout),
  );
  await fs.rm(home, { recursive: true, force: true });
});

test("CLI refuses to send a newly bound credential after an API configuration mismatch", async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "burn-origin-mismatch-"));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  await fs.writeFile(path.join(home, "config.json"), JSON.stringify({ server: { enabled: true, api_origin: "https://other.example" } }));
  await fs.writeFile(path.join(home, "credentials.json"), JSON.stringify({ device_token: "private-fixture", api_origin: "https://original.example" }));
  const mock = path.join(home, "fetch.mjs");
  await fs.writeFile(mock, `globalThis.fetch = async () => { throw new Error("Unexpected network request"); };`);
  await assert.rejects(execFileAsync(process.execPath, ["--import", mock, cli, "server"], {
    env: { ...process.env, BURN_HOME: home, NO_COLOR: "1", TOKENSBURNED_DISABLE_UPDATE_CHECK: "1" },
  }), (error) => /different API origin/.test(error.stderr) && !/Unexpected network request/.test(error.stderr));
});


test("disconnect keeps credentials after a server failure and only records confirmed cooldown dates", async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "burn-disconnect-test-"));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const config = { server: { enabled: true, api_origin: "https://api.example.test" } };
  const credentials = { device_token: `tb_live_original_device.${"s".repeat(43)}` };
  const configFile = path.join(home, "config.json");
  const credentialsFile = path.join(home, "credentials.json");
  await fs.writeFile(configFile, JSON.stringify(config));
  await fs.writeFile(credentialsFile, JSON.stringify(credentials));
  const mock = path.join(home, "fetch.mjs");
  await fs.writeFile(mock, `globalThis.fetch = async () => new Response(
    JSON.stringify({ error: { code: "unavailable", message: "Server unavailable" } }), { status: 503 });`);
  const env = { ...process.env, BURN_HOME: home, NO_COLOR: "1" };
  const disconnect = () => execFileAsync(process.execPath, ["--import", mock, cli, "disconnect", "--yes"], { env });
  await assert.rejects(disconnect, (error) => /Server unavailable/.test(error.stderr));
  assert.deepEqual(JSON.parse(await fs.readFile(credentialsFile)), credentials);
  assert.deepEqual(JSON.parse(await fs.readFile(configFile)), config);
  // Older supported Workers may return 204; do not invent a release timestamp.
  await fs.writeFile(mock, `globalThis.fetch = async () => new Response(null, { status: 204 });`);
  const result = await disconnect();
  assert.match(result.stdout, /Cloud history was kept/);
  assert.equal(JSON.parse(await fs.readFile(configFile)).server.slot_reusable_at, null);
  assert.equal(JSON.parse(await fs.readFile(credentialsFile)).device_token, null);
});

test("SessionEnd hook uploads at most once per hour instead of forcing every session (B1)", async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "burn-hook-home-"));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const burnHome = path.join(home, ".burn");
  const sessions = path.join(home, ".codex", "sessions");
  await fs.mkdir(sessions, { recursive: true });
  const at = new Date(Date.now() - 60_000).toISOString();
  const transcript = path.join(sessions, "rollout.jsonl");
  await fs.writeFile(transcript, [
    { timestamp: at, type: "session_meta", payload: { session_id: "hook-session" } },
    { timestamp: at, type: "turn_context", payload: { model: "gpt-5" } },
    { timestamp: at, type: "event_msg", payload: { type: "token_count", info: { total_token_usage: { input_tokens: 100, cached_input_tokens: 20, output_tokens: 50, reasoning_output_tokens: 10 } } } },
  ].map((line) => JSON.stringify(line)).join("\n") + "\n");
  const countFile = path.join(home, "uploads.txt");
  const mockFetch = path.join(home, "mock-fetch.mjs");
  await fs.writeFile(mockFetch, `
  import fs from "node:fs/promises";
  globalThis.fetch = async (url, init) => {
    if (new URL(url).pathname !== "/v1/ingest/batch") return new Response("{}");
    await fs.appendFile(process.env.BURN_TEST_COUNT_FILE, "x");
    const { days } = JSON.parse(init.body);
    return new Response(JSON.stringify({ accepted: days.length, acked_days: days }));
  };
  `);
  await fs.mkdir(burnHome, { recursive: true });
  await fs.writeFile(path.join(burnHome, "config.json"), JSON.stringify({
    server: { enabled: true, api_origin: "https://api.example.test" },
    updates: { last_checked_at: new Date().toISOString() },
  }));
  await fs.writeFile(path.join(burnHome, "credentials.json"), JSON.stringify({ device_token: `tb_live_hookdevice.${"o".repeat(43)}` }));
  const env = { ...process.env, HOME: home, BURN_HOME: burnHome, NO_COLOR: "1", BURN_TEST_COUNT_FILE: countFile };
  const hook = async () => {
    const child = execFile(process.execPath, ["--import", mockFetch, cli, "hook", "codex"], { env });
    child.stdin.end(JSON.stringify({ transcript_path: transcript, prompt: "never read" }));
    await new Promise((resolve, reject) => child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`)))));
  };
  await hook();
  await hook();
  await hook();
  assert.equal((await fs.readFile(countFile, "utf8")).length, 1, "repeated SessionEnd hooks within an hour reuse the first upload");
  const outbox = JSON.parse(await fs.readFile(path.join(burnHome, "server-outbox.json"), "utf8"));
  assert.ok(outbox.last_successful_upload_at);
  assert.ok(Object.values(outbox.days).every((day) => day.acked_revision === day.revision));
});

test("Stop merges every turn, SessionStart catches up, and one waiting worker uploads when the window opens", async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "burn-hook-worker-"));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const burnHome = path.join(home, ".burn");
  const sessions = path.join(home, ".codex", "sessions");
  await fs.mkdir(sessions, { recursive: true });
  await fs.mkdir(burnHome, { recursive: true });
  const at = new Date(Date.now() - 60_000).toISOString();
  const transcript = path.join(sessions, "rollout.jsonl");
  const line = (usage) => JSON.stringify({ timestamp: at, type: "event_msg", payload: { type: "token_count", info: { total_token_usage: usage } } });
  await fs.writeFile(transcript, [
    JSON.stringify({ timestamp: at, type: "session_meta", payload: { session_id: "worker-session" } }),
    JSON.stringify({ timestamp: at, type: "turn_context", payload: { model: "gpt-5" } }),
    line({ input_tokens: 100, cached_input_tokens: 20, output_tokens: 50, reasoning_output_tokens: 10 }),
  ].join("\n") + "\n");
  const countFile = path.join(home, "uploads.txt");
  const mockFetch = path.join(home, "mock-fetch.mjs");
  await fs.writeFile(mockFetch, `
  import fs from "node:fs/promises";
  globalThis.fetch = async (url, init) => {
    if (new URL(url).pathname !== "/v1/ingest/batch") return new Response("{}");
    const { days } = JSON.parse(init.body);
    await fs.appendFile(process.env.BURN_TEST_COUNT_FILE, process.argv.includes("upload-worker") ? "worker;" : "hook;");
    return new Response(JSON.stringify({ accepted: days.length, acked_days: days }));
  };
  `);
  await fs.writeFile(path.join(burnHome, "config.json"), JSON.stringify({
    server: { enabled: true, api_origin: "https://api.example.test" },
    updates: { last_checked_at: new Date().toISOString() },
  }));
  await fs.writeFile(path.join(burnHome, "credentials.json"), JSON.stringify({ device_token: `tb_live_workerdevice.${"o".repeat(43)}` }));
  const outboxFile = path.join(burnHome, "server-outbox.json");
  const lockFile = path.join(burnHome, "upload-worker.json");
  // NODE_OPTIONS reaches the detached worker, which is spawned without --import.
  const WINDOW = 10_000; // shrink the UTC write window so the boundary arrives within seconds
  const env = { ...process.env, HOME: home, BURN_HOME: burnHome, NO_COLOR: "1", BURN_TEST_COUNT_FILE: countFile, NODE_OPTIONS: `--import ${mockFetch}`, CODEX_PLUGIN_ROOT: path.resolve("."), TOKENSBURNED_UPLOAD_WINDOW_MS: String(WINDOW) };
  const hook = async (payload) => {
    const child = execFile(process.execPath, [cli, "hook", "codex"], { env });
    child.stdin.end(JSON.stringify(payload));
    await new Promise((resolve, reject) => child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`)))));
  };
  const waitFor = async (predicate, timeoutMs = 30_000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await predicate()) return true;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return false;
  };
  const uploads = async () => (await fs.readFile(countFile, "utf8").catch(() => "")).split(";").filter(Boolean);
  const readOutbox = async () => JSON.parse(await fs.readFile(outboxFile, "utf8"));
  const exists = (file) => fs.access(file).then(() => true, () => false);

  // 1. First SessionEnd: merge and upload right away (no earlier upload), no worker needed.
  await hook({ transcript_path: transcript, hook_event_name: "SessionEnd" });
  assert.deepEqual(await uploads(), ["hook"]);
  assert.equal(await exists(lockFile), false, "nothing pending, so no worker");

  // 2. Park a pending day with the last upload two hours old: SessionStart
  //    (transcript not yet written) catches up recent transcripts and flushes.
  let outbox = await readOutbox();
  const [dayKey] = Object.keys(outbox.days);
  outbox.days[dayKey].revision += 1;
  outbox.last_successful_upload_at = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  await fs.writeFile(outboxFile, JSON.stringify(outbox));
  await hook({ transcript_path: path.join(sessions, "not-yet.jsonl"), hook_event_name: "SessionStart" });
  assert.deepEqual(await uploads(), ["hook", "hook"], "SessionStart flushed the pending day");
  assert.equal((await readOutbox()).days[dayKey].acked_revision, outbox.days[dayKey].revision);

  // 3. Close the window: pretend the last upload happened in the current
  //    window so the next boundary is 6-16 s away. A Stop merges the new turn
  //    immediately and leaves one worker waiting.
  outbox = await readOutbox();
  const boundary = Math.ceil((Date.now() + 6_000) / WINDOW) * WINDOW;
  outbox.last_successful_upload_at = new Date(boundary - WINDOW).toISOString();
  await fs.writeFile(outboxFile, JSON.stringify(outbox));
  await fs.appendFile(transcript, line({ input_tokens: 300, cached_input_tokens: 20, output_tokens: 150, reasoning_output_tokens: 10 }) + "\n");
  await hook({ transcript_path: transcript, hook_event_name: "Stop" });
  outbox = await readOutbox();
  const source = Object.values(outbox.sources).find((entry) => entry.request_count === 2);
  assert.ok(source, "Stop merged the new turn without any throttle");
  assert.equal(outbox.days[dayKey].revision > outbox.days[dayKey].acked_revision, true, "day is pending again");
  assert.deepEqual(await uploads(), ["hook", "hook"], "window closed: the hook itself did not upload");
  const lock = JSON.parse(await fs.readFile(lockFile, "utf8"));
  assert.ok(Number.isInteger(lock.pid) && lock.pid > 0);
  assert.ok(Date.parse(lock.fire_at) > Date.now() - 1000);

  // 4. A second Stop while the worker waits does not start another one.
  await hook({ transcript_path: transcript, hook_event_name: "Stop" });
  assert.equal(JSON.parse(await fs.readFile(lockFile, "utf8")).pid, lock.pid, "single worker per BURN_HOME");

  // 5. When the window opens the worker uploads once and disappears.
  assert.ok(await waitFor(async () => (await uploads()).length === 3), "worker uploaded when the window opened");
  assert.deepEqual(await uploads(), ["hook", "hook", "worker"]);
  assert.ok(await waitFor(() => exists(lockFile).then((present) => !present)), "worker removed its lock and exited");
  outbox = await readOutbox();
  assert.equal(outbox.days[dayKey].acked_revision, outbox.days[dayKey].revision);
});

test("update checks releases but merges usage without bypassing the server upload window", async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "burn-update-catchup-"));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const burnHome = path.join(home, ".burn");
  const sessions = path.join(home, ".codex", "sessions");
  await fs.mkdir(sessions, { recursive: true });
  await fs.mkdir(burnHome, { recursive: true });
  const initialNow = Date.now();
  const at = new Date(initialNow - 60_000).toISOString();
  await fs.writeFile(path.join(sessions, "rollout.jsonl"), [
    { timestamp: at, type: "session_meta", payload: { session_id: "update-session" } },
    { timestamp: at, type: "turn_context", payload: { model: "gpt-5" } },
    { timestamp: at, type: "event_msg", payload: { type: "token_count", info: { total_token_usage: { input_tokens: 100, cached_input_tokens: 20, output_tokens: 50, reasoning_output_tokens: 10 } } } },
  ].map((line) => JSON.stringify(line)).join("\n") + "\n");
  const countFile = path.join(home, "uploads.txt");
  const mockFetch = path.join(home, "mock-fetch.mjs");
  await fs.writeFile(mockFetch, `
  import fs from "node:fs/promises";
  const NativeDate = Date, clockNow = Number(process.env.BURN_TEST_NOW);
  globalThis.Date = class extends NativeDate { constructor(...args) { super(...(args.length ? args : [clockNow])); } static now() { return clockNow; } };
  globalThis.fetch = async (url, init) => {
    const pathname = new URL(url).pathname;
    if (pathname === "/v1/client/version") {
      return new Response(JSON.stringify({ latest_version: "9.9.9", minimum_supported_version: "0.6.1", update_url: "https://example.test/update" }));
    }
    if (pathname !== "/v1/ingest/batch") return new Response("{}");
    const { days } = JSON.parse(init.body);
    await fs.appendFile(process.env.BURN_TEST_COUNT_FILE, "x");
    return new Response(JSON.stringify({ accepted: days.length, acked_days: days, next_flush_after: 10800 }));
  };
  `);
  await fs.writeFile(path.join(burnHome, "config.json"), JSON.stringify({ server: { enabled: true, api_origin: "https://api.example.test" }, updates: {} }));
  await fs.writeFile(path.join(burnHome, "credentials.json"), JSON.stringify({ device_token: `tb_live_updatedevice.${"o".repeat(43)}` }));
  const env = { ...process.env, HOME: home, BURN_HOME: burnHome, NO_COLOR: "1", BURN_TEST_COUNT_FILE: countFile, BURN_TEST_NOW: String(initialNow), CODEX_PLUGIN_ROOT: path.resolve(".") };
  delete env.TOKENSBURNED_DISABLE_UPDATE_CHECK;
  const update = (at = initialNow) => execFileAsync(process.execPath, ["--import", mockFetch, cli, "update", "--force"], { env: { ...env, BURN_TEST_NOW: String(at) } });
  const { stdout } = await update();
  assert.match(stdout, /9\.9\.9 is available/);
  assert.match(stdout, /codex plugin add tokensburned@tokensburned/);
  assert.match(stdout, /Merged 1 recent usage record from codex/);
  assert.match(stdout, /Server is up to date/);
  assert.equal(await fs.readFile(countFile, "utf8"), "x", "the merged day was uploaded during update");
  const outbox = JSON.parse(await fs.readFile(path.join(burnHome, "server-outbox.json"), "utf8"));
  assert.ok(Object.values(outbox.days).every((day) => day.acked_revision === day.revision));
  await fs.appendFile(path.join(sessions, "rollout.jsonl"), JSON.stringify({ timestamp: at, type: "event_msg", payload: { type: "token_count", info: { total_token_usage: { input_tokens: 200, cached_input_tokens: 20, output_tokens: 80, reasoning_output_tokens: 10 } } } }) + "\n");
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await update();
    assert.match(result.stdout, /9\.9\.9 is available/, "release checks can still be forced");
    assert.match(result.stdout, /next upload window/);
    assert.equal(await fs.readFile(countFile, "utf8"), "x", "repeated updates cannot force a second upload");
  }
  const queued = JSON.parse(await fs.readFile(path.join(burnHome, "server-outbox.json"), "utf8"));
  assert.equal(Object.values(queued.days)[0].input_tokens, 180, "new usage merged while upload was blocked");
  assert.ok(Object.values(queued.days)[0].revision > Object.values(queued.days)[0].acked_revision);
  await update(initialNow + 10800_000);
  assert.equal(await fs.readFile(countFile, "utf8"), "xx", "the queued revision uploads at the server deadline");

});

test("connect polling survives network errors, 429 and 5xx, but stops on authorization_failed (B3)", async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "burn-connect-retry-"));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const apiOrigin = "https://api.example.test";
  const pollLog = path.join(home, "polls.json");
  const mockFetch = path.join(home, "mock-fetch.mjs");
  await fs.writeFile(mockFetch, `
  import fs from "node:fs/promises";
  const script = process.env.BURN_TEST_POLL_SCRIPT.split(",");
  let polls = 0;
  globalThis.fetch = async (url, init) => {
    const pathname = new URL(url).pathname;
    if (pathname === "/v1/auth/device/start") {
      return new Response(JSON.stringify({ device_code: "test-code", user_code: "ABCD-2345", verification_uri: "${apiOrigin}/verify", interval: 1, expires_in: 60 }));
    }
    if (pathname !== "/v1/auth/device/status") return new Response("{}");
    const step = script[Math.min(polls, script.length - 1)];
    polls += 1;
    await fs.writeFile(process.env.BURN_TEST_POLL_LOG, JSON.stringify(polls));
    if (step === "network") throw new TypeError("fetch failed");
    if (step === "429") return new Response(JSON.stringify({ error: { code: "rate_limited", message: "slow", retry_at: new Date(Date.now() + 500).toISOString() } }), { status: 429 });
    if (step === "500") return new Response("upstream", { status: 502 });
    if (step === "failed") return new Response(JSON.stringify({ error: { code: "authorization_failed", message: "GitHub authorization failed.", failure_code: "github_oauth_failed" } }), { status: 400 });
    return new Response(JSON.stringify({ status: "authorized", token: "tb_live_retrydevice." + "s".repeat(43), user: { github_login: "test-user" }, privacy: { public_card: false }, device_reused: false }));
  };
  `);
  const env = { ...process.env, BURN_HOME: home, NO_COLOR: "1", BURN_TEST_POLL_LOG: pollLog, TOKENSBURNED_DISABLE_UPDATE_CHECK: "1" };
  const connect = (script) => execFileAsync(process.execPath, ["--import", mockFetch, cli, "connect", "--api-origin", apiOrigin, "--no-open", "--no-backfill"], { env: { ...env, BURN_TEST_POLL_SCRIPT: script } });
  const started = Date.now();
  const ok = await connect("network,500,429,authorized");
  assert.match(ok.stdout, /Connected as test-user/);
  assert.equal(JSON.parse(await fs.readFile(pollLog, "utf8")), 4);
  assert.ok(Date.now() - started >= 4 * 2000, "each retry still waits at least the polling interval");
  assert.equal(JSON.parse(await fs.readFile(path.join(home, "credentials.json"), "utf8")).device_token.startsWith("tb_live_retrydevice."), true);

  await fs.rm(path.join(home, "credentials.json"), { force: true });
  await assert.rejects(connect("failed,authorized"), (error) =>
    /GitHub authorization failed \(github_oauth_failed\)/.test(error.stderr));
  assert.equal(JSON.parse(await fs.readFile(pollLog, "utf8")), 1, "a terminal 400 ends polling immediately");
  await assert.rejects(() => fs.access(path.join(home, "credentials.json")));
});

test("hooks install refuses to duplicate the plugin's SessionEnd hook (B9)", async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "burn-hooks-home-"));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const settings = path.join(home, ".claude", "settings.json");
  const baseEnv = { ...process.env, HOME: home, BURN_HOME: path.join(home, ".burn"), NO_COLOR: "1" };
  delete baseEnv.CLAUDE_PLUGIN_ROOT;
  const run = (env) => execFileAsync(process.execPath, [cli, "hooks", "install"], { env });

  await assert.rejects(run({ ...baseEnv, CLAUDE_PLUGIN_ROOT: "/plugins/tokensburned" }),
    (error) => /already provides the SessionEnd hook/.test(error.stderr));
  await assert.rejects(() => fs.access(settings), "no settings.json is written from inside the plugin");

  await fs.mkdir(path.join(home, ".claude", "plugins"), { recursive: true });
  await fs.writeFile(path.join(home, ".claude", "plugins", "installed_plugins.json"),
    JSON.stringify({ version: 2, plugins: { "tokensburned@tokensburned": [{ scope: "user" }] } }));
  await assert.rejects(run(baseEnv), (error) => /plugin is installed in Claude Code/.test(error.stderr));
  await assert.rejects(() => fs.access(settings));

  await fs.writeFile(path.join(home, ".claude", "plugins", "installed_plugins.json"),
    JSON.stringify({ version: 2, plugins: { "swift-lsp@claude-plugins-official": [{ scope: "user" }] } }));
  const installed = await run(baseEnv);
  assert.match(installed.stdout, /hook installed/);
  const installedHooks = JSON.parse(await fs.readFile(settings, "utf8")).hooks;
  for (const event of ["SessionStart", "Stop", "SessionEnd"]) {
    assert.equal(installedHooks[event].length, 1, `${event} installed once`);
    assert.match(installedHooks[event][0].hooks[0].command, /burn hook claude/);
  }
  const again = await run(baseEnv);
  assert.match(again.stdout, /already installed/);
});
