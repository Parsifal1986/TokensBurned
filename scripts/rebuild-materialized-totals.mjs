#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const wrangler = path.join(root, "node_modules", ".bin", "wrangler");
const config = path.join(root, "serverless", "wrangler.toml");

function parseDay(value, name) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) {
    throw new Error(`${name} must use YYYY-MM-DD.`);
  }
  const milliseconds = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString().slice(0, 10) !== value) {
    throw new Error(`${name} is not a valid UTC date.`);
  }
  return Math.floor(milliseconds / 86_400_000);
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function buildTotalsSql({ legacyCutoffDay, throughDay, updatedAt }) {
  const cutoffBucket = legacyCutoffDay * 96;
  return `WITH snapshot_rows AS (
  SELECT d.user_id, b.device_id, b.bucket, b.session_id, b.harness, b.model,
         b.input_tokens, b.output_tokens, b.cache_read_tokens,
         b.cache_write_tokens, b.reasoning_tokens, b.request_count,
         ROW_NUMBER() OVER (
           PARTITION BY d.user_id, b.bucket, b.session_id, b.harness, b.model
           ORDER BY b.revision DESC, b.updated_at DESC
         ) AS row_number
    FROM usage_buckets b JOIN devices d ON d.id = b.device_id
   WHERE b.bucket >= ${cutoffBucket}
     AND NOT EXISTS (
       SELECT 1 FROM device_daily_usage daily
        WHERE daily.device_id = b.device_id
          AND daily.day = CAST(b.bucket / 96 AS INTEGER)
     )
), snapshots AS (
  SELECT * FROM snapshot_rows WHERE row_number = 1
), selected_snapshots AS (
  SELECT selected.* FROM snapshots selected
   WHERE selected.model <> 'unknown'
      OR NOT EXISTS (
        SELECT 1 FROM snapshots identified
         WHERE identified.user_id = selected.user_id
           AND identified.bucket = selected.bucket
           AND identified.session_id = selected.session_id
           AND identified.harness = selected.harness
           AND identified.model <> 'unknown'
      )
), all_usage AS (
  SELECT user_id, input_tokens, output_tokens, cache_read_tokens,
         cache_write_tokens, reasoning_tokens, request_count
    FROM selected_snapshots
  UNION ALL
  SELECT d.user_id, event.input_tokens, event.output_tokens,
         event.cache_read_tokens, event.cache_write_tokens,
         event.reasoning_tokens, event.request_count
    FROM usage_events event JOIN devices d ON d.id = event.device_id
   WHERE event.bucket >= ${cutoffBucket}
     AND NOT EXISTS (
       SELECT 1 FROM device_daily_usage daily
        WHERE daily.device_id = event.device_id
          AND daily.day = CAST(event.bucket / 96 AS INTEGER)
     )
     AND NOT EXISTS (
       SELECT 1 FROM selected_snapshots snapshot
        WHERE snapshot.user_id = d.user_id
          AND snapshot.bucket = event.bucket
          AND snapshot.harness = event.harness
     )
  UNION ALL
  SELECT d.user_id, daily.input_tokens, daily.output_tokens,
         daily.cache_read_tokens, daily.cache_write_tokens,
         daily.reasoning_tokens, daily.request_count
    FROM device_daily_usage daily JOIN devices d ON d.id = daily.device_id
  UNION ALL
  SELECT monthly.user_id, monthly.input_tokens, monthly.output_tokens,
         monthly.cache_read_tokens, monthly.cache_write_tokens,
         monthly.reasoning_tokens, monthly.request_count
    FROM user_monthly_usage monthly
), totals AS (
  SELECT user_id,
         SUM(input_tokens) AS input_tokens,
         SUM(output_tokens) AS output_tokens,
         SUM(cache_read_tokens) AS cache_read_tokens,
         SUM(cache_write_tokens) AS cache_write_tokens,
         SUM(reasoning_tokens) AS reasoning_tokens,
         SUM(request_count) AS request_count
    FROM all_usage GROUP BY user_id
)
INSERT INTO user_totals (
  user_id, through_day, input_tokens, output_tokens, cache_read_tokens,
  cache_write_tokens, reasoning_tokens, request_count, updated_at
)
SELECT user_id, ${throughDay}, input_tokens, output_tokens, cache_read_tokens,
       cache_write_tokens, reasoning_tokens, request_count, ${sqlString(updatedAt)}
  FROM totals WHERE 1
ON CONFLICT (user_id) DO UPDATE SET
  through_day = excluded.through_day,
  input_tokens = excluded.input_tokens,
  output_tokens = excluded.output_tokens,
  cache_read_tokens = excluded.cache_read_tokens,
  cache_write_tokens = excluded.cache_write_tokens,
  reasoning_tokens = excluded.reasoning_tokens,
  request_count = excluded.request_count,
  updated_at = excluded.updated_at;`;
}

function main() {
  const values = process.argv.slice(2);
  const options = Object.fromEntries(values
    .filter((value) => value.startsWith("--") && value.includes("="))
    .map((value) => {
      const [key, ...rest] = value.slice(2).split("=");
      return [key, rest.join("=")];
    }));
  const local = values.includes("--execute-local");
  const remote = values.includes("--execute-remote");
  const printSql = values.includes("--print-sql");
  const allowed = new Set([
    "--execute-local", "--execute-remote", "--print-sql",
    "--confirm-database=tokensburned",
  ]);
  for (const value of values) {
    if (!allowed.has(value) && !value.startsWith("--legacy-cutoff-day=")) {
      throw new Error(`Unknown argument: ${value}`);
    }
  }
  if (local && remote) throw new Error("Choose only one execution mode.");
  if (remote && options["confirm-database"] !== "tokensburned") {
    throw new Error("Remote execution requires --confirm-database=tokensburned.");
  }
  const legacyCutoffDay = parseDay(options["legacy-cutoff-day"], "--legacy-cutoff-day");
  const updatedAt = new Date().toISOString();
  const throughDay = Math.floor(Date.parse(updatedAt) / 86_400_000);
  const sql = buildTotalsSql({ legacyCutoffDay, throughDay, updatedAt });
  process.stdout.write(`Materialized totals rebuild mode: ${local ? "local" : remote ? "remote" : "plan only"}.\n`);
  process.stdout.write(`Legacy source begins at ${options["legacy-cutoff-day"]} UTC; monthly rows cover older data.\n`);
  if (printSql) process.stdout.write(`\n${sql}\n`);
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
      WRANGLER_LOG_PATH: "/private/tmp/tokensburned-wrangler-totals.log",
    },
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) main();
