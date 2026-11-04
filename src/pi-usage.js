import os from "node:os";
import path from "node:path";
import { usageObservation } from "./observations.js";
import { inUsageWindow, usageFiles, usageJsonLines } from "./usage-files.js";

const expand = (value, home) => value === "~" ? home : value.startsWith("~/") ? path.join(home, value.slice(2)) : path.resolve(value);

// Pi: PI_CODING_AGENT_SESSION_DIR, else $PI_CODING_AGENT_DIR/sessions (~/.pi/agent).
// Oh My Pi: ~/.omp/agent/sessions, named profiles and its Linux/macOS XDG data root.
export function piSessionRoots(env = process.env, home = os.homedir()) {
  const agent = env.PI_CODING_AGENT_DIR ? expand(env.PI_CODING_AGENT_DIR, home) : path.join(home, ".pi", "agent");
  const roots = [env.PI_CODING_AGENT_SESSION_DIR ? expand(env.PI_CODING_AGENT_SESSION_DIR, home) : path.join(agent, "sessions"),
    path.join(home, ".omp", "agent", "sessions"), path.join(home, ".omp", "profiles")];
  if (env.XDG_DATA_HOME) roots.push(path.join(env.XDG_DATA_HOME, "omp", "sessions"), path.join(env.XDG_DATA_HOME, "omp", "profiles"));
  return [...new Set(roots)];
}

const cleanProvider = value => typeof value === "string" && /^[a-z0-9][a-z0-9._:-]{0,63}$/.test(value.toLowerCase()) ? value.toLowerCase() : "unknown";
const cleanModel = value => typeof value === "string" && value.trim() && !/[\u0000-\u001f]/.test(value) ? value.trim().slice(0, 160) : "unknown";

// Usage contract (pi-ai Usage, Oh My Pi catalog Usage): input excludes cache
// read/write; reasoning (Pi) / reasoningTokens (Oh My Pi) is a subset of output.
// Oh My Pi orchestration tokens are billed buckets outside the conversation ones.
function piCounters(usage) {
  const o = usage?.orchestration ?? {};
  const reasoning = usage?.reasoning ?? usage?.reasoningTokens ?? 0;
  const values = [usage?.input, usage?.output, usage?.cacheRead, usage?.cacheWrite, reasoning, o.input ?? 0, o.output ?? 0, o.cacheRead ?? 0];
  if (!values.every(v => Number.isSafeInteger(v) && v >= 0) || reasoning > usage.output) return null;
  const [input, output, cacheRead, cacheWrite, , orchestrationInput, orchestrationOutput, orchestrationCacheRead] = values;
  return { input_tokens: input + orchestrationInput, output_tokens: output - reasoning + orchestrationOutput,
    cache_read_tokens: cacheRead + orchestrationCacheRead, cache_write_tokens: cacheWrite, reasoning_tokens: reasoning };
}

// Same sources Pi's own session usage breakdown counts. Only typed usage,
// provider/model and entry identity are read; never content, details or paths.
export function piObservation(entry, { now = Date.now(), days = 2 } = {}) {
  const message = entry?.message;
  let usage, provider, model, strict = true;
  if (entry?.type === "message" && message?.role === "assistant") {
    if (message.stopReason === "pending" || message.stopReason === "deferred") return null;
    ({ usage, provider } = message);
    model = message.responseModel ?? message.model;
  } else if (entry?.type === "usage" || entry?.type === "model_usage") {
    if (entry.stopReason === "pending" || entry.stopReason === "deferred") return null;
    ({ usage, provider, model } = entry);
  } else if (entry?.type === "message" && message?.role === "toolResult" || entry?.type === "compaction" || entry?.type === "branch_summary") {
    // Tool and summary usage may be supplied by extensions and has no model.
    usage = entry.type === "message" ? message.usage : entry.usage;
    strict = false;
  } else return null;
  const time = Date.parse(entry.timestamp);
  if (usage == null || !inUsageWindow(time, now, days)) return null;
  const counters = piCounters(usage);
  if (!counters) {
    if (strict) throw new Error("Unsupported Pi usage counters");
    return null;
  }
  if (Object.values(counters).every(v => v === 0)) return null;
  // Legacy v1 entries have no id until Pi rewrites the file; skip rather than guess.
  if (typeof entry.id !== "string" || !entry.id) return null;
  // Forks and branch exports copy entries verbatim into a new session file, so
  // the entry id and its write time identify the request, not the session.
  return usageObservation({ id: JSON.stringify(["pi-entry", entry.id, entry.timestamp]), timestamp: new Date(time).toISOString(),
    harness: { id: "pi" }, backend: { provider: cleanProvider(provider), model: cleanModel(model) },
    usage_semantics: "exclusive-delta", usage: counters,
  }, { now });
}

export async function readPiUsage({ root = piSessionRoots(), now = Date.now(), days = 2 } = {}) {
  const files = new Set();
  for (const directory of [root].flat()) {
    // Oh My Pi profile roots also hold config; only their sessions trees count.
    const profiles = path.basename(directory) === "profiles";
    const accept = file => file.endsWith(".jsonl") && (!profiles || path.relative(directory, file).split(path.sep).includes("sessions"));
    for (const file of await usageFiles(directory, accept, now - days * 86_400_000)) files.add(file);
  }
  const observations = new Map();
  for (const file of [...files].sort()) {
    let header;
    for await (const record of usageJsonLines(file)) {
      // Only Pi session transcripts (header first); other JSONL is ignored.
      if (header === undefined) header = record?.type === "session";
      if (!header) continue;
      const entry = piObservation(record, { now, days });
      if (entry) observations.set(entry.observation_id, entry);
    }
  }
  return [...observations.values()];
}
