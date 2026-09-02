import test from "node:test";
import assert from "node:assert/strict";
import { buildRankingSql } from "../scripts/materialize-rankings.mjs";

test("ranking publication reads totals once and upserts materialized rows", () => {
  const sql = buildRankingSql("2026-09-01T00:00:00.000Z");
  assert.match(sql, /FROM user_totals/);
  assert.match(sql, /RANK\(\) OVER \(ORDER BY total_tokens DESC\)/);
  assert.match(sql, /COUNT\(\*\) OVER \(\)/);
  assert.match(sql, /ON CONFLICT \(user_id\) DO UPDATE/);
  assert.doesNotMatch(sql, /usage_buckets|usage_events|device_daily_usage/);
});
