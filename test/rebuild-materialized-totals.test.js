import test from "node:test";
import assert from "node:assert/strict";
import { buildTotalsSql } from "../scripts/rebuild-materialized-totals.mjs";

test("totals rebuild combines bounded legacy, daily and monthly sources", () => {
  const sql = buildTotalsSql({
    legacyCutoffDay: Math.floor(Date.UTC(2026, 5, 4) / 86_400_000),
    throughDay: Math.floor(Date.UTC(2026, 8, 2) / 86_400_000),
    updatedAt: "2026-09-02T00:00:00.000Z",
  });
  assert.match(sql, /b\.bucket >= 1978368/);
  assert.match(sql, /PARTITION BY d\.user_id, b\.bucket, b\.session_id, b\.harness, b\.model/);
  assert.match(sql, /FROM device_daily_usage daily JOIN devices/);
  assert.match(sql, /FROM user_monthly_usage monthly/);
  assert.match(sql, /INSERT INTO user_totals/);
  assert.match(sql, /ON CONFLICT \(user_id\) DO UPDATE/);
});
