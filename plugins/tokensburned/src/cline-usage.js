import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { usageObservation } from "./observations.js";
import { inUsageWindow, usageFiles, readUsageJson } from "./usage-files.js";

export function clineHistoryRoot(env = process.env, home = os.homedir()) {
  return env.CLINE_SESSION_DATA_DIR || path.join(env.CLINE_DATA_DIR || path.join(env.CLINE_DIR || path.join(home, ".cline"), "data"), "sessions");
}

export function clineIdeRoots(env = process.env, home = os.homedir(), platform = process.platform) {
  if (env.CLINE_IDE_STORAGE) return [path.join(env.CLINE_IDE_STORAGE, "tasks")];
  const base = platform === "darwin" ? path.join(home, "Library", "Application Support")
    : platform === "win32" ? env.APPDATA || path.join(home, "AppData", "Roaming") : env.XDG_CONFIG_HOME || path.join(home, ".config");
  return ["Code", "Code - Insiders", "VSCodium", "Cursor", "Windsurf"].map(app =>
    path.join(base, app, "User", "globalStorage", "saoudrizwan.claude-dev", "tasks"));
}

// Classic IDE counters are already exclusive on input. Its output does not
// expose a separate reasoning counter; preserve it as reported, never estimate.
export function clineIdeObservation(message, taskId, { now = Date.now(), days = 2 } = {}) {
  if (message?.type !== "say" || message.say !== "api_req_started" || message.partial
    || !inUsageWindow(message.ts, now, days)) return null;
  let data;
  try { data = JSON.parse(message.text); } catch { return null; }
  if (data.tokensIn == null || data.tokensOut == null || data.cost == null) return null;
  const values = [data.tokensIn, data.tokensOut, data.cacheReads ?? 0, data.cacheWrites ?? 0];
  if (!values.every(v => Number.isSafeInteger(v) && v >= 0)) throw new Error("Unsupported Cline IDE counters");
  if (values.every(v => v === 0)) return null;
  return usageObservation({ id: JSON.stringify(["cline-ide", taskId, message.ts]), timestamp: new Date(message.ts).toISOString(),
    harness: { id: "cline" }, backend: { provider: message.modelInfo?.providerId || "unknown", model: message.modelInfo?.modelId || "unknown" },
    usage_semantics: "exclusive-delta", usage: { input_tokens: values[0], output_tokens: values[1],
      cache_read_tokens: values[2], cache_write_tokens: values[3] },
  }, { now });
}

// The SDK hook and persisted message use exactly the same identity and fields.
// Gateway input includes cache; output includes reasoning. No content traversal.
export function clineObservation(message, { now = Date.now(), days = 90 } = {}) {
  const usage = message?.metrics;
  const createdAt = message?.createdAt ?? message?.ts;
  if (message?.role !== "assistant" || !usage || !inUsageWindow(createdAt, now, days)) return null;
  const values = [usage.inputTokens, usage.outputTokens, usage.cacheReadTokens ?? 0,
    usage.cacheWriteTokens ?? 0, usage.reasoningTokenCount ?? 0];
  if (!values.every(v => Number.isSafeInteger(v) && v >= 0)) throw new Error("Unsupported Cline usage counters");
  const [input, output, read, write, reasoning] = values;
  if (read + write > input || reasoning > output) throw new Error("Unsupported Cline usage subsets");
  if (input + output === 0) return null;
  const raw = { id: message.id, timestamp: new Date(createdAt).toISOString(),
    harness: { id: "cline" }, backend: { provider: message.modelInfo?.provider || "unknown", model: message.modelInfo?.id || "unknown" },
    usage_semantics: "exclusive-delta", usage: { input_tokens: input - read - write, output_tokens: output - reasoning,
      cache_read_tokens: read, cache_write_tokens: write, reasoning_tokens: reasoning },
  };
  // agent-message-codec persists createdAt as ts and drops reasoning detail.
  // Both are the same request. Keep a hash with combined output so the outbox
  // can retain the richer live breakdown without accepting changed totals.
  const scope = usageObservation({ ...raw, usage: { ...raw.usage, output_tokens: output, reasoning_tokens: 0 } }, { now });
  return { ...usageObservation(raw, { now }), cline_usage_scope: scope.observation_hash,
    cline_usage_detail: usage.reasoningTokenCount == null ? "output-total" : "reported" };
}

export async function readClineUsage({ root = clineHistoryRoot(), ideRoots = clineIdeRoots(), now = Date.now(), days = 2 } = {}) {
  const entries = new Map();
  const sdkSessions = new Set();
  const add = entry => {
    if (!entry) return;
    const previous = entries.get(entry.observation_id);
    if (previous && previous.observation_hash !== entry.observation_hash) throw new Error("Conflicting Cline message usage");
    entries.set(entry.observation_id, entry);
  };
  for (const file of await usageFiles(root, file => file.endsWith(".messages.json"), now - days * 86_400_000)) {
    const data = await readUsageJson(file);
    if (!data) continue;
    if (data.version !== 1 || !Array.isArray(data.messages)) throw new Error("Unsupported Cline messages schema");
    sdkSessions.add(data.sessionId);
    for (const message of data.messages) {
      add(clineObservation(message, { now, days }));
    }
  }
  for (const ideRoot of ideRoots) {
    for (const file of await usageFiles(ideRoot, file => path.basename(file) === "ui_messages.json", now - days * 86_400_000)) {
      const taskId = path.basename(path.dirname(file));
      if (sdkSessions.has(taskId)) continue;
      // Only classic persisted tasks. SDK-backed UI projections aren't another
      // request source. Never read the companion conversation's contents.
      try { await fs.access(path.join(path.dirname(file), "api_conversation_history.json")); }
      catch (error) { if (error.code === "ENOENT") continue; throw error; }
      const messages = await readUsageJson(file);
      if (!messages) continue;
      if (!Array.isArray(messages)) throw new Error("Unsupported Cline IDE messages schema");
      for (const message of messages) add(clineIdeObservation(message, taskId, { now, days }));
    }
  }
  return [...entries.values()];
}
