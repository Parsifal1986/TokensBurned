import { usageObservation } from "./observations.js";

// assistant.usage is a per-API-call event, including subagents, and is ephemeral.
// Never substitute session.usage_info (context size) or premium-request credits.
export function copilotObservation(event, { now = Date.now() } = {}) {
  if (event?.type !== "assistant.usage") return null;
  const data = event.data;
  if (!data || data.inputTokens == null || data.outputTokens == null) return null;
  const values = [data.inputTokens, data.outputTokens, data.cacheReadTokens ?? 0,
    data.cacheWriteTokens ?? 0, data.reasoningTokens ?? 0];
  if (!values.every(v => Number.isSafeInteger(v) && v >= 0)) throw new Error("Unsupported Copilot usage counters");
  const [input, output, read, write, reasoning] = values;
  if (read + write > input || reasoning > output) throw new Error("Unsupported Copilot usage subsets");
  if (input + output === 0) return null;
  return usageObservation({ id: event.id, timestamp: event.timestamp, harness: { id: "copilot" },
    backend: { provider: "github-copilot", model: data.model || "unknown" },
    usage_semantics: "exclusive-delta", usage: { input_tokens: input - read - write,
      output_tokens: output - reasoning, cache_read_tokens: read, cache_write_tokens: write, reasoning_tokens: reasoning },
  }, { now });
}
