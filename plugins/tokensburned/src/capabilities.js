// Capability is separate from installation detection and from having a token.
export const harnessCapabilities = Object.freeze([
  { id: "codex", label: "Codex", capture: "session hooks", history: true },
  { id: "claude-code", label: "Claude Code", capture: "session hooks", history: true },
  { id: "cline", label: "Cline", capture: "afterModel + SDK messages.json / classic IDE task usage via run", history: true },
  { id: "gemini-cli", label: "Gemini CLI", capture: "run: recorded JSON/JSONL session usage", history: true },
  { id: "copilot", label: "GitHub Copilot CLI", capture: "live assistant.usage extension (integrations install copilot; --experimental)", history: false },
  { id: "opencode", label: "OpenCode", capture: "run: v1/v2 SQLite (sqlite3 required) + legacy message JSON", history: true },
  { id: "cursor", label: "Cursor", capture: null, history: false },
  { id: "aider", label: "Aider", capture: null, history: false },
]);

export function detectedHarness(env = process.env) {
  if (env.TOKENSBURNED_HARNESS) return env.TOKENSBURNED_HARNESS === "claude" ? "claude-code" : env.TOKENSBURNED_HARNESS;
  if (env.CODEX_PLUGIN_ROOT) return "codex";
  if (env.CLAUDE_PLUGIN_ROOT) return "claude-code";
  if (env.COPILOT_PLUGIN_ROOT) return "copilot";
  if (env.GEMINI_SESSION_ID || env.TOKENSBURNED_EXTENSION_PATH) return "gemini-cli";
  return undefined;
}

export function capabilityLines(outbox) {
  return harnessCapabilities.map(({ id, label, capture, history }) => {
    const buckets = Object.values(outbox?.sources || {}).filter((source) => source.harness === id && Number.isSafeInteger(source.bucket)).map((source) => source.bucket);
    const latest = buckets.length ? new Date(buckets.reduce((a, b) => Math.max(a, b)) * 900_000).toISOString() : "none observed";
    return `${label}: auto capture ${capture || "not implemented; use ingest --upload"}; history ${history ? "supported" : "not supported"}; latest queued usage (UTC bucket): ${latest}`;
  });
}
