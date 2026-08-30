#!/usr/bin/env node

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const harness = process.env.CODEX_PLUGIN_ROOT ? "codex" : "claude";
const child = spawn(process.execPath, [path.join(root, "bin", "burn.js"), "hook", harness], {
  stdio: ["inherit", "ignore", "ignore"],
});
child.on("exit", (code) => process.exit(code || 0));
