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

test("CLI ingests, reports and renders without network", async () => {
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
  await execFileAsync(process.execPath, [cli, "render"], { env });
  const svg = await fs.readFile(path.join(home, "stats.svg"), "utf8");
  assert.match(svg, /<svg/);
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
  assert.match(all.stdout, /from 2 claude-code, codex history files/);

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
