import os from "node:os";
import path from "node:path";

export const VERSION = "0.6.8";
export const STATS_VERSION = 2;
export const SYNC_INTERVAL_MS = 3 * 60 * 60 * 1000;
// Server write window for the current day (one write per UTC hour). The
// override exists only so tests can exercise window boundaries quickly.
export const UPLOAD_INTERVAL_MS = Number(process.env.TOKENSBURNED_UPLOAD_WINDOW_MS) > 0
  ? Number(process.env.TOKENSBURNED_UPLOAD_WINDOW_MS)
  : 60 * 60 * 1000;
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

// Provider ids are open-ended: a well-known id from PROVIDER_LABELS, a slug
// from the harness config (Codex model_provider), or the endpoint hostname for
// gateways TokensBurned does not recognize. "custom" and "unknown" stay valid.
export const PROVIDER_ID_MAX_LENGTH = 64;

export function providerSlug(value, fallback = "unknown") {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s/]+/g, "-")
    .replace(/[^a-z0-9._:-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, PROVIDER_ID_MAX_LENGTH);
  return normalized || fallback;
}

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
  azure: "Azure",
  deepseek: "DeepSeek",
  google: "Google",
  "google-vertex": "Vertex AI",
  "amazon-bedrock": "Bedrock",
  openrouter: "OpenRouter",
  xai: "xAI",
  mistral: "Mistral",
  groq: "Groq",
  together: "Together",
  fireworks: "Fireworks",
  cerebras: "Cerebras",
  perplexity: "Perplexity",
  cohere: "Cohere",
  moonshot: "Moonshot",
  alibaba: "Alibaba",
  zhipu: "Zhipu",
  minimax: "MiniMax",
  volcengine: "Volcengine",
  siliconflow: "SiliconFlow",
  stepfun: "StepFun",
  baidu: "Baidu",
  tencent: "Tencent",
  ollama: "Ollama",
  huggingface: "Hugging Face",
  cloudflare: "Cloudflare",
  nvidia: "NVIDIA",
  local: "Local",
  custom: "Custom",
  unknown: "Unknown",
};

// Known ids get a curated label. Hostnames (anything containing a dot) are
// shown verbatim so an unrecognized gateway is still identifiable. Other slugs
// are title-cased.
export function providerLabel(key) {
  const id = String(key ?? "unknown");
  if (Object.hasOwn(PROVIDER_LABELS, id)) return PROVIDER_LABELS[id];
  if (id.includes(".")) return id;
  return id
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ") || "Unknown";
}

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
