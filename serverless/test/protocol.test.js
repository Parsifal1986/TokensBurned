import test from "node:test";
import assert from "node:assert/strict";
import {
  currentBucket,
  normalizeBatch,
  normalizeDailyBatch,
} from "../src/protocol.js";

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

test("normalizes an exact device/day envelope", () => {
  const now = Date.UTC(2026, 7, 30, 12);
  const result = normalizeDailyBatch({
    v: 2,
    days: [{
      day: "2026-08-30",
      revision: 7,
      input_tokens: 100,
      output_tokens: 20,
      cache_read_tokens: 30,
      cache_write_tokens: 0,
      reasoning_tokens: 5,
      request_count: 2,
      hours: {
        "08": {
          input_tokens: 100,
          output_tokens: 20,
          cache_read_tokens: 30,
          reasoning_tokens: 5,
          request_count: 2,
        },
      },
      dimensions: {
        harness: { "OpenAI-Codex": { total_tokens: 155 } },
        provider: { unknown: { total_tokens: 155 } },
        model: { "openai/gpt-5.6-sol": { total_tokens: 155 } },
      },
    }],
  }, now);
  assert.equal(result.days[0].day_key, "2026-08-30");
  assert.equal(result.days[0].day, Math.floor(now / 86_400_000));
  assert.deepEqual(result.days[0].dimensions, {
    harness: { codex: { total_tokens: 155 } },
    provider: { unknown: { total_tokens: 155 } },
    model: { "gpt-5.6-sol": { total_tokens: 155 } },
  });
});

test("rejects daily envelopes whose hours or dimensions disagree with exact totals", () => {
  const now = Date.UTC(2026, 7, 30, 12);
  const base = {
    day: "2026-08-30",
    revision: 1,
    input_tokens: 100,
    request_count: 1,
    hours: { "12": { input_tokens: 99, request_count: 1 } },
    dimensions: {
      harness: { codex: { total_tokens: 100 } },
      provider: { openai: { total_tokens: 100 } },
      model: { "gpt-5": { total_tokens: 100 } },
    },
  };
  assert.throws(
    () => normalizeDailyBatch({ v: 2, days: [base] }, now),
    /hours must sum to the exact day counters/,
  );
  assert.throws(
    () => normalizeDailyBatch({
      v: 2,
      days: [{
        ...base,
        hours: { "12": { input_tokens: 100, request_count: 1 } },
        dimensions: { ...base.dimensions, model: { "gpt-5": { total_tokens: 99 } } },
      }],
    }, now),
    /dimensions.model must sum to the exact day token total/,
  );
  assert.throws(
    () => normalizeDailyBatch({ v: 2, days: [{ ...base, day: "2026-02-31" }] }, now),
    /day must be an integer/,
  );
});
