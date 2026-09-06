import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { PROVIDER_LABELS, providerLabel, providerSlug } from "./constants.js";

// Hostnames that map to a well-known provider id. Anything else keeps its
// hostname as the provider id so the card can still name the endpoint.
const PROVIDER_HOSTS = [
  { pattern: /(^|\.)anthropic\.com$/i, provider: "anthropic", type: "official" },
  { pattern: /(^|\.)(openai|chatgpt)\.com$/i, provider: "openai", type: "official" },
  { pattern: /(^|\.)openai\.azure\.com$/i, provider: "azure", type: "official" },
  { pattern: /(^|\.)(ai\.azure|cognitiveservices\.azure|services\.ai\.azure)\.com$/i, provider: "azure", type: "official" },
  { pattern: /(^|\.)deepseek\.com$/i, provider: "deepseek", type: "known-provider" },
  { pattern: /(^|\.)googleapis\.com$/i, provider: "google", type: "official" },
  { pattern: /(^|\.)amazonaws\.com$/i, provider: "amazon-bedrock", type: "official" },
  { pattern: /(^|\.)openrouter\.ai$/i, provider: "openrouter", type: "known-provider" },
  { pattern: /(^|\.)x\.ai$/i, provider: "xai", type: "known-provider" },
  { pattern: /(^|\.)mistral\.ai$/i, provider: "mistral", type: "known-provider" },
  { pattern: /(^|\.)groq\.com$/i, provider: "groq", type: "known-provider" },
  { pattern: /(^|\.)together\.(ai|xyz)$/i, provider: "together", type: "known-provider" },
  { pattern: /(^|\.)fireworks\.ai$/i, provider: "fireworks", type: "known-provider" },
  { pattern: /(^|\.)cerebras\.ai$/i, provider: "cerebras", type: "known-provider" },
  { pattern: /(^|\.)perplexity\.ai$/i, provider: "perplexity", type: "known-provider" },
  { pattern: /(^|\.)cohere\.(ai|com)$/i, provider: "cohere", type: "known-provider" },
  { pattern: /(^|\.)moonshot\.(cn|ai)$/i, provider: "moonshot", type: "known-provider" },
  { pattern: /(^|\.)(aliyuncs|aliyun)\.com$/i, provider: "alibaba", type: "known-provider" },
  { pattern: /(^|\.)bigmodel\.cn$/i, provider: "zhipu", type: "known-provider" },
  { pattern: /(^|\.)z\.ai$/i, provider: "zhipu", type: "known-provider" },
  { pattern: /(^|\.)minimax(i)?\.(com|chat|io)$/i, provider: "minimax", type: "known-provider" },
  { pattern: /(^|\.)(volces|volcengine|byteplus)\.com$/i, provider: "volcengine", type: "known-provider" },
  { pattern: /(^|\.)siliconflow\.(cn|com)$/i, provider: "siliconflow", type: "known-provider" },
  { pattern: /(^|\.)stepfun\.com$/i, provider: "stepfun", type: "known-provider" },
  { pattern: /(^|\.)baidubce\.com$/i, provider: "baidu", type: "known-provider" },
  { pattern: /(^|\.)(tencentcloudapi|hunyuan\.cloud\.tencent)\.com$/i, provider: "tencent", type: "known-provider" },
  { pattern: /(^|\.)ollama\.(com|ai)$/i, provider: "ollama", type: "known-provider" },
  { pattern: /(^|\.)huggingface\.co$/i, provider: "huggingface", type: "known-provider" },
  { pattern: /(^|\.)cloudflare\.com$/i, provider: "cloudflare", type: "known-provider" },
  { pattern: /(^|\.)(nvidia|nvcf\.nvidia)\.com$/i, provider: "nvidia", type: "known-provider" },
];

const OPENAI_DEFAULT_ENDPOINT = "https://api.openai.com/v1";
const ANTHROPIC_DEFAULT_ENDPOINT = "https://api.anthropic.com";

function unresolved(provider, reportedModel, endpointType, confidence) {
  return {
    provider,
    reported_model: reportedModel,
    resolved_model: undefined,
    endpoint_type: endpointType,
    confidence: confidence ?? (reportedModel ? "reported" : "unknown"),
  };
}

function isLocalHost(hostname) {
  return hostname === "localhost"
    || hostname === "127.0.0.1"
    || hostname === "::1"
    || hostname === "0.0.0.0"
    || hostname.endsWith(".local")
    || hostname.endsWith(".localhost");
}

export function classifyEndpoint(endpoint, reportedModel, { fallbackProvider } = {}) {
  if (!endpoint) {
    return unresolved(providerSlug(fallbackProvider, "unknown"), reportedModel, fallbackProvider ? "custom" : "unknown");
  }

  let hostname;
  try {
    hostname = new URL(endpoint).hostname;
  } catch {
    return unresolved(providerSlug(fallbackProvider, "custom"), reportedModel, "custom");
  }

  const match = PROVIDER_HOSTS.find(({ pattern }) => pattern.test(hostname));
  if (!match) {
    // Local servers (Ollama, LM Studio, vLLM, ...) have no meaningful hostname;
    // keep the configured provider id when the harness reported one. Every
    // other unknown gateway keeps its hostname so the card can show it.
    const provider = isLocalHost(hostname)
      ? providerSlug(fallbackProvider, "local")
      : providerSlug(hostname, "custom");
    return unresolved(provider, reportedModel, "custom", "detected");
  }

  return {
    provider: match.provider,
    reported_model: reportedModel,
    resolved_model: resolveKnownModel(match.provider, reportedModel),
    endpoint_type: match.type,
    confidence: "detected",
  };
}

function resolveKnownModel(provider, model) {
  if (!model) return undefined;
  const lower = model.toLowerCase();
  if (provider === "deepseek" && lower.includes("deepseek")) return lower;
  if (provider === "anthropic" && lower.includes("claude")) return lower;
  if (provider === "amazon-bedrock" && lower.includes("claude")) return lower;
  if (provider === "openai" && /^(gpt|o\d|codex)/.test(lower)) return lower;
  if (provider === "azure" && /^(gpt|o\d|codex)/.test(lower)) return lower;
  if (provider === "google" && (lower.includes("gemini") || lower.includes("claude"))) return lower;
  return undefined;
}

export async function detectClaudeBackend({ env = process.env } = {}) {
  // Access only explicitly named variables. Do not parse settings.json because its
  // env object may colocate credentials with safe backend metadata.
  const model =
    env.ANTHROPIC_MODEL ||
    env.ANTHROPIC_DEFAULT_OPUS_MODEL ||
    env.ANTHROPIC_DEFAULT_SONNET_MODEL;
  const endpoint = env.ANTHROPIC_BASE_URL;
  if (endpoint) return classifyEndpoint(endpoint, model);
  // Claude Code routes through a cloud platform when one of these flags is set,
  // otherwise it talks to api.anthropic.com directly.
  const platform = [
    ["CLAUDE_CODE_USE_BEDROCK", "amazon-bedrock"],
    ["CLAUDE_CODE_USE_VERTEX", "google-vertex"],
    ["CLAUDE_CODE_USE_FOUNDRY", "azure"],
  ].find(([flag]) => isEnabled(env[flag]));
  if (platform) {
    return {
      provider: platform[1],
      reported_model: model,
      resolved_model: model && model.toLowerCase().includes("claude") ? model.toLowerCase() : undefined,
      endpoint_type: "official",
      confidence: "detected",
    };
  }
  return classifyEndpoint(ANTHROPIC_DEFAULT_ENDPOINT, model);
}

function isEnabled(value) {
  return typeof value === "string" && /^(1|true|yes|on)$/i.test(value.trim());
}

const CODEX_TOP_LEVEL_KEYS = new Set(["base_url", "model", "model_provider"]);
const CODEX_PROVIDER_KEYS = new Set(["base_url", "name"]);

function unquote(value) {
  return value.replace(/^["']|["']$/g, "");
}

// Reads only backend metadata from ~/.codex/config.toml: the top-level model and
// model_provider, plus base_url/name of [model_providers.<id>] tables. Every
// other key, including env_key names and MCP server settings, is skipped.
export async function readAllowedCodexConfig(file) {
  const result = { model_providers: {} };
  let stream;
  let section = "";
  try {
    stream = fs.createReadStream(file, { encoding: "utf8" });
    const lines = readline.createInterface({ input: stream, crlfDelay: Infinity });
    for await (const line of lines) {
      const header = line.match(/^\s*\[\s*([^\]]+?)\s*\]/);
      if (header) {
        section = header[1];
        continue;
      }
      const match = line.match(/^\s*([a-z_]+)\s*=\s*("[^"]*"|'[^']*')/);
      if (!match) continue;
      const [, key, quoted] = match;
      const value = unquote(quoted);
      if (!section) {
        if (CODEX_TOP_LEVEL_KEYS.has(key)) result[key] = value;
        continue;
      }
      const table = section.match(/^model_providers\.("([^"]+)"|'([^']+)'|([A-Za-z0-9_-]+))$/);
      if (!table || !CODEX_PROVIDER_KEYS.has(key)) continue;
      const id = table[2] ?? table[3] ?? table[4];
      result.model_providers[id] = { ...result.model_providers[id], [key]: value };
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  } finally {
    stream?.destroy();
  }
  return result;
}

export async function detectCodexBackend({
  env = process.env,
  configFile = path.join(os.homedir(), ".codex", "config.toml"),
} = {}) {
  const config = await readAllowedCodexConfig(configFile);
  const model = env.OPENAI_MODEL || config.model;
  const providerId = config.model_provider || "openai";
  const table = Object.hasOwn(config.model_providers, providerId) ? config.model_providers[providerId] : {};
  const endpoint = env.OPENAI_BASE_URL || config.base_url || table.base_url
    || (providerId === "openai" ? OPENAI_DEFAULT_ENDPOINT : undefined);
  // Prefer the human-readable table name; fall back to the provider id.
  const fallbackProvider = table.name || providerId;
  return classifyEndpoint(endpoint, model, { fallbackProvider });
}

export function backendDescription(backend) {
  if (backend.provider === "unknown") return "Unknown";
  if (backend.provider === "custom") return "Custom / Unknown";
  const label = providerLabel(backend.provider);
  if (Object.hasOwn(PROVIDER_LABELS, backend.provider)) return label;
  return backend.endpoint_type === "custom" ? `${label} (custom endpoint)` : label;
}
