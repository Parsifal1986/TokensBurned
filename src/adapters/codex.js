import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { detectCodexBackend } from "../backend.js";

export const codexAdapter = {
  id: "codex",
  label: "Codex",
  async detect() {
    try {
      await fs.access(path.join(os.homedir(), ".codex"));
      return true;
    } catch {
      return false;
    }
  },
  async readUsage() {
    // Burn only accepts the usage object supplied by a hook. It never parses
    // rollout/session history because those files may also contain prompts.
    return [];
  },
  detectBackend: detectCodexBackend,
};
