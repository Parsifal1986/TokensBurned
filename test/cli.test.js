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
