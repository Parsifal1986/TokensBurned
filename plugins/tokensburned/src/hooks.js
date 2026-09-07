import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { atomicWrite } from "./atomic-write.js";

const CLAUDE_SETTINGS = path.join(os.homedir(), ".claude", "settings.json");
const CLAUDE_INSTALLED_PLUGINS = path.join(os.homedir(), ".claude", "plugins", "installed_plugins.json");

async function readJson(file) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return {};
    throw new Error(`Could not parse ${file}: ${error.message}`);
  }
}

// Stop merges the transcript after every turn (desktop sessions rarely end),
// SessionStart catches up recent transcripts and SessionEnd covers CLI exits.
export const LIFECYCLE_EVENTS = ["SessionStart", "Stop", "SessionEnd"];

// The Claude Code plugin already ships these hooks. Installing a second set in
// settings.json would count every session twice locally (B9).
export async function detectPluginHooks({ env = process.env } = {}) {
  if (env.CLAUDE_PLUGIN_ROOT) {
    return "this command is running inside the TokensBurned Claude Code plugin, whose hooks.json already provides the SessionEnd hook and its siblings";
  }
  const installed = await readJson(CLAUDE_INSTALLED_PLUGINS);
  const plugins = installed?.plugins && typeof installed.plugins === "object" ? Object.keys(installed.plugins) : [];
  if (plugins.some((name) => /^tokensburned@/i.test(name))) {
    return `the TokensBurned plugin is installed in Claude Code (${CLAUDE_INSTALLED_PLUGINS}) and already provides the SessionEnd hook`;
  }
  return null;
}

export async function installClaudeHook(command = "burn hook claude", { env = process.env } = {}) {
  const pluginReason = await detectPluginHooks({ env });
  if (pluginReason) {
    throw new Error(`Not installing a settings.json hook: ${pluginReason}. A second hook would double-count sessions locally. Remove the plugin first if you really want a manual hook.`);
  }
  const settings = await readJson(CLAUDE_SETTINGS);
  const hooks = settings.hooks && typeof settings.hooks === "object" ? { ...settings.hooks } : {};
  let changed = false;
  for (const event of LIFECYCLE_EVENTS) {
    const groups = Array.isArray(hooks[event]) ? hooks[event] : [];
    const alreadyInstalled = groups.some((group) =>
      group?.hooks?.some((hook) => String(hook.command || "").includes("burn hook claude")),
    );
    if (alreadyInstalled) continue;
    hooks[event] = [...groups, { hooks: [{ type: "command", command, timeout: 10 }] }];
    changed = true;
  }
  if (!changed) return { changed: false, file: CLAUDE_SETTINGS };
  await atomicWrite(CLAUDE_SETTINGS, `${JSON.stringify({ ...settings, hooks }, null, 2)}\n`);
  return { changed: true, file: CLAUDE_SETTINGS };
}

export function hookInstallNotice() {
  return [
    "Claude Code uses its official SessionStart, Stop and SessionEnd hooks.",
    "Codex uses the hook bundled with the installed Burn plugin.",
    "Burn will never replace an existing Codex notify command.",
  ].join("\n");
}
