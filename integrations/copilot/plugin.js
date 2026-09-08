import { copilotObservation } from "../../src/copilot-usage.js";
import { readConfig, readCredentials } from "../../src/storage.js";
import { syncUsageEntries } from "../../src/server-outbox.js";
import { ensureUploadWorker } from "../../src/upload-worker.js";

export function attachCopilotUsage(session, {
  configImpl = readConfig, credentialsImpl = readCredentials,
  queueImpl = syncUsageEntries, workerImpl = ensureUploadWorker, now = Date.now,
} = {}) {
  return session.on("assistant.usage", async event => {
    try {
      const entry = copilotObservation(event, { now: now() });
      if (!entry) return;
      const [config, credentials] = await Promise.all([configImpl(), credentialsImpl()]);
      if (!config.server?.enabled || !credentials.device_token) return;
      await queueImpl([entry], { upload: false });
      await workerImpl();
    } catch {
      // Usage collection must never interrupt the coding session.
    }
  });
}
