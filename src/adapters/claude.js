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
    // Continuous collection and backfill use the scoped src/history.js reader.
    // This lightweight hook adapter does not enumerate history itself.
    return [];
  },
  detectBackend: detectClaudeBackend,
};
