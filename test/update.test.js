import test from "node:test";
import assert from "node:assert/strict";
import {
  checkForUpdate,
  compareVersions,
  pluginUpdateCommand,
  updateCheckDue,
  updateNotice,
  updatePrompt,
} from "../src/update.js";

test("semantic version checks distinguish optional and required updates", () => {
  assert.equal(compareVersions("0.4.0", "0.4.1"), -1);
  assert.equal(compareVersions("0.4.1+codex.local", "0.4.1"), 0);
  assert.match(updateNotice({ latest_version: "0.5.0", minimum_supported_version: "0.4.0" }, "0.4.1"), /available/);
  assert.match(updateNotice({ latest_version: "1.0.0", minimum_supported_version: "0.5.0" }, "0.4.1"), /no longer supported/);
  assert.equal(updateNotice({ latest_version: "0.4.1", minimum_supported_version: "0.4.0" }, "0.4.1"), null);
});

test("update guidance uses the active harness plugin manager", () => {
  const release = { latest_version: "0.5.0", minimum_supported_version: "0.4.0" };
  assert.equal(pluginUpdateCommand("codex"), "codex plugin add tokensburned@tokensburned");
  assert.equal(pluginUpdateCommand("claude-code"), "claude plugin update tokensburned@tokensburned");
  assert.equal(pluginUpdateCommand("gemini"), null);
  assert.match(updatePrompt(release, { currentVersion: "0.4.1", harness: "codex" }), /Do not update silently/);
  assert.match(updatePrompt(release, { currentVersion: "0.4.1", harness: "claude-code" }), /start a new session/);
  assert.equal(updatePrompt(release, { currentVersion: "0.5.0", harness: "codex" }), null);
});

test("update checks are throttled and persist release metadata", async () => {
  const now = Date.parse("2026-09-01T12:00:00.000Z");
  const config = { server: { api_origin: "https://api.example" }, updates: {} };
  const result = await checkForUpdate(config, {
    currentVersion: "0.4.0",
    now,
    fetchImpl: async () => new Response(JSON.stringify({
      latest_version: "0.4.1",
      minimum_supported_version: "0.4.0",
      update_url: "https://example.test/update",
    }), { status: 200 }),
  });
  assert.equal(result.checked, true);
  assert.match(result.notice, /0\.4\.1 is available/);
  assert.equal(config.updates.last_checked_at, "2026-09-01T12:00:00.000Z");
  assert.equal(config.updates.update_url, "https://example.test/update");
  assert.equal(updateCheckDue(config.updates.last_checked_at, now + 60_000), false);

  const throttled = await checkForUpdate(config, { now: now + 60_000 });
  assert.equal(throttled.checked, false);
});
