import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { usageObservation } from "./observations.js";

const exec = promisify(execFile);
export function openCodeDatabase(env = process.env, home = os.homedir()) {
  const data = path.join(env.XDG_DATA_HOME || path.join(home, ".local", "share"), "opencode");
  return env.OPENCODE_DB ? path.resolve(data, env.OPENCODE_DB) : path.join(data, "opencode.db");
}

// Contract: OpenCode v1 message table, finalized assistant messages. Stored
// input/output already exclude cache/reasoning (Session.getUsage). Never SELECT
// data wholesale or join parts, project paths, titles, prompts or tool payloads.
export async function readOpenCodeUsage({ file = openCodeDatabase(), now = Date.now(), days = 2, execImpl = exec } = {}) {
  try { await fs.access(file); } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const query = async sql => {
    const { stdout } = await execImpl("sqlite3", ["-readonly", "-json", file, sql], { timeout: 10_000, maxBuffer: 2 * 1024 * 1024 });
    return JSON.parse(stdout || "[]");
  };
  const tables = await query("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('message','session_message');");
  if (!tables.some(row => row.name === "message")) throw new Error("Unsupported OpenCode usage schema");
  if (tables.some(row => row.name === "session_message") && (await query("SELECT 1 AS present FROM session_message LIMIT 1;")).length) {
    throw new Error("OpenCode v2 session_message collection is not supported");
  }
  const minimum = Math.max(0, Math.floor(now - Math.min(90, Math.max(1, days)) * 86_400_000));
  const entries = [];
  let after = "";
  for (;;) {
    const rows = await query(`SELECT id,
      json_extract(data, '$.time.completed') AS completed,
      json_extract(data, '$.providerID') AS provider,
      json_extract(data, '$.modelID') AS model,
      json_extract(data, '$.tokens.input') AS input_tokens,
      json_extract(data, '$.tokens.output') AS output_tokens,
      json_extract(data, '$.tokens.reasoning') AS reasoning_tokens,
      json_extract(data, '$.tokens.cache.read') AS cache_read_tokens,
      json_extract(data, '$.tokens.cache.write') AS cache_write_tokens
      FROM message WHERE id > '${after.replaceAll("'", "''")}' AND time_updated >= ${minimum}
      AND json_valid(data) AND json_extract(data, '$.role') = 'assistant'
      AND json_extract(data, '$.time.completed') BETWEEN ${minimum} AND ${Math.floor(now)}
      ORDER BY id LIMIT 500;`);
    for (const row of rows) {
      const usage = Object.fromEntries(["input_tokens", "output_tokens", "reasoning_tokens", "cache_read_tokens", "cache_write_tokens"].map(key => [key, row[key]]));
      if (!Object.values(usage).every(value => Number.isSafeInteger(value) && value >= 0)) throw new Error("Unsupported OpenCode usage counters");
      if (Object.values(usage).every(value => value === 0)) continue;
      entries.push(usageObservation({ id: `opencode-message:${row.id}`, timestamp: new Date(row.completed).toISOString(), harness: { id: "opencode" },
        backend: { provider: row.provider || "unknown", model: row.model || "unknown" }, usage_semantics: "exclusive-delta", usage,
      }, { now }));
    }
    if (rows.length < 500) break;
    after = rows.at(-1).id;
  }
  return entries;
}
