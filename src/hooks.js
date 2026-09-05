import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { atomicWrite } from "./atomic-write.js";

const CLAUDE_SETTINGS = path.join(os.homedir(), ".claude", "settings.json");

async function readJson(file) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return {};
    throw new Error(`Could not parse ${file}: ${error.message}`);
  }
}

export async function installClaudeHook(command = "burn hook claude") {
  const settings = await readJson(CLAUDE_SETTINGS);
  const hooks = settings.hooks && typeof settings.hooks === "object" ? settings.hooks : {};
  const sessionEnd = Array.isArray(hooks.SessionEnd) ? hooks.SessionEnd : [];
  const alreadyInstalled = sessionEnd.some((group) =>
    group?.hooks?.some((hook) => String(hook.command || "").includes("burn hook claude")),
  );
  if (alreadyInstalled) return { changed: false, file: CLAUDE_SETTINGS };

  sessionEnd.push({
    hooks: [{ type: "command", command, timeout: 10 }],
  });
  const updated = {
    ...settings,
    hooks: { ...hooks, SessionEnd: sessionEnd },
  };
  await atomicWrite(CLAUDE_SETTINGS, `${JSON.stringify(updated, null, 2)}\n`);
  return { changed: true, file: CLAUDE_SETTINGS };
}

export function hookInstallNotice() {
  return [
    "Claude Code uses its official SessionEnd hook.",
    "Codex uses the hook bundled with the installed Burn plugin.",
    "Burn will never replace an existing Codex notify command.",
  ].join("\n");
}
