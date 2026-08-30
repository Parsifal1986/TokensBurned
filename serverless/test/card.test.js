import test from "node:test";
import assert from "node:assert/strict";
import { normalizeCardOptions, renderServerCard } from "../src/card.js";

test("renders a safe dynamic profile card", () => {
  const svg = renderServerCard({
    day_tokens: 25_000,
    all_time_tokens: 2_500_000,
    week_tokens: 120_000,
    month_tokens: 500_000,
    month_requests: 42,
    by_harness: [{ key: "codex", tokens: 90_000 }, { key: "claude-code", tokens: 30_000 }],
    by_provider: [{ key: "openai", tokens: 120_000 }],
    by_model: [{ key: "model<&", tokens: 120_000 }],
    daily: Array.from({ length: 84 }, (_, index) => ({ date: `2026-08-${String(index + 1).padStart(2, "0")}`, tokens: index * 1000 })),
    hourly: Array.from({ length: 24 }, (_, hour) => ({ hour, tokens: hour * 1000 })),
    rank: 2,
    participants: 17,
    generated_at: "2026-08-30T12:00:00.000Z",
  }, "parsifal1986");
  assert.match(svg, /120\.0K/);
  assert.match(svg, /parsifal1986/);
  assert.match(svg, /model&lt;&amp;/);
  assert.match(svg, /#2 OF 17/);
  assert.match(svg, /DAILY HEAT/);
  assert.match(svg, /ACTIVE HOURS/);
  assert.match(svg, /SNAPSHOTS OVERRIDE/);
  assert.match(svg, /height="700"/);
  assert.doesNotMatch(svg, /class="track"/);
  assert.doesNotMatch(svg, /text-anchor/);
  assert.doesNotMatch(svg, /model<&/);
});

test("renders compact and meme variants without a heatmap", () => {
  const summary = {
    day_tokens: 25_000, week_tokens: 120_000, month_tokens: 500_000, all_time_tokens: 2_500_000,
    month_requests: 42, by_harness: [], by_provider: [], by_model: [], daily: [], hourly: [],
    rank: 2, participants: 17, generated_at: "2026-08-30T12:00:00.000Z",
  };
  const svg = renderServerCard(summary, "parsifal1986", { layout: "compact", meme: "1", compare: "0" });
  assert.match(svg, /width="680"/);
  assert.match(svg, /THIS IS FINE|LOAD-BEARING|ONE MORE PROMPT|PUBLICLY JUDGED/);
  assert.doesNotMatch(svg, /DAILY HEAT/);
  assert.doesNotMatch(svg, /HARNESSES \/ 30D/);
  assert.ok(Number(svg.match(/height="(\d+)"/)[1]) < 400);
});

test("normalizes public card options", () => {
  assert.deepEqual(normalizeCardOptions({ layout: "compact", heatmap: "1", compare: "0", rank: "false" }), {
    layout: "compact", heatmap: false, compare: false, meme: false, rank: false,
  });
});
