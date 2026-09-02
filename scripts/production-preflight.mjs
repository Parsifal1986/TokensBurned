#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const wrangler = path.join(root, "node_modules", ".bin", "wrangler");
const config = path.join(root, "serverless", "wrangler.toml");
const remote = process.argv.slice(2).includes("--remote");
const environment = {
  ...process.env,
  WRANGLER_LOG_PATH: "/private/tmp/tokensburned-wrangler-preflight.log",
};

function run(label, command, args) {
  process.stdout.write(`\n== ${label} ==\n`);
  const result = spawnSync(command, args, {
    cwd: root,
    env: environment,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.stderr.write(`\nPreflight stopped at: ${label}\n`);
    process.exit(result.status || 1);
  }
}

const nodeMajor = Number(process.versions.node.split(".")[0]);
if (!Number.isInteger(nodeMajor) || nodeMajor < 20) {
  throw new Error(`Node.js 20 or newer is required; found ${process.versions.node}.`);
}

run("tests and syntax", "npm", ["run", "check"]);
run("package contents", "npm", [
  "pack", "--dry-run", "--cache", path.join(os.tmpdir(), "tokensburned-npm-cache"),
]);
run("local D1 migrations", "npm", ["run", "worker:migrate:local"]);
run("Worker bundle dry-run", wrangler, ["deploy", "--dry-run", "--config", config]);

if (remote) {
  run("remote D1 identity", wrangler, ["d1", "info", "tokensburned", "--config", config]);
  run("D1 Time Travel bookmark", wrangler, [
    "d1", "time-travel", "info", "tokensburned", "--config", config,
  ]);
  run("Worker versions", wrangler, ["versions", "list", "--config", config]);
  run("remote migration status", wrangler, [
    "d1", "migrations", "list", "tokensburned", "--remote", "--config", config,
  ]);
}

process.stdout.write(`\nPreflight passed (${remote ? "local + remote read-only" : "local only"}).\n`);
