import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { atomicWrite } from "./atomic-write.js";

const marker = "// Managed by TokensBurned: Copilot usage extension";
export async function installCopilotExtension({ home = os.homedir(), runtime = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..") } = {}) {
  const file = path.join(home, ".copilot", "extensions", "tokensburned", "extension.mjs");
  let existing;
  try { existing = await fs.readFile(file, "utf8"); } catch (error) { if (error.code !== "ENOENT") throw error; }
  if (existing && !existing.startsWith(marker + "\n")) throw new Error("Copilot extension path already contains an unmanaged extension; it was kept.");
  const module = pathToFileURL(path.join(runtime, "integrations", "copilot", "plugin.js")).href;
  await atomicWrite(file, `${marker}\nimport { joinSession } from "@github/copilot-sdk/extension";\nimport { attachCopilotUsage } from ${JSON.stringify(module)};\nattachCopilotUsage(await joinSession({}));\n`);
  return file;
}
