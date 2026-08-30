import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";

const PROVIDER_HOSTS = [
  { pattern: /(^|\.)anthropic\.com$/i, provider: "anthropic", type: "official" },
  { pattern: /(^|\.)openai\.com$/i, provider: "openai", type: "official" },
  { pattern: /(^|\.)deepseek\.com$/i, provider: "deepseek", type: "known-provider" },
  { pattern: /(^|\.)googleapis\.com$/i, provider: "google", type: "official" },
];

export function classifyEndpoint(endpoint, reportedModel) {
  if (!endpoint) {
    return {
      provider: "unknown",
      reported_model: reportedModel,
      resolved_model: undefined,
      endpoint_type: "unknown",
      confidence: reportedModel ? "reported" : "unknown",
    };
  }

  let hostname;
  try {
    hostname = new URL(endpoint).hostname;
  } catch {
    return {
      provider: "custom",
      reported_model: reportedModel,
      resolved_model: undefined,
      endpoint_type: "custom",
      confidence: reportedModel ? "reported" : "unknown",
    };
  }

  const match = PROVIDER_HOSTS.find(({ pattern }) => pattern.test(hostname));
  if (!match) {
    return {
      provider: "custom",
      reported_model: reportedModel,
      resolved_model: undefined,
      endpoint_type: "custom",
      confidence: reportedModel ? "reported" : "unknown",
    };
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
  if (provider === "openai" && /^(gpt|o\d|codex)/.test(lower)) return lower;
  if (provider === "google" && lower.includes("gemini")) return lower;
  return undefined;
}

export async function detectClaudeBackend() {
  // Access only explicitly named variables. Do not parse settings.json because its
  // env object may colocate credentials with safe backend metadata.
  const endpoint = process.env.ANTHROPIC_BASE_URL;
  const model =
    process.env.ANTHROPIC_MODEL ||
    process.env.ANTHROPIC_DEFAULT_OPUS_MODEL ||
    process.env.ANTHROPIC_DEFAULT_SONNET_MODEL;
  return classifyEndpoint(endpoint, model);
}

async function readAllowedCodexConfig(file) {
  const allowed = new Set(["base_url", "model", "model_provider"]);
  const result = {};
  let stream;
  try {
    stream = fs.createReadStream(file, { encoding: "utf8" });
    const lines = readline.createInterface({ input: stream, crlfDelay: Infinity });
    for await (const line of lines) {
      const match = line.match(/^\s*([a-z_]+)\s*=\s*["']([^"']+)["']/);
      if (match && allowed.has(match[1])) result[match[1]] = match[2];
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  } finally {
    stream?.destroy();
  }
  return result;
}

export async function detectCodexBackend() {
  const config = await readAllowedCodexConfig(path.join(os.homedir(), ".codex", "config.toml"));
  const endpoint = process.env.OPENAI_BASE_URL || config.base_url;
  const model = process.env.OPENAI_MODEL || config.model;
  const provider = config.model_provider;
  if (!endpoint && provider && provider !== "openai") {
    return {
      provider: "custom",
      reported_model: model,
      resolved_model: undefined,
      endpoint_type: "custom",
      confidence: model ? "reported" : "unknown",
    };
  }
  return classifyEndpoint(endpoint, model);
}

export function backendDescription(backend) {
  if (backend.provider === "unknown") return "Unknown";
  if (backend.provider === "custom") return "Custom / Unknown";
  return backend.provider[0].toUpperCase() + backend.provider.slice(1);
}
