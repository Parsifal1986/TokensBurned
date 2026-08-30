import test from "node:test";
import assert from "node:assert/strict";
import { renderServerCard } from "../src/card.js";

test("renders a safe dynamic profile card", () => {
  const svg = renderServerCard({
    all_time_tokens: 2_500_000,
    week_tokens: 120_000,
    week_requests: 42,
    by_harness: [{ key: "codex", tokens: 90_000 }, { key: "claude-code", tokens: 30_000 }],
    by_provider: [],
    by_model: [{ key: "model<&", tokens: 120_000 }],
    generated_at: "2026-08-30T12:00:00.000Z",
  }, "parsifal1986");
  assert.match(svg, /120\.0K/);
  assert.match(svg, /parsifal1986/);
  assert.match(svg, /model&lt;&amp;/);
  assert.doesNotMatch(svg, /model<&/);
});

