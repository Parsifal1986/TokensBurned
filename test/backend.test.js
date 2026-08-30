import test from "node:test";
import assert from "node:assert/strict";
import { classifyEndpoint } from "../src/backend.js";

test("detects known providers from endpoint hostname", () => {
  const result = classifyEndpoint("https://api.deepseek.com/v1", "deepseek-v4");
  assert.equal(result.provider, "deepseek");
  assert.equal(result.confidence, "detected");
  assert.equal(result.endpoint_type, "known-provider");
});

test("does not guess provider without an endpoint", () => {
  const result = classifyEndpoint(undefined, "claude-opus-4-1");
  assert.equal(result.provider, "unknown");
  assert.equal(result.confidence, "reported");
  assert.equal(result.resolved_model, undefined);
});

test("classifies private gateways as custom without retaining the endpoint", () => {
  const result = classifyEndpoint("https://llm.internal.example/v1", "gpt-whatever");
  assert.deepEqual(result, {
    provider: "custom",
    reported_model: "gpt-whatever",
    resolved_model: undefined,
    endpoint_type: "custom",
    confidence: "reported",
  });
  assert.equal(JSON.stringify(result).includes("internal.example"), false);
});
