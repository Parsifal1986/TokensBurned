import os from "node:os";
import path from "node:path";

export const VERSION = "0.6.2";
export const STATS_VERSION = 2;
export const SYNC_INTERVAL_MS = 3 * 60 * 60 * 1000;
export const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const API_ORIGIN = process.env.TOKENSBURNED_API_ORIGIN || "https://api.tokensburned.com";

export const BURN_HOME = path.resolve(
  process.env.BURN_HOME || path.join(os.homedir(), ".burn"),
);
export const STATS_PATH = path.join(BURN_HOME, "stats.json");
export const CONFIG_PATH = path.join(BURN_HOME, "config.json");
export const SVG_PATH = path.join(BURN_HOME, "stats.svg");
export const CREDENTIALS_PATH = path.join(BURN_HOME, "credentials.json");
export const SERVER_OUTBOX_PATH = path.join(BURN_HOME, "server-outbox.json");

export const KNOWN_PROVIDERS = new Set([
  "anthropic",
  "openai",
  "deepseek",
  "google",
  "custom",
  "unknown",
]);

export const KNOWN_CONFIDENCE = new Set([
  "verified",
  "detected",
  "reported",
  "unknown",
]);

export const KNOWN_ENDPOINT_TYPES = new Set([
  "official",
  "known-provider",
  "custom",
  "unknown",
]);

export const HARNESS_LABELS = {
  "claude-code": "Claude Code",
  codex: "Codex",
  unknown: "Unknown",
};

export const PROVIDER_LABELS = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  deepseek: "DeepSeek",
  google: "Google",
  custom: "Custom",
  unknown: "Unknown",
};

export const MEMES = [
  "touch grass immediately",
  "the autocomplete has become sentient",
  "your keyboard is mostly decorative now",
  "human contribution detected: 3%",
  "another 8M tokens will definitely fix it",
  "this could have been a bash script",
  "vibe responsibly",
  "no thoughts, just tokens",
  "the cloud bill fears this developer",
  "you are not coding. you are supervising.",
];
