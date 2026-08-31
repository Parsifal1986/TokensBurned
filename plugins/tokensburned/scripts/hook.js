#!/usr/bin/env node

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sanitizeHookPayload } from "../src/schema.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const harness = process.env.CODEX_PLUGIN_ROOT
  ? "codex"
  : process.env.COPILOT_PLUGIN_ROOT
    ? "copilot"
    : process.env.GEMINI_SESSION_ID || process.env.TOKENSBURNED_EXTENSION_PATH
      ? "gemini-cli"
      : "claude";
const chunks = [];
let size = 0;
for await (const chunk of process.stdin) {
  size += chunk.length;
  if (size > 256 * 1024) process.exit(0);
  chunks.push(chunk);
}
let payload;
try {
  payload = sanitizeHookPayload(JSON.parse(Buffer.concat(chunks).toString("utf8")));
} catch {
  process.exit(0);
}
if (!payload) process.exit(0);
const allowedEnvironment = [
  "HOME", "USER", "LOGNAME", "PATH", "SHELL", "TMPDIR", "TEMP", "TMP",
  "SYSTEMROOT", "WINDIR", "PATHEXT", "COMSPEC",
  "XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_CACHE_HOME", "BURN_HOME", "NO_COLOR",
  "CODEX_PLUGIN_ROOT", "COPILOT_PLUGIN_ROOT", "CLAUDE_PLUGIN_ROOT",
  "TOKENSBURNED_EXTENSION_PATH", "TOKENSBURNED_API_ORIGIN", "TOKENSBURNED_HARNESS",
  "ANTHROPIC_BASE_URL", "ANTHROPIC_MODEL", "ANTHROPIC_DEFAULT_OPUS_MODEL",
  "ANTHROPIC_DEFAULT_SONNET_MODEL", "OPENAI_BASE_URL", "OPENAI_MODEL", "GH_HOST",
];
const env = Object.fromEntries(allowedEnvironment
  .filter((key) => process.env[key] !== undefined)
  .map((key) => [key, process.env[key]]));
const child = spawn(process.execPath, [path.join(root, "bin", "burn.js"), "hook", harness], {
  detached: true,
  stdio: ["pipe", "ignore", "ignore"],
  env,
});
child.stdin.end(JSON.stringify(payload));
child.unref();
