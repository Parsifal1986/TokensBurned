import test from "node:test";
import assert from "node:assert/strict";
import { addEvent, summarize } from "../src/aggregate.js";
import { emptyStats } from "../src/storage.js";
import { normalizeEvent } from "../src/schema.js";

function event({ id, timestamp, harness = "codex", provider = "unknown", tokens }) {
  return normalizeEvent({
    id,
    timestamp,
    harness: { id: harness },
    backend: { provider, confidence: provider === "unknown" ? "unknown" : "detected" },
    usage: { input_tokens: tokens },
  });
}

test("aggregates dimensions without attributing unknown backends", () => {
  const stats = emptyStats(new Date("2026-08-28T00:00:00Z"));
  addEvent(stats, event({ id: "a", timestamp: "2026-08-28T12:00:00Z", tokens: 100 }));
  addEvent(stats, event({ id: "b", timestamp: "2026-08-29T12:00:00Z", harness: "claude-code", provider: "deepseek", tokens: 300 }));
  const summary = summarize(stats, new Date("2026-08-29T20:00:00"));
  assert.equal(summary.week.total_tokens, 400);
  assert.equal(summary.week.by_harness.codex, 100);
  assert.equal(summary.week.by_provider.unknown, 100);
  assert.equal(summary.week.by_provider.deepseek, 300);
  assert.equal(summary.streak, 2);
});

test("deduplicates event ids", () => {
  const stats = emptyStats();
  const usage = event({ id: "same", timestamp: new Date().toISOString(), tokens: 10 });
  assert.equal(addEvent(stats, usage), true);
  assert.equal(addEvent(stats, usage), false);
});
