import test from "node:test";
import assert from "node:assert/strict";
import { currentBucket, normalizeBatch } from "../src/protocol.js";

test("normalizes a revisioned usage snapshot", () => {
  const now = Date.UTC(2026, 7, 30, 12);
  const result = normalizeBatch({
    v: 1,
    entries: [{
      bucket: currentBucket(now),
      session: "session-hash",
      harness: "OpenCode",
      provider: "Anthropic",
      model: "claude-opus-4-1",
      revision: 3,
      input: 1200,
      output: 240,
      cache_read: 900,
      requests: 2,
    }],
  }, now);
  assert.deepEqual(result.entries[0], {
    bucket: currentBucket(now),
    session_id: "session-hash",
    harness: "opencode",
    provider: "anthropic",
    model: "claude-opus-4-1",
    revision: 3,
    input_tokens: 1200,
    output_tokens: 240,
    cache_read_tokens: 900,
    cache_write_tokens: 0,
    reasoning_tokens: 0,
    request_count: 2,
  });
});

test("rejects stale buckets and negative token counts", () => {
  const now = Date.UTC(2026, 7, 30, 12);
  assert.throws(() => normalizeBatch({
    v: 1,
    entries: [{
      bucket: currentBucket(now) - 96 * 91,
      session: "session",
      harness: "codex",
      revision: 1,
    }],
  }, now), /last 90 days/);
  assert.throws(() => normalizeBatch({
    v: 1,
    entries: [{
      bucket: currentBucket(now),
      session: "session",
      harness: "codex",
      revision: 1,
      input: -1,
    }],
  }, now), /input must be an integer/);
});

test("canonicalizes harness aliases and infers a missing provider from the model", () => {
  const now = Date.UTC(2026, 7, 30, 12);
  const result = normalizeBatch({
    v: 1,
    entries: [{
      bucket: currentBucket(now),
      session: "session",
      harness: "Google-Gemini-CLI",
      provider: "unknown",
      model: "google/gemini-2.5-pro",
      revision: 1,
      input: 100,
    }],
  }, now);
  assert.equal(result.entries[0].harness, "gemini-cli");
  assert.equal(result.entries[0].provider, "google");
  assert.equal(result.entries[0].model, "gemini-2.5-pro");
});
