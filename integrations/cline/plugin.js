import { API_ORIGIN } from "../../src/constants.js";
import { readConfig, readCredentials } from "../../src/storage.js";
import { syncUsageEntries } from "../../src/server-outbox.js";
import { usageObservation } from "../../src/observations.js";
import { ensureUploadWorker } from "../../src/upload-worker.js";

// AgentAfterModelContext supplies per-call metrics, modelInfo, id and createdAt.
// Never traverse content or snapshot.messages. Contract: Cline SDK shared/agent.ts.
function observationFromModel(context, now = Date.now()) {
  const message = context?.assistantMessage;
  const usage = message?.metrics;
  if (!message || message.role !== "assistant" || !usage) return null;
  const counters = {};
  for (const field of ["inputTokens", "outputTokens", "cacheReadTokens", "cacheWriteTokens", "reasoningTokenCount"]) {
    const value = usage[field] ?? 0;
    if (!Number.isSafeInteger(value) || value < 0) return null;
    counters[field] = value;
  }
  const { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, reasoningTokenCount } = counters;
  if (!inputTokens && !outputTokens) return null;
  // The normalized gateway input includes cache; output includes reasoning.
  // Split subsets instead of adding them twice. Skip incompatible custom metrics.
  if (cacheReadTokens + cacheWriteTokens > inputTokens || reasoningTokenCount > outputTokens) return null;
  if (!Number.isFinite(message.createdAt)) return null;
  return usageObservation({
    id: message.id,
    timestamp: new Date(message.createdAt).toISOString(),
    usage_semantics: "exclusive-delta",
    harness: { id: "cline" },
    backend: {
      provider: message.modelInfo?.provider || "unknown",
      model: message.modelInfo?.id || "unknown",
    },
    usage: {
      input_tokens: inputTokens - cacheReadTokens - cacheWriteTokens,
      output_tokens: outputTokens - reasoningTokenCount,
      cache_read_tokens: cacheReadTokens,
      cache_write_tokens: cacheWriteTokens,
      reasoning_tokens: reasoningTokenCount,
    },
    request_count: 1,
  }, { now });
}

// Same storage as the CLI, so a custom BURN_HOME is honoured here too (B6).
async function connection() {
  const [credentials, config] = await Promise.all([readCredentials(), readConfig()]);
  if (!credentials.device_token || !config.server?.enabled) return null;
  return {
    token: credentials.device_token,
    credentialApiOrigin: credentials.api_origin,
    devicePrivateKeyJwk: credentials.device_private_key_jwk,
    origin: String(config.server.api_origin || API_ORIGIN).replace(/\/$/, ""),
  };
}

export function createClinePlugin({
  connectionImpl = connection,
  queueImpl = syncUsageEntries,
  workerImpl = ensureUploadWorker,
  now = Date.now,
} = {}) {
  return {
    name: "tokensburned",
    manifest: { capabilities: ["hooks"] },
    setup() {},
    hooks: {
      async afterModel(context) {
        try {
          const entry = observationFromModel(context, now());
          if (!entry || !(await connectionImpl())) return;
          // Persist and deduplicate before returning. The worker does networking
          // outside the coding agent's model hook and obeys its upload window.
          await queueImpl([entry], { upload: false });
          await workerImpl();
        } catch {
          // Telemetry must never stop or modify the coding agent's reply.
        }
      },
    },
  };
}

export const clineInternals = { connection, observationFromModel };
export default createClinePlugin();
