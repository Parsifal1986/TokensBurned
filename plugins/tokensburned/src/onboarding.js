import { VERSION } from "./constants.js";
import { detectedHarness } from "./capabilities.js";
import {
  readConfig,
  readCredentials,
  writeConfig,
} from "./storage.js";
import { checkForUpdate, updatePrompt } from "./update.js";

export function onboardingHarness(env = process.env) {
  return detectedHarness(env);
}

// Remind an unconnected install at most this many times, then stay quiet (B5).
export const MAX_CONNECT_NOTICES = 3;

export async function sessionStartContext({
  env = process.env,
  now = Date.now(),
  fetchImpl,
  readConfigImpl = readConfig,
  readCredentialsImpl = readCredentials,
  writeConfigImpl = writeConfig,
  checkForUpdateImpl = checkForUpdate,
} = {}) {
  const context = [];
  const harness = onboardingHarness(env);
  if (harness && !["codex", "claude-code"].includes(harness)) {
    context.push(`TokensBurned does not support history backfill for ${harness}. Connecting does not enable automatic collection. Run tokensburned doctor for capture capabilities; explicit cloud imports use ingest --upload and the contract in docs/usage-import.md.`);
  }
  let connected = false;
  try {
    const credentials = await readCredentialsImpl();
    connected = typeof credentials.device_token === "string"
      && credentials.device_token.startsWith("tb_live_");
  } catch {
    connected = false;
  }

  let config = null;
  let dirty = false;
  try {
    config = await readConfigImpl();
  } catch {
    config = null;
  }

  if (!connected) {
    const shown = Number(config?.onboarding?.connect_notices || 0);
    if (!config || shown < MAX_CONNECT_NOTICES) {
      context.push("TokensBurned is installed but not connected. Briefly tell the user they can run the plugin's connect command to authorize GitHub and optionally import up to 90 days of token-only session history. The public card stays off unless they explicitly publish it. Never claim prompts or responses are uploaded.");
      if (config) {
        config.onboarding = { ...config.onboarding, connect_notices: shown + 1 };
        dirty = true;
      }
    }
  }

  if (config && env.TOKENSBURNED_DISABLE_UPDATE_CHECK !== "1") {
    try {
      const result = await checkForUpdateImpl(config, {
        fetchImpl,
        now,
        timeoutMs: 1_500,
      });
      if (result.checked) dirty = true;
      // Between checks, keep reminding from the cached release metadata so an
      // outdated install is noticed even when the daily check already ran.
      const release = result.checked
        ? result.release
        : (config.updates?.latest_version ? config.updates : null);
      const prompt = updatePrompt(release, {
        currentVersion: VERSION,
        harness: onboardingHarness(env),
      });
      if (prompt) context.push(prompt);
    } catch {
      // Session startup must never fail because the optional release check failed.
    }
  }

  if (config && dirty) {
    try {
      await writeConfigImpl(config);
    } catch {
      // A read-only config directory must not break session startup.
    }
  }

  return context.join("\n\n");
}
