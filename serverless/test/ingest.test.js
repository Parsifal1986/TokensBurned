import test from "node:test";
import assert from "node:assert/strict";
import { ingestBatch } from "../src/ingest.js";

function environment(changes = 1) {
  const statements = [];
  return {
    statements,
    DB: {
      prepare(sql) {
        return {
          bind(...params) {
            const statement = { sql, params };
            statements.push(statement);
            return statement;
          },
        };
      },
      async batch(batch) {
        return batch.map((_, index) => ({ meta: { changes: index === batch.length - 1 ? 1 : changes } }));
      },
    },
  };
}

function dailyPayload() {
  return {
    v: 2,
    days: [{
      day: "2026-08-30",
      revision: 12,
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
          cache_write_tokens: 0,
          reasoning_tokens: 5,
          request_count: 2,
        },
      },
      dimensions: {
        harness: { codex: { total_tokens: 155 } },
        provider: { openai: { total_tokens: 155 } },
        model: { "gpt-5": { total_tokens: 155 } },
      },
    }],
  };
}

test("v2 ingest writes one day row and reports actual changes", async () => {
  const env = environment(1);
  const result = await ingestBatch(env, { id: "device-1" }, dailyPayload(), Date.UTC(2026, 7, 30, 12));
  assert.equal(result.changed, 1);
  assert.equal(result.ignored, 0);
  assert.deepEqual(result.acked_days, [{ day: "2026-08-30", revision: 12 }]);
  assert.equal(env.statements.length, 2);
  assert.match(env.statements[0].sql, /INSERT INTO device_daily_usage/);
  assert.match(env.statements[0].sql, /excluded\.revision > device_daily_usage\.revision/);
  assert.match(env.statements[1].sql, /last_seen_at < \?/);
});

test("v2 ingest reports a stale revision as an ignored zero-write mutation", async () => {
  const env = environment(0);
  const result = await ingestBatch(env, { id: "device-1" }, dailyPayload(), Date.UTC(2026, 7, 30, 12));
  assert.equal(result.changed, 0);
  assert.equal(result.ignored, 1);
  assert.equal(result.next_flush_after, 3600);
});
