import test from "node:test";
import assert from "node:assert/strict";
import { summarizeUser, summaryInternals } from "../src/summary.js";

test("a fresh summary cache hit reads exactly one row", async () => {
  const now = Date.UTC(2026, 7, 30, 12);
  const expected = { all_time_tokens: 123, generated_at: new Date(now - 1_000).toISOString() };
  let prepares = 0;
  const statement = {
    bind() { return this; },
    async first() {
      return {
        summary_json: JSON.stringify({ cache_version: 2, summary: expected }),
        generated_at: expected.generated_at,
      };
    },
  };
  const env = {
    DB: {
      prepare(sql) {
        prepares += 1;
        assert.match(sql, /FROM user_summaries/);
        return statement;
      },
    },
  };

  const state = {};
  assert.deepEqual(await summarizeUser(env, "usr_test", now, state), expected);
  assert.equal(state.cache, "hit");
  assert.equal(prepares, 1);
});

test("daily envelopes provide exact totals, dimensions, heatmap and active hours", () => {
  const now = Date.UTC(2026, 7, 30, 12);
  const today = Math.floor(now / 86_400_000);
  const bounds = summaryInternals.boundsFor(now);
  const accumulator = summaryInternals.emptyAccumulator();
  summaryInternals.addDailyRows(accumulator, [{
    day: today,
    input_tokens: 100,
    output_tokens: 20,
    cache_read_tokens: 30,
    cache_write_tokens: 0,
    reasoning_tokens: 5,
    request_count: 2,
    hours_json: JSON.stringify({
      "08": {
        input_tokens: 100,
        output_tokens: 20,
        cache_read_tokens: 30,
        cache_write_tokens: 0,
        reasoning_tokens: 5,
        request_count: 2,
      },
    }),
    dimensions_json: JSON.stringify({
      harness: { codex: { total_tokens: 155 } },
      provider: { openai: { total_tokens: 155 } },
      model: { "gpt-5.6-sol": { total_tokens: 155 } },
    }),
  }], bounds);
  assert.equal(accumulator.allTime, 155);
  assert.equal(accumulator.day, 155);
  assert.equal(accumulator.week, 155);
  assert.equal(accumulator.month, 155);
  assert.equal(accumulator.monthRequests, 2);
  assert.equal(accumulator.daily[today], 155);
  assert.equal(accumulator.hourly[8], 155);
  assert.equal(accumulator.dimensions.model["gpt-5.6-sol"], 155);
});

test("legacy rows preserve rolling bucket windows and cross-device snapshot semantics", () => {
  const now = Date.UTC(2026, 7, 30, 12);
  const bounds = summaryInternals.boundsFor(now);
  const accumulator = summaryInternals.emptyAccumulator();
  const inside = bounds.bucket.dayStart;
  const outside = inside - 1;
  const row = (bucket, input_tokens) => ({
    bucket,
    harness: "codex",
    provider: "openai",
    model: "gpt-5.6-sol",
    input_tokens,
    output_tokens: 0,
    cache_read_tokens: 0,
    cache_write_tokens: 0,
    reasoning_tokens: 0,
    request_count: 1,
  });

  summaryInternals.addLegacyRows(accumulator, [row(outside, 10), row(inside, 20)], bounds);
  assert.equal(accumulator.allTime, 30);
  assert.equal(accumulator.day, 20);
  assert.equal(accumulator.week, 30);
  assert.equal(accumulator.month, 30);
  assert.equal(accumulator.weekRequests, 2);
  assert.match(
    summaryInternals.legacySql,
    /PARTITION BY b\.bucket, b\.session_id, b\.harness, b\.model/,
  );
  assert.doesNotMatch(summaryInternals.legacySql, /PARTITION BY b\.device_id/);
});
