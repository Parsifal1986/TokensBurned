import { VERSION } from "./constants.js";
import {
  readConfig,
  readCredentials,
  writeConfig,
} from "./storage.js";
import { checkForUpdate, updatePrompt } from "./update.js";

export function onboardingHarness(env = process.env) {
  if (env.CODEX_PLUGIN_ROOT) return "codex";
  if (env.CLAUDE_PLUGIN_ROOT) return "claude-code";
  return env.TOKENSBURNED_HARNESS || undefined;
}

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
  let connected = false;
  try {
    const credentials = await readCredentialsImpl();
    connected = typeof credentials.device_token === "string"
      && credentials.device_token.startsWith("tb_live_");
  } catch {
    connected = false;
  }

  if (!connected) {
    context.push("TokensBurned is installed but not connected. Briefly tell the user they can run the plugin's connect command to authorize GitHub and optionally import up to 90 days of token-only session history. The public card stays off unless they explicitly publish it. Never claim prompts or responses are uploaded.");
  }

  if (env.TOKENSBURNED_DISABLE_UPDATE_CHECK !== "1") {
    try {
      const config = await readConfigImpl();
      const result = await checkForUpdateImpl(config, {
        fetchImpl,
        now,
        timeoutMs: 1_500,
      });
      if (result.checked) await writeConfigImpl(config);
      const prompt = updatePrompt(result.release, {
        currentVersion: VERSION,
        harness: onboardingHarness(env),
      });
      if (prompt) context.push(prompt);
    } catch {
      // Session startup must never fail because the optional release check failed.
    }
  }

  return context.join("\n\n");
}
