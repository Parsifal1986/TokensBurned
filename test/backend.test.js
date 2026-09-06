import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  backendDescription,
  classifyEndpoint,
  detectClaudeBackend,
  detectCodexBackend,
  readAllowedCodexConfig,
} from "../src/backend.js";
import { providerLabel, providerSlug } from "../src/constants.js";

test("detects known providers from endpoint hostname", () => {
  const result = classifyEndpoint("https://api.deepseek.com/v1", "deepseek-v4");
  assert.equal(result.provider, "deepseek");
  assert.equal(result.confidence, "detected");
  assert.equal(result.endpoint_type, "known-provider");
  assert.equal(classifyEndpoint("https://api.openai.com/v1", "gpt-6").provider, "openai");
  assert.equal(classifyEndpoint("https://chatgpt.com/backend-api/codex", "gpt-6").provider, "openai");
  assert.equal(classifyEndpoint("https://openrouter.ai/api/v1", "x").provider, "openrouter");
  assert.equal(classifyEndpoint("https://my-team.openai.azure.com/openai", "gpt-6").provider, "azure");
  assert.equal(classifyEndpoint("https://dashscope.aliyuncs.com/compatible-mode/v1", "qwen").provider, "alibaba");
});

test("does not guess provider without an endpoint", () => {
  const result = classifyEndpoint(undefined, "claude-opus-4-1");
  assert.equal(result.provider, "unknown");
  assert.equal(result.confidence, "reported");
  assert.equal(result.resolved_model, undefined);
});

test("keeps the hostname of unrecognized gateways as the provider id", () => {
  const result = classifyEndpoint("https://llm.internal.example/v1", "gpt-whatever");
  assert.deepEqual(result, {
    provider: "llm.internal.example",
    reported_model: "gpt-whatever",
    resolved_model: undefined,
    endpoint_type: "custom",
    confidence: "detected",
  });
  assert.equal(providerLabel(result.provider), "llm.internal.example");
  assert.equal(backendDescription(result), "llm.internal.example (custom endpoint)");
});

test("hostname ids never carry paths, ports, credentials or query strings", () => {
  const result = classifyEndpoint("https://user:secret@gateway.example:8443/v1/chat?key=abc", "m");
  assert.equal(result.provider, "gateway.example");
  assert.equal(JSON.stringify(result).includes("secret"), false);
  assert.equal(JSON.stringify(result).includes("8443"), false);
});

test("local endpoints keep the configured provider name instead of localhost", () => {
  const named = classifyEndpoint("http://localhost:11434/v1", "llama", { fallbackProvider: "Ollama" });
  assert.equal(named.provider, "ollama");
  assert.equal(providerLabel(named.provider), "Ollama");
  const anonymous = classifyEndpoint("http://127.0.0.1:1234/v1", "llama");
  assert.equal(anonymous.provider, "local");
  const malformed = classifyEndpoint("not a url", "m", { fallbackProvider: "LM Studio" });
  assert.equal(malformed.provider, "lm-studio");
  assert.equal(providerLabel(malformed.provider), "Lm Studio");
});

test("provider slugs are bounded and prototype-safe", () => {
  assert.equal(providerSlug("  My Router / EU  "), "my-router-eu");
  assert.equal(providerSlug("__proto__"), "__proto__");
  assert.equal(providerSlug("", "custom"), "custom");
  assert.equal(providerSlug("x".repeat(200)).length, 64);
  assert.equal(providerLabel("__proto__"), "Proto");
  assert.equal(providerLabel("openai"), "OpenAI");
  assert.equal(providerLabel(undefined), "Unknown");
});

test("codex defaults to OpenAI when no base_url or model_provider is configured", async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "burn-codex-"));
  const configFile = path.join(home, "config.toml");
  await fs.writeFile(configFile, 'model = "gpt-6-astra"\n\n[projects."/x"]\ntrust_level = "trusted"\n');
  const backend = await detectCodexBackend({ env: {}, configFile });
  assert.equal(backend.provider, "openai");
  assert.equal(backend.confidence, "detected");
  assert.equal(backend.resolved_model, "gpt-6-astra");
  assert.equal(backendDescription(backend), "OpenAI");
  const missing = await detectCodexBackend({ env: {}, configFile: path.join(home, "absent.toml") });
  assert.equal(missing.provider, "openai");
  await fs.rm(home, { recursive: true, force: true });
});

test("codex resolves the active model_providers table without reading other keys", async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "burn-codex-"));
  const configFile = path.join(home, "config.toml");
  await fs.writeFile(configFile, [
    'model = "qwen-max"',
    'model_provider = "my-router"',
    "",
    "[model_providers.openai]",
    'base_url = "https://api.openai.com/v1"',
    "",
    "[model_providers.my-router]",
    'name = "Team Router"',
    'base_url = "https://llm.internal.example/v1"',
    'env_key = "TEAM_ROUTER_KEY"',
    "",
    '[model_providers."quoted id"]',
    'base_url = "https://openrouter.ai/api/v1"',
    "",
    "[mcp_servers.demo.env]",
    'base_url = "https://should-not-leak.example"',
    "",
  ].join("\n"));
  const config = await readAllowedCodexConfig(configFile);
  assert.deepEqual(Object.keys(config.model_providers).sort(), ["my-router", "openai", "quoted id"]);
  assert.equal(config.model_providers["my-router"].env_key, undefined);
  assert.equal(config.base_url, undefined);
  const backend = await detectCodexBackend({ env: {}, configFile });
  assert.equal(backend.provider, "llm.internal.example");
  assert.equal(backend.endpoint_type, "custom");

  const local = await detectCodexBackend({ env: {}, configFile: (await (async () => {
    const file = path.join(home, "local.toml");
    await fs.writeFile(file, 'model_provider = "ollama"\n[model_providers.ollama]\nname = "Ollama"\nbase_url = "http://localhost:11434/v1"\n');
    return file;
  })()) });
  assert.equal(local.provider, "ollama");

  const noTable = await detectCodexBackend({ env: {}, configFile: (await (async () => {
    const file = path.join(home, "notable.toml");
    await fs.writeFile(file, 'model_provider = "private-router"\n');
    return file;
  })()) });
  assert.equal(noTable.provider, "private-router");
  assert.equal(noTable.endpoint_type, "custom");
  assert.equal(providerLabel(noTable.provider), "Private Router");

  const env = await detectCodexBackend({ env: { OPENAI_BASE_URL: "https://api.deepseek.com/v1" }, configFile });
  assert.equal(env.provider, "deepseek");
  await fs.rm(home, { recursive: true, force: true });
});

test("claude code defaults to Anthropic and recognizes cloud platform flags", async () => {
  const direct = await detectClaudeBackend({ env: {} });
  assert.equal(direct.provider, "anthropic");
  assert.equal(direct.endpoint_type, "official");
  const proxied = await detectClaudeBackend({ env: { ANTHROPIC_BASE_URL: "https://api.deepseek.com/anthropic", ANTHROPIC_MODEL: "deepseek-v4" } });
  assert.equal(proxied.provider, "deepseek");
  assert.equal(proxied.resolved_model, "deepseek-v4");
  const bedrock = await detectClaudeBackend({ env: { CLAUDE_CODE_USE_BEDROCK: "1", ANTHROPIC_MODEL: "Claude-Opus-4-1" } });
  assert.equal(bedrock.provider, "amazon-bedrock");
  assert.equal(bedrock.resolved_model, "claude-opus-4-1");
  assert.equal(providerLabel(bedrock.provider), "Bedrock");
  const vertex = await detectClaudeBackend({ env: { CLAUDE_CODE_USE_VERTEX: "true" } });
  assert.equal(vertex.provider, "google-vertex");
  const off = await detectClaudeBackend({ env: { CLAUDE_CODE_USE_BEDROCK: "0" } });
  assert.equal(off.provider, "anthropic");
});
