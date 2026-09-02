#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const wrangler = path.join(root, "node_modules", ".bin", "wrangler");
const config = path.join(root, "serverless", "wrangler.toml");

function parseArguments(values) {
  const options = {};
  for (const value of values) {
    if (value === "--execute-local") options.mode = "local";
    else if (value === "--execute-remote") options.mode = "remote";
    else if (value === "--print-sql") options.printSql = true;
    else if (value.startsWith("--") && value.includes("=")) {
      const [key, ...rest] = value.slice(2).split("=");
      options[key] = rest.join("=");
    } else {
      throw new Error(`Unknown argument: ${value}`);
    }
  }
  return options;
}

function parseMonth(value, name) {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(String(value || ""));
  if (!match) throw new Error(`${name} must use YYYY-MM.`);
  return { year: Number(match[1]), month: Number(match[2]) };
}

function parseDay(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) {
    throw new Error("--cutoff-day must use YYYY-MM-DD.");
  }
  const milliseconds = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString().slice(0, 10) !== value) {
    throw new Error("--cutoff-day is not a valid UTC date.");
  }
  return Math.floor(milliseconds / 86_400_000);
}

function monthIndex({ year, month }) {
  return year * 12 + month - 1;
}

function fromMonthIndex(index) {
  return { year: Math.floor(index / 12), month: index % 12 + 1 };
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function buildLegacyMonthlySql({ year, month, cutoffDay, updatedAt }) {
  const monthStart = Math.floor(Date.UTC(year, month - 1, 1) / 86_400_000);
  const monthEnd = Math.floor(Date.UTC(year, month, 1) / 86_400_000);
  const upperDay = Math.min(monthEnd, cutoffDay);
  if (upperDay <= monthStart) return null;
  const startBucket = monthStart * 96;
  const endBucket = upperDay * 96;
  const monthKey = year * 100 + month;
  const total = "(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens + reasoning_tokens)";

  return `WITH snapshot_rows AS (
  SELECT b.*,
         ROW_NUMBER() OVER (
           PARTITION BY b.device_id, b.bucket, b.session_id, b.harness, b.model
           ORDER BY b.revision DESC, b.updated_at DESC
         ) AS row_number
    FROM usage_buckets b
   WHERE b.bucket >= ${startBucket} AND b.bucket < ${endBucket}
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
         WHERE identified.device_id = selected.device_id
           AND identified.bucket = selected.bucket
           AND identified.session_id = selected.session_id
           AND identified.harness = selected.harness
           AND identified.model <> 'unknown'
      )
), all_usage AS (
  SELECT d.user_id, selected.device_id, selected.bucket,
         selected.harness, selected.provider, selected.model,
         selected.input_tokens, selected.output_tokens,
         selected.cache_read_tokens, selected.cache_write_tokens,
         selected.reasoning_tokens, selected.request_count
    FROM selected_snapshots selected
    JOIN devices d ON d.id = selected.device_id
  UNION ALL
  SELECT d.user_id, event.device_id, event.bucket,
         event.harness, event.provider, event.model,
         event.input_tokens, event.output_tokens,
         event.cache_read_tokens, event.cache_write_tokens,
         event.reasoning_tokens, event.request_count
    FROM usage_events event
    JOIN devices d ON d.id = event.device_id
   WHERE event.bucket >= ${startBucket} AND event.bucket < ${endBucket}
     AND NOT EXISTS (
       SELECT 1 FROM device_daily_usage daily
        WHERE daily.device_id = event.device_id
          AND daily.day = CAST(event.bucket / 96 AS INTEGER)
     )
     AND NOT EXISTS (
       SELECT 1 FROM selected_snapshots snapshot
        WHERE snapshot.device_id = event.device_id
          AND snapshot.bucket = event.bucket
          AND snapshot.harness = event.harness
     )
), totals AS (
  SELECT user_id, MAX(CAST(bucket / 96 AS INTEGER)) AS source_through_day,
         SUM(input_tokens) AS input_tokens,
         SUM(output_tokens) AS output_tokens,
         SUM(cache_read_tokens) AS cache_read_tokens,
         SUM(cache_write_tokens) AS cache_write_tokens,
         SUM(reasoning_tokens) AS reasoning_tokens,
         SUM(request_count) AS request_count
    FROM all_usage GROUP BY user_id
), dimension_totals AS (
  SELECT user_id, 'harness' AS kind, harness AS dimension_key, SUM(${total}) AS tokens
    FROM all_usage GROUP BY user_id, harness
  UNION ALL
  SELECT user_id, 'provider', provider, SUM(${total})
    FROM all_usage GROUP BY user_id, provider
  UNION ALL
  SELECT user_id, 'model', model, SUM(${total})
    FROM all_usage GROUP BY user_id, model
), dimension_ranked AS (
  SELECT *, ROW_NUMBER() OVER (
    PARTITION BY user_id, kind ORDER BY tokens DESC, dimension_key
  ) AS dimension_rank
  FROM dimension_totals
), dimension_bounded AS (
  SELECT user_id, kind,
         CASE WHEN dimension_rank <= 63 THEN dimension_key ELSE 'other' END AS dimension_key,
         SUM(tokens) AS tokens
    FROM dimension_ranked
   GROUP BY user_id, kind,
            CASE WHEN dimension_rank <= 63 THEN dimension_key ELSE 'other' END
), dimension_json AS (
  SELECT user_id, kind,
         json_group_object(dimension_key, json_object('total_tokens', tokens)) AS payload
    FROM dimension_bounded GROUP BY user_id, kind
), dimensions AS (
  SELECT user_id,
         MAX(CASE WHEN kind = 'harness' THEN payload END) AS harness_json,
         MAX(CASE WHEN kind = 'provider' THEN payload END) AS provider_json,
         MAX(CASE WHEN kind = 'model' THEN payload END) AS model_json
    FROM dimension_json GROUP BY user_id
)
INSERT INTO user_monthly_usage (
  user_id, month, source_through_day, input_tokens, output_tokens,
  cache_read_tokens, cache_write_tokens, reasoning_tokens, request_count,
  dimensions_json, updated_at
)
SELECT totals.user_id, ${monthKey}, totals.source_through_day,
       totals.input_tokens, totals.output_tokens, totals.cache_read_tokens,
       totals.cache_write_tokens, totals.reasoning_tokens, totals.request_count,
       json_object(
         'harness', json(COALESCE(dimensions.harness_json, '{}')),
         'provider', json(COALESCE(dimensions.provider_json, '{}')),
         'model', json(COALESCE(dimensions.model_json, '{}'))
       ),
       ${sqlString(updatedAt)}
  FROM totals LEFT JOIN dimensions ON dimensions.user_id = totals.user_id
 WHERE 1
ON CONFLICT (user_id, month) DO NOTHING;`;
}

function usage() {
  return `Usage:
  npm run worker:backfill:legacy -- --from=YYYY-MM --through=YYYY-MM --cutoff-day=YYYY-MM-DD [--print-sql]
  npm run worker:backfill:legacy -- --from=YYYY-MM --through=YYYY-MM --cutoff-day=YYYY-MM-DD --execute-local
  npm run worker:backfill:legacy -- --from=YYYY-MM --through=YYYY-MM --cutoff-day=YYYY-MM-DD --execute-remote --confirm-database=tokensburned

The cutoff is the first UTC day excluded from the monthly legacy rollup. Plan mode is the default.`;
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  if (!options.from || !options.through || !options["cutoff-day"]) {
    process.stdout.write(`${usage()}\n`);
    process.exitCode = 1;
    return;
  }
  const first = parseMonth(options.from, "--from");
  const last = parseMonth(options.through, "--through");
  const cutoffDay = parseDay(options["cutoff-day"]);
  if (monthIndex(last) < monthIndex(first)) throw new Error("--through must not precede --from.");
  if (options.mode === "remote" && options["confirm-database"] !== "tokensburned") {
    throw new Error("Remote execution requires --confirm-database=tokensburned.");
  }

  const updatedAt = new Date().toISOString();
  const jobs = [];
  for (let index = monthIndex(first); index <= monthIndex(last); index += 1) {
    const value = fromMonthIndex(index);
    const sql = buildLegacyMonthlySql({ ...value, cutoffDay, updatedAt });
    if (sql) jobs.push({ ...value, sql });
  }
  process.stdout.write(`Legacy monthly backfill plan: ${jobs.length} idempotent month statement(s).\n`);
  process.stdout.write(`Mode: ${options.mode || "plan only"}; cutoff: ${options["cutoff-day"]} UTC.\n`);
  if (options.printSql) {
    for (const job of jobs) process.stdout.write(`\n-- ${job.year}-${String(job.month).padStart(2, "0")}\n${job.sql}\n`);
  }
  if (!options.mode) return;

  for (const job of jobs) {
    const label = `${job.year}-${String(job.month).padStart(2, "0")}`;
    process.stdout.write(`\nExecuting ${label} (${options.mode})...\n`);
    const result = spawnSync(wrangler, [
      "d1", "execute", "tokensburned",
      options.mode === "remote" ? "--remote" : "--local",
      "--config", config,
      "--command", job.sql,
      "--yes",
    ], {
      cwd: root,
      env: {
        ...process.env,
        WRANGLER_LOG_PATH: "/private/tmp/tokensburned-wrangler-backfill.log",
      },
      stdio: "inherit",
    });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status || 1);
  }
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) main();
