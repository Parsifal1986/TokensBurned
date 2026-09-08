import os from "node:os";
import path from "node:path";
import { usageObservation } from "./observations.js";
import { inUsageWindow, usageFiles, readUsageJson, usageJsonLines } from "./usage-files.js";

export function geminiHistoryRoot(env = process.env, home = os.homedir()) {
  return path.join(env.GEMINI_CLI_HOME || home, ".gemini", "tmp");
}

// ChatRecordingService / TokensSummary: prompt includes cache; candidates and
// thoughts are separate. toolUsePromptTokenCount is an additional input category.
export function geminiObservation(message, sessionId, { now = Date.now(), days = 2 } = {}) {
  if (message?.type !== "gemini" || !message.tokens || !inUsageWindow(Date.parse(message.timestamp), now, days)) return null;
  const t = message.tokens;
  const values = [t.input, t.output, t.cached ?? 0, t.thoughts ?? 0, t.tool ?? 0];
  if (!values.every(v => Number.isSafeInteger(v) && v >= 0) || values[2] > values[0]) throw new Error("Unsupported Gemini usage counters");
  const [input, output, cached, thoughts, tool] = values;
  if (input + output + thoughts + tool === 0) return null;
  if (typeof sessionId !== "string" || !sessionId || typeof message.id !== "string" || !message.id) throw new Error("Missing Gemini usage identity");
  return usageObservation({ id: JSON.stringify([sessionId, message.id]), timestamp: message.timestamp,
    harness: { id: "gemini-cli" }, backend: { provider: "google", model: message.model || "unknown" },
    usage_semantics: "exclusive-delta", usage: { input_tokens: input - cached + tool, output_tokens: output,
      cache_read_tokens: cached, reasoning_tokens: thoughts },
  }, { now });
}

export async function readGeminiUsage({ root = geminiHistoryRoot(), now = Date.now(), days = 2 } = {}) {
  const files = await usageFiles(root, file => file.split(path.sep).includes("chats") && /\.jsonl?$/.test(file), now - days * 86_400_000);
  const observations = new Map();
  for (const file of files) {
    let sessionId;
    const add = message => {
      const entry = geminiObservation(message, sessionId, { now, days });
      if (entry) observations.set(entry.observation_id, entry);
    };
    if (file.endsWith(".jsonl")) {
      for await (const record of usageJsonLines(file)) {
        if (typeof record?.sessionId === "string") sessionId = record.sessionId;
        // Rewinds change conversation context, not already-consumed tokens.
        // Repeated JSONL updates replace the same message; never count chunks.
        add(record);
      }
    } else {
      const conversation = await readUsageJson(file);
      sessionId = conversation?.sessionId;
      for (const message of conversation?.messages || []) add(message);
    }
  }
  return [...observations.values()];
}
