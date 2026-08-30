import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { detectClaudeBackend } from "../backend.js";

export const claudeAdapter = {
  id: "claude-code",
  label: "Claude Code",
  async detect() {
    try {
      await fs.access(path.join(os.homedir(), ".claude"));
      return true;
    } catch {
      return false;
    }
  },
  async readUsage() {
    // Usage arrives through the official lifecycle hook. Burn intentionally does
    // not open Claude transcript files because those contain prompt content.
    return [];
  },
  detectBackend: detectClaudeBackend,
};
