import test from "node:test";
import assert from "node:assert/strict";
import { buildLegacyMonthlySql } from "../scripts/backfill-legacy-d1.mjs";

test("legacy backfill is month-bounded, device-safe and idempotent", () => {
  const cutoffDay = Math.floor(Date.UTC(2026, 7, 15) / 86_400_000);
  const sql = buildLegacyMonthlySql({
    year: 2026,
    month: 8,
    cutoffDay,
    updatedAt: "2026-09-01T00:00:00.000Z",
  });

  assert.match(sql, /b\.bucket >= 1983936 AND b\.bucket < 1985280/);
  assert.match(sql, /PARTITION BY b\.device_id, b\.bucket/);
  assert.match(sql, /snapshot\.device_id = event\.device_id/);
  assert.match(sql, /ON CONFLICT \(user_id, month\) DO NOTHING/);
  assert.match(sql, /'harness', json\(/);
});

test("legacy backfill skips months entirely after the cutoff", () => {
  const cutoffDay = Math.floor(Date.UTC(2026, 7, 1) / 86_400_000);
  assert.equal(buildLegacyMonthlySql({
    year: 2026,
    month: 9,
    cutoffDay,
    updatedAt: "2026-09-01T00:00:00.000Z",
  }), null);
});
