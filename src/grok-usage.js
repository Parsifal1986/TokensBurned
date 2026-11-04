import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { usageObservation } from "./observations.js";
import { inUsageWindow, usageFiles, readUsageJson } from "./usage-files.js";

// Grok can still fold late usage into a session's newest turn row while that
// process runs; wait until usage.json has been unchanged this long.
export const GROK_SETTLE_MS = 30 * 60_000;
const COUNTERS = ["inputTokens", "outputTokens", "cachedReadTokens", "cacheCreationTokens", "reasoningTokens", "modelCalls"];

export function grokSessionsRoot(env = process.env, home = os.homedir()) {
  return path.join(env.GROK_HOME || path.join(home, ".grok"), "sessions");
}

// Contract: sessions/<cwd>/<session>/usage.json turns[].modelUsage, written once
// per prompt turn (not per request). inputTokens is the full prompt including
// cache reads and writes; reasoningTokens is a subset of outputTokens. Forks copy
// parent rows verbatim, so identity is the row's endedAt, not the session id.
export function grokObservations(turn, { now = Date.now(), days = 2 } = {}) {
  if (!turn || typeof turn !== "object" || !inUsageWindow(Date.parse(turn.endedAt), now, days)) return [];
  if (turn.usageIsIncomplete === true) return []; // Grok reports this turn may under-count.
  if (!Number.isSafeInteger(turn.turnNumber) || typeof turn.endedAt !== "string") throw new Error("Missing Grok usage identity");
  const models = turn.modelUsage && typeof turn.modelUsage === "object" ? Object.entries(turn.modelUsage) : [];
  if (!models.length && (turn.inputTokens || turn.outputTokens)) throw new Error("Unsupported Grok usage record");
  const entries = [];
  for (const [model, row] of models) {
    const values = COUNTERS.map(key => row?.[key]);
    if (!values.every(v => Number.isSafeInteger(v) && v >= 0)) throw new Error("Unsupported Grok usage counters");
    const [input, output, cacheRead, cacheWrite, reasoning, calls] = values;
    if (cacheRead + cacheWrite > input || reasoning > output) throw new Error("Unsupported Grok usage counters");
    if (row.usageIsIncomplete === true || input + output === 0) continue;
    entries.push(usageObservation({ id: JSON.stringify(["grok-turn", turn.endedAt, turn.turnNumber, model]),
      timestamp: new Date(Date.parse(turn.endedAt)).toISOString(), harness: { id: "grok-build" },
      backend: { provider: /^grok/i.test(model) ? "xai" : "unknown", model: model || "unknown" },
      usage_semantics: "exclusive-delta", request_count: calls,
      usage: { input_tokens: input - cacheRead - cacheWrite, output_tokens: output - reasoning,
        cache_read_tokens: cacheRead, cache_write_tokens: cacheWrite, reasoning_tokens: reasoning },
    }, { now }));
  }
  return entries;
}

export async function readGrokUsage({ root = grokSessionsRoot(), now = Date.now(), days = 2 } = {}) {
  const files = await usageFiles(root, file => path.basename(file) === "usage.json"
    && path.relative(root, file).split(path.sep).length === 3, now - days * 86_400_000);
  const observations = new Map();
  for (const file of files) {
    // Subagent spend is already folded into the parent session's turns.
    const summary = await readUsageJson(path.join(path.dirname(file), "summary.json"));
    if (!summary || typeof summary !== "object" || String(summary.session_kind || "").startsWith("subagent")) continue;
    const usage = await readUsageJson(file);
    const turns = Array.isArray(usage?.turns) ? usage.turns : [];
    let modified;
    try { modified = (await fs.stat(file)).mtimeMs; } catch (error) { if (error.code === "ENOENT") continue; throw error; }
    turns.forEach((turn, index) => {
      if (index === turns.length - 1 && now - modified < GROK_SETTLE_MS) return;
      for (const entry of grokObservations(turn, { now, days })) observations.set(entry.observation_id, entry);
    });
  }
  return [...observations.values()];
}
