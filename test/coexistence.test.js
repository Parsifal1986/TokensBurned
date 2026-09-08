import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readOutbox } from "../src/server-outbox.js";
const exec = promisify(execFile);

test("CLI and bundled Codex/Claude plugins concurrently replay one shared history without multiplying totals", async t => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "burn-coexist-"));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const now = Date.now(), timestamp = new Date(now - 1000).toISOString();
  const roots = { codex: path.join(home, "codex"), "claude-code": path.join(home, "claude") };
  for (const root of Object.values(roots)) await fs.mkdir(root);
  await fs.writeFile(path.join(roots.codex, "rollout.jsonl"), [
    { timestamp, type: "turn_context", payload: { model: "model-codex" } },
    { timestamp, type: "event_msg", payload: { type: "token_count", session_id: "codex-session", info: {
      total_token_usage: { input_tokens: 100, output_tokens: 20, cached_input_tokens: 30, reasoning_output_tokens: 5 } } } },
  ].map(JSON.stringify).join("\n") + "\n");
  await fs.writeFile(path.join(roots["claude-code"], "transcript.jsonl"), JSON.stringify({ timestamp, type: "assistant", sessionId: "claude-session",
    message: { id: "claude-request", model: "model-claude", usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 30, cache_creation_input_tokens: 10 } },
  }) + "\n");
  const outboxFile = path.join(home, "outbox.json");
  const run = async (runtime, harnesses) => {
    const historyModule = pathToFileURL(path.resolve(runtime, "src/history.js")).href;
    const outboxModule = pathToFileURL(path.resolve(runtime, "src/server-outbox.js")).href;
    const script = `import { collectHistoryEntries } from ${JSON.stringify(historyModule)};
      import { syncUsageEntries } from ${JSON.stringify(outboxModule)};
      const result = await collectHistoryEntries(${JSON.stringify({ harnesses, roots, now, days: 2 })});
      await syncUsageEntries(result.entries, ${JSON.stringify({ outboxFile, now, upload: false })});`;
    await exec(process.execPath, ["--input-type=module", "-e", script]);
  };
  await Promise.all([
    run(".", ["codex", "claude-code"]), run("plugins/tokensburned", ["codex"]),
    run("plugins/tokensburned", ["claude-code"]), run(".", ["codex", "claude-code"]),
  ]);
  const box = await readOutbox(outboxFile), day = Object.values(box.days)[0];
  assert.equal(Object.values(box.sources).length, 2);
  assert.equal(day.request_count, 2);
  assert.equal(day.input_tokens + day.output_tokens + day.cache_read_tokens + day.cache_write_tokens + day.reasoning_tokens, 280);
  await run("plugins/tokensburned", ["codex", "claude-code"]);
  assert.deepEqual((await readOutbox(outboxFile)).days, box.days, "replaying adds no revision or tokens");
});
