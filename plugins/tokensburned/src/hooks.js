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

// The Claude Code plugin already ships a SessionEnd hook. Installing a second
// one in settings.json would count every session twice locally (B9).
export async function detectPluginHooks({ env = process.env } = {}) {
  if (env.CLAUDE_PLUGIN_ROOT) {
    return "this command is running inside the TokensBurned Claude Code plugin, whose hooks.json already provides the SessionEnd hook";
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
