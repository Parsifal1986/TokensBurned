import test from "node:test";
import assert from "node:assert/strict";
import { renderSvg, publicStats } from "../src/render.js";

const summary = {
  today: { total_tokens: 2_000_000 },
  week: {
    total_tokens: 12_000_000,
    by_harness: { "claude-code": 9_000_000, codex: 3_000_000 },
    by_provider: { deepseek: 7_000_000, unknown: 5_000_000 },
  },
  streak: 4,
  burn_score: 4321,
  level: "SPACE HEATER",
  meme: "model identity: trust me bro",
  most_used_stack: ["claude-code::deepseek::deepseek-v4", 7_000_000],
};

test("renders separate harness and backend labels", () => {
  const svg = renderSvg(summary);
  assert.match(svg, /HARNESS/);
  assert.match(svg, /BACKEND/);
  assert.match(svg, /Claude Code/);
  assert.match(svg, /DeepSeek/);
});

test("privacy mode omits provider output", () => {
  const svg = renderSvg(summary, { publishProvider: false });
  const json = publicStats(summary, { publishProvider: false });
  assert.doesNotMatch(svg, /BACKEND/);
  assert.equal(json.week.provider, undefined);
});
