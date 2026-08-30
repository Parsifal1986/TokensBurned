#!/usr/bin/env node

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const burnHome = path.resolve(process.env.BURN_HOME || path.join(os.homedir(), ".burn"));
const credentialFile = path.join(burnHome, "credentials.json");
let connected = false;
try {
  const credentials = JSON.parse(await fs.readFile(credentialFile, "utf8"));
  connected = typeof credentials.device_token === "string" && credentials.device_token.startsWith("tb_live_");
} catch {
  connected = false;
}

if (!connected) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: "TokensBurned is installed but not connected. Briefly tell the user they can run the plugin's connect command to authorize GitHub and optionally import up to 90 days of token-only session history. Never claim prompts or responses are uploaded.",
    },
  }));
}
