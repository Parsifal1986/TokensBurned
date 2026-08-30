#!/usr/bin/env node

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const harness = process.env.CODEX_PLUGIN_ROOT ? "codex" : "claude";
const chunks = [];
let size = 0;
for await (const chunk of process.stdin) {
  size += chunk.length;
  if (size > 256 * 1024) process.exit(0);
  chunks.push(chunk);
}
const payload = Buffer.concat(chunks).toString("base64");
const child = spawn(process.execPath, [path.join(root, "bin", "burn.js"), "hook", harness], {
  detached: true,
  stdio: "ignore",
  env: { ...process.env, TOKENSBURNED_HOOK_PAYLOAD: payload },
});
child.unref();
