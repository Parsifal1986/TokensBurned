import test from "node:test";
import assert from "node:assert/strict";
import { d1Meta, logMetric } from "../src/metrics.js";

test("D1 metadata is aggregated without user identifiers", () => {
  assert.deepEqual(d1Meta([
    { meta: { rows_read: 2, rows_written: 1, changes: 1 } },
    { meta: { rows_read: 3, rows_written: 0, changes: 0 } },
  ]), { rows_read: 5, rows_written: 1, changes: 1 });
});

test("structured metrics are disabled unless explicitly configured", () => {
  const original = console.log;
  const messages = [];
  console.log = (message) => messages.push(message);
  try {
    logMetric({}, "summary", { cache: "hit" });
    logMetric({ OBSERVABILITY_LOGS: "true" }, "summary", { cache: "hit" });
  } finally {
    console.log = original;
  }
  assert.equal(messages.length, 1);
  assert.deepEqual(JSON.parse(messages[0]), {
    service: "tokensburned-api",
    event: "summary",
    cache: "hit",
  });
});
