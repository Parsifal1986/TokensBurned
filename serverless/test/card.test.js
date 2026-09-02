import test from "node:test";
import assert from "node:assert/strict";
import {
  cardObjectKey,
  deleteUserCards,
  normalizeCardOptions,
  renderServerCard,
  resolveCardVariant,
} from "../src/card.js";

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
  assert.match(svg, /data-card-theme="dark"/);
  assert.match(svg, /prefers-color-scheme:light/);
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
  assert.deepEqual(normalizeCardOptions({ layout: "compact", heatmap: "1", compare: "0", rank: "false", theme: "light" }), {
    layout: "compact", heatmap: false, compare: false, meme: false, rank: false, theme: "light",
  });
  assert.equal(normalizeCardOptions({ theme: "auto" }).theme, "auto");
  assert.equal(normalizeCardOptions({ theme: "invalid" }).theme, "dark");
});

test("normalizes equivalent card requests to one policy-aware R2 variant", () => {
  const policy = {
    public_card: 1,
    publish_harness: 1,
    publish_provider: 0,
    publish_model: 1,
    publish_heatmap: 1,
    publish_rank: 0,
  };
  const first = resolveCardVariant({
    rank: "true", theme: "light", heatmap: "1", layout: "compact", unknown: "ignored",
  }, policy);
  const second = resolveCardVariant({
    layout: "compact", heatmap: "0", rank: "0", theme: "light",
  }, policy);
  assert.equal(first.key, second.key);
  assert.equal(first.options.heatmap, false);
  assert.equal(first.options.rank, false);
  assert.equal(
    cardObjectKey("octocat", first.options, first.policy),
    `u/octocat/${first.key}.svg`,
  );
  const morePublic = resolveCardVariant(first.options, { ...policy, publish_provider: 1 });
  assert.notEqual(first.key, morePublic.key);
});

test("deletes legacy and paginated per-user card variants", async () => {
  const deleted = [];
  const cursors = [];
  const env = {
    CARDS: {
      async list(options) {
        cursors.push(options.cursor || null);
        return options.cursor
          ? { objects: [{ key: "u/octocat/v1-c.svg" }], truncated: false }
          : {
              objects: [{ key: "u/octocat/v1-a.svg" }, { key: "u/octocat/v1-b.svg" }],
              truncated: true,
              cursor: "next",
            };
      },
      async delete(keys) {
        deleted.push(...(Array.isArray(keys) ? keys : [keys]));
      },
    },
  };
  await deleteUserCards(env, "octocat");
  assert.deepEqual(cursors, [null, "next"]);
  assert.deepEqual(deleted, [
    "u/octocat.svg",
    "u/octocat/v1-a.svg",
    "u/octocat/v1-b.svg",
    "u/octocat/v1-c.svg",
  ]);
});

test("server policy prevents query parameters from increasing public disclosure", () => {
  const summary = {
    day_tokens: 25_000, week_tokens: 120_000, month_tokens: 500_000, all_time_tokens: 2_500_000,
    month_requests: 42,
    by_harness: [{ key: "codex", tokens: 120_000 }],
    by_provider: [{ key: "private-provider", tokens: 120_000 }],
    by_model: [{ key: "private-model", tokens: 120_000 }],
    daily: [{ date: "2026-08-30", tokens: 120_000 }],
    hourly: [{ hour: 2, tokens: 120_000 }],
    rank: 1, participants: 2, generated_at: "2026-08-30T12:00:00.000Z",
  };
  const variant = resolveCardVariant({ heatmap: "1", compare: "1", rank: "1" }, {
    public_card: 1,
    publish_harness: 0,
    publish_provider: 0,
    publish_model: 0,
    publish_heatmap: 0,
    publish_rank: 0,
  });
  const svg = renderServerCard(summary, "owner", variant.options, variant.policy);
  assert.doesNotMatch(svg, /DAILY HEAT|ACTIVE HOURS|HARNESSES|PROVIDERS|MODELS|private-|#1 OF 2/);
  assert.match(svg, /120\.0K/);
});
