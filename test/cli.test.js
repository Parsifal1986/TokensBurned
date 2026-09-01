import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const cli = path.resolve("bin/burn.js");

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
