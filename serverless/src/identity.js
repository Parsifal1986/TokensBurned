const HARNESS_ALIASES = new Map(Object.entries({
  "anthropic-claude-code": "claude-code",
  "claude": "claude-code",
  "claude_code": "claude-code",
  "openai-codex": "codex",
  "codex-cli": "codex",
  "gemini": "gemini-cli",
  "gemini_cli": "gemini-cli",
  "google-gemini-cli": "gemini-cli",
  "opencode-ai": "opencode",
  "open-code": "opencode",
  "cursor-agent": "cursor",
  "cline-vscode": "cline",
  "aider-chat": "aider",
  "github-copilot": "copilot-cli",
  "github-copilot-cli": "copilot-cli",
}));

const PROVIDER_ALIASES = new Map(Object.entries({
  "amazon-bedrock": "aws-bedrock",
  "aws": "aws-bedrock",
  "bedrock": "aws-bedrock",
  "azure": "azure-openai",
  "azure-ai-openai": "azure-openai",
  "google-ai": "google",
  "google-ai-studio": "google",
  "google-vertex-ai": "google-vertex",
  "vertex-ai": "google-vertex",
  "x-ai": "xai",
  "x.ai": "xai",
}));

const MODEL_PROVIDERS = [
  [/^claude(?:[-_.]|$)/, "anthropic"],
  [/^(?:gpt|chatgpt|codex)(?:[-_.]|$)|^o[1345](?:[-_.]|$)/, "openai"],
  [/^gemini(?:[-_.]|$)/, "google"],
  [/^deepseek(?:[-_.]|$)/, "deepseek"],
  [/^grok(?:[-_.]|$)/, "xai"],
  [/^(?:mistral|mixtral|codestral|ministral)(?:[-_.]|$)/, "mistral"],
  [/^(?:command|embed)(?:[-_.]|$)/, "cohere"],
  [/^(?:llama|code-llama)(?:[-_.]|$)/, "meta"],
  [/^(?:amazon-)?nova(?:[-_.]|$)/, "aws-bedrock"],
  [/^(?:qwen|qwq)(?:[-_.]|$)/, "alibaba"],
  [/^(?:kimi|moonshot)(?:[-_.]|$)/, "moonshot"],
  [/^(?:glm|chatglm)(?:[-_.]|$)/, "zhipu"],
  [/^minimax(?:[-_.]|$)/, "minimax"],
];

function clean(value, fallback = "unknown", max = 160) {
  const normalized = String(value ?? fallback)
    .trim()
    .toLowerCase()
    .replace(/[\s/]+/g, "-")
    .replace(/[^a-z0-9._:-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return (normalized || fallback).slice(0, max);
}

export function normalizeHarness(value) {
  const harness = clean(value, "unknown", 64);
  return HARNESS_ALIASES.get(harness) || harness;
}

export function normalizeModel(value) {
  let model = String(value ?? "unknown")
    .trim()
    .toLowerCase()
    .replace(/[\s]+/g, "-")
    .replace(/[^a-z0-9._:/-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160) || "unknown";
  // OpenRouter and proxy stacks commonly prefix the provider. Provider is a
  // separate dimension in TokensBurned, so keep one canonical model identity.
  if (model.includes("/")) model = model.split("/").at(-1) || "unknown";
  return model;
}

export function inferProvider(model) {
  const canonical = normalizeModel(model);
  for (const [pattern, provider] of MODEL_PROVIDERS) {
    if (pattern.test(canonical)) return provider;
  }
  return "unknown";
}

export function normalizeProvider(value, model) {
  const provider = clean(value, "unknown", 64);
  const canonical = PROVIDER_ALIASES.get(provider) || provider;
  return canonical === "unknown" && inferProvider(model) !== "unknown"
    ? inferProvider(model)
    : canonical;
}

export function identifyDimensions({ harness, provider, model } = {}) {
  const canonicalModel = normalizeModel(model);
  return {
    harness: normalizeHarness(harness),
    provider: normalizeProvider(provider, canonicalModel),
    model: canonicalModel,
  };
}
