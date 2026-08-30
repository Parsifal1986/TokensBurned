import { claudeAdapter } from "./claude.js";
import { codexAdapter } from "./codex.js";

export const adapters = [claudeAdapter, codexAdapter];

export function adapterFor(id) {
  const normalized = String(id || "").toLowerCase();
  return adapters.find(
    (adapter) => adapter.id === normalized || (normalized === "claude" && adapter.id === "claude-code"),
  );
}
