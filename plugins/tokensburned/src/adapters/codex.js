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
    // Continuous collection and backfill use the scoped src/history.js reader.
    // This lightweight hook adapter does not enumerate history itself.
    return [];
  },
  detectBackend: detectCodexBackend,
};
