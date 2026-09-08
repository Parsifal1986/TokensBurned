import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { usageObservation } from "./observations.js";
import { inUsageWindow, usageFiles, readUsageJson } from "./usage-files.js";

const exec = promisify(execFile);
export function openCodeDatabase(env = process.env, home = os.homedir()) {
  const data = path.join(env.XDG_DATA_HOME || path.join(home, ".local", "share"), "opencode");
  return env.OPENCODE_DB ? path.resolve(data, env.OPENCODE_DB) : path.join(data, "opencode.db");
}

// Contract: OpenCode v1 message / v2 session_message, finalized assistants. Stored
// input/output already exclude cache/reasoning (Session.getUsage). Never SELECT
// data wholesale or join parts, project paths, titles, prompts or tool payloads.
export async function readOpenCodeUsage({ file = openCodeDatabase(), legacyRoot = path.join(path.dirname(file), "storage", "message"), now = Date.now(), days = 2, execImpl = exec } = {}) {
  let exists = true;
  try { await fs.access(file); } catch (error) {
    if (error.code === "ENOENT") exists = false;
    else throw error;
  }
  const query = async sql => {
    const { stdout } = await execImpl("sqlite3", ["-readonly", "-json", file, sql], { timeout: 10_000, maxBuffer: 2 * 1024 * 1024 });
    return JSON.parse(stdout || "[]");
  };
  const tables = exists ? await query("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('message','session_message');") : [];
  if (exists && !tables.length) throw new Error("Unsupported OpenCode usage schema");
  for (const { name } of tables) {
    const columns = await query(`PRAGMA table_info(${name});`);
    const required = ["id", "time_updated", "data", ...(name === "session_message" ? ["type"] : [])];
    if (required.some(key => !columns.some(column => column.name === key))) throw new Error("Unsupported OpenCode usage schema");
  }
  const minimum = Math.max(0, Math.floor(now - Math.min(90, Math.max(1, days)) * 86_400_000));
  const entries = [];
  // A migrated message with the same ID is the same request, not new usage.
  const seen = new Set();
  for (const table of ["session_message", "message"].filter(name => tables.some(row => row.name === name))) {
  const v2 = table === "session_message";
  let after = "";
  for (;;) {
    const rows = await query(`SELECT id,
      json_extract(data, '$.time.completed') AS completed,
      json_extract(data, '$.${v2 ? "model.providerID" : "providerID"}') AS provider,
      json_extract(data, '$.${v2 ? "model.id" : "modelID"}') AS model,
      json_extract(data, '$.tokens.input') AS input_tokens,
      json_extract(data, '$.tokens.output') AS output_tokens,
      json_extract(data, '$.tokens.reasoning') AS reasoning_tokens,
      json_extract(data, '$.tokens.cache.read') AS cache_read_tokens,
      json_extract(data, '$.tokens.cache.write') AS cache_write_tokens
      FROM ${table} WHERE id > '${after.replaceAll("'", "''")}' AND time_updated >= ${minimum}
      AND json_valid(data) AND ${v2 ? "type" : "json_extract(data, '$.role')"} = 'assistant'
      AND json_extract(data, '$.time.completed') BETWEEN ${minimum} AND ${Math.floor(now)}
      ORDER BY id LIMIT 500;`);
    for (const row of rows) {
      if (seen.has(row.id)) continue;
      const usage = Object.fromEntries(["input_tokens", "output_tokens", "reasoning_tokens", "cache_read_tokens", "cache_write_tokens"].map(key => [key, row[key]]));
      if (!Object.values(usage).every(value => Number.isSafeInteger(value) && value >= 0)) throw new Error("Unsupported OpenCode usage counters");
      if (Object.values(usage).every(value => value === 0)) continue;
      seen.add(row.id);
      entries.push(usageObservation({ id: `opencode-message:${row.id}`, timestamp: new Date(row.completed).toISOString(), harness: { id: "opencode" },
        backend: { provider: row.provider || "unknown", model: row.model || "unknown" }, usage_semantics: "exclusive-delta", usage,
      }, { now }));
    }
    if (rows.length < 500) break;
    after = rows.at(-1).id;
  }
  }
  for (const legacyFile of await usageFiles(legacyRoot, file => file.endsWith(".json"), minimum)) {
    const message = await readUsageJson(legacyFile);
    if (message?.role !== "assistant" || !inUsageWindow(message.time?.completed, now, days) || seen.has(message.id)) continue;
    const t = message.tokens;
    const usage = { input_tokens: t?.input, output_tokens: t?.output, reasoning_tokens: t?.reasoning,
      cache_read_tokens: t?.cache?.read, cache_write_tokens: t?.cache?.write };
    if (!Object.values(usage).every(v => Number.isSafeInteger(v) && v >= 0)) throw new Error("Unsupported OpenCode usage counters");
    if (Object.values(usage).every(v => v === 0)) continue;
    if (typeof message.id !== "string" || !message.id) throw new Error("Missing OpenCode message identity");
    entries.push(usageObservation({ id: `opencode-message:${message.id}`, timestamp: new Date(message.time.completed).toISOString(),
      harness: { id: "opencode" }, backend: { provider: message.providerID || "unknown", model: message.modelID || "unknown" },
      usage_semantics: "exclusive-delta", usage }, { now }));
    seen.add(message.id);
  }
  return entries;
}
