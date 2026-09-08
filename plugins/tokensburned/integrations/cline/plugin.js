import { API_ORIGIN } from "../../src/constants.js";
import { readConfig, readCredentials } from "../../src/storage.js";
import { syncUsageEntries } from "../../src/server-outbox.js";
import { clineObservation } from "../../src/cline-usage.js";
import { ensureUploadWorker } from "../../src/upload-worker.js";

// AgentAfterModelContext supplies per-call metrics, modelInfo, id and createdAt.
// Never traverse content or snapshot.messages. Contract: Cline SDK shared/agent.ts.
function observationFromModel(context, now = Date.now()) {
  try { return clineObservation(context?.assistantMessage, { now }); } catch { return null; }
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
