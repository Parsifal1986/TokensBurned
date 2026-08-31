import test from "node:test";
import assert from "node:assert/strict";
import { eventFromHookPayload, normalizeEvent, sanitizeHookPayload } from "../src/schema.js";

test("normalizes harness, backend confidence and usage aliases", () => {
  const event = normalizeEvent({
    timestamp: "2026-08-29T12:00:00Z",
    harness: { id: "Claude-Code", version: "2.1.0" },
    backend: {
      provider: "deepseek",
      reportedModel: "claude-opus",
      resolvedModel: "deepseek-v4",
      endpointType: "known-provider",
      confidence: "detected",
    },
    usage: { inputTokens: 100, outputTokens: 20, cacheReadTokens: 5 },
  });
  assert.equal(event.harness.id, "claude-code");
  assert.equal(event.backend.provider, "deepseek");
  assert.equal(event.backend.resolved_model, "deepseek-v4");
  assert.equal(event.usage.input_tokens, 100);
  assert.equal(event.usage.cache_read_tokens, 5);
  assert.ok(event.id);
});

test("unknown providers become custom instead of guessed", () => {
  const event = normalizeEvent({
    harness: { id: "codex" },
    backend: { provider: "private-router", confidence: "detected" },
    usage: { input_tokens: 1 },
  });
  assert.equal(event.backend.provider, "custom");
});

test("hook extraction copies only allow-listed usage and identity", () => {
  const event = eventFromHookPayload({
    prompt: "do not retain me",
    source_code: "secret",
    model: "some-model",
    usage: { input_tokens: 12, output_tokens: 3 },
  }, "codex", {
    provider: "unknown",
    endpoint_type: "unknown",
    confidence: "unknown",
  });
  assert.equal(event.backend.confidence, "reported");
  assert.equal(event.usage.input_tokens, 12);
  assert.equal("prompt" in event, false);
  assert.equal(JSON.stringify(event).includes("do not retain me"), false);
  assert.equal(JSON.stringify(event).includes("secret"), false);
});

test("rejects zero-token events", () => {
  assert.throws(() => normalizeEvent({ harness: { id: "codex" }, usage: {} }), /no token/i);
});

test("hook launcher sanitizes raw payloads before crossing the process boundary", () => {
  const sanitized = sanitizeHookPayload({
    prompt: "private prompt",
    response: { text: "private response", usage: { input_tokens: 12 } },
    source_code: "private source",
    transcript_path: "/allowed/by-child-boundary/session.jsonl",
    model: "gpt-test",
  });
  assert.deepEqual(sanitized.usage, {
    input_tokens: 12,
    output_tokens: 0,
    cache_read_tokens: 0,
    cache_write_tokens: 0,
  });
  assert.equal(sanitized.model, "gpt-test");
  assert.equal(sanitized.transcript_path, "/allowed/by-child-boundary/session.jsonl");
  assert.doesNotMatch(JSON.stringify(sanitized), /private prompt|private response|private source/);
});
