#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const wrangler = path.join(root, "node_modules", ".bin", "wrangler");
const config = path.join(root, "serverless", "wrangler.toml");

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function buildRankingSql(updatedAt) {
  return `WITH totals AS (
  SELECT user_id,
         input_tokens + output_tokens + cache_read_tokens
           + cache_write_tokens + reasoning_tokens AS total_tokens
    FROM user_totals
), ranked AS (
  SELECT user_id,
         RANK() OVER (ORDER BY total_tokens DESC) AS rank,
         COUNT(*) OVER () AS participants
    FROM totals
)
INSERT INTO user_rankings (user_id, rank, participants, updated_at)
SELECT user_id, rank, participants, ${sqlString(updatedAt)} FROM ranked
 WHERE 1
ON CONFLICT (user_id) DO UPDATE SET
  rank = excluded.rank,
  participants = excluded.participants,
  updated_at = excluded.updated_at;`;
}

function main() {
  const arguments_ = new Set(process.argv.slice(2));
  const local = arguments_.has("--execute-local");
  const remote = arguments_.has("--execute-remote");
  const confirmed = arguments_.has("--confirm-database=tokensburned");
  if (local && remote) throw new Error("Choose only one execution mode.");
  if (remote && !confirmed) {
    throw new Error("Remote execution requires --confirm-database=tokensburned.");
  }
  for (const value of arguments_) {
    if (!["--execute-local", "--execute-remote", "--confirm-database=tokensburned", "--print-sql"].includes(value)) {
      throw new Error(`Unknown argument: ${value}`);
    }
  }
  const sql = buildRankingSql(new Date().toISOString());
  process.stdout.write(`Ranking materialization mode: ${local ? "local" : remote ? "remote" : "plan only"}.\n`);
  process.stdout.write("This performs one global user_totals ranking pass; it never runs on a card request.\n");
  if (arguments_.has("--print-sql")) process.stdout.write(`\n${sql}\n`);
  if (!local && !remote) return;

  const result = spawnSync(wrangler, [
    "d1", "execute", "tokensburned",
    remote ? "--remote" : "--local",
    "--config", config,
    "--command", sql,
    "--yes",
  ], {
    cwd: root,
    env: {
      ...process.env,
      WRANGLER_LOG_PATH: "/private/tmp/tokensburned-wrangler-rankings.log",
    },
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) main();
