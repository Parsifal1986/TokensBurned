import test from "node:test";
import assert from "node:assert/strict";
import { compactionInternals } from "../src/compaction.js";

test("compaction maps UTC days to stable month keys and merges dimensions", () => {
  assert.equal(
    compactionInternals.monthForDay(Math.floor(Date.UTC(2026, 7, 30) / 86_400_000)),
    202608,
  );
  const dimensions = { harness: {}, provider: {}, model: {} };
  compactionInternals.mergeDimensions(dimensions, {
    harness: { codex: { total_tokens: 100 } },
    provider: { openai: { total_tokens: 100 } },
    model: { "gpt-5": { total_tokens: 100 } },
  });
  compactionInternals.mergeDimensions(dimensions, {
    harness: { codex: { total_tokens: 50 } },
    provider: { openai: { total_tokens: 50 } },
    model: { "gpt-5": { total_tokens: 50 } },
  });
  assert.deepEqual(dimensions.model, { "gpt-5": { total_tokens: 150 } });
});
