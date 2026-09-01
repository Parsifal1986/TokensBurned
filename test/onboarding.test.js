import test from "node:test";
import assert from "node:assert/strict";
import { sessionStartContext } from "../src/onboarding.js";

test("SessionStart checks once per day and prompts without updating silently", async () => {
  let requests = 0;
  const fetchImpl = async () => {
    requests += 1;
    return new Response(JSON.stringify({
      latest_version: "9.0.0",
      minimum_supported_version: "0.4.0",
      update_url: "https://example.test/update",
    }), { status: 200 });
  };
  const config = { server: { api_origin: "https://api.example" }, updates: {} };
  const env = {
    CODEX_PLUGIN_ROOT: "/plugin",
  };
  const dependencies = {
    env,
    now: Date.parse("2026-09-01T12:00:00.000Z"),
    fetchImpl,
    readConfigImpl: async () => config,
    readCredentialsImpl: async () => ({ version: 1, device_token: null }),
    writeConfigImpl: async () => {},
  };

  const first = await sessionStartContext(dependencies);
  assert.match(first, /not connected/);
  assert.match(first, /codex plugin add tokensburned@tokensburned/);
  assert.match(first, /Do not update silently/);

  const second = await sessionStartContext({ ...dependencies, now: dependencies.now + 60_000 });
  assert.match(second, /not connected/);
  assert.doesNotMatch(second, /codex plugin add/);
  assert.equal(requests, 1);
});
