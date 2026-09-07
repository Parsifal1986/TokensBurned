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
  assert.match(second, /codex plugin add/, "the cached release keeps reminding until the install is updated");
  assert.equal(requests, 1, "but the endpoint is asked at most once per day");

  config.updates.latest_version = "0.0.1";
  const upToDate = await sessionStartContext({ ...dependencies, now: dependencies.now + 120_000 });
  assert.doesNotMatch(upToDate, /codex plugin add/);
  assert.equal(requests, 1);
});

test("the not-connected reminder stops after three sessions and is persisted in config (B5)", async () => {
  const config = { server: { api_origin: "https://api.example" }, updates: {}, onboarding: { connect_notices: 0 } };
  const writes = [];
  const dependencies = {
    env: { TOKENSBURNED_DISABLE_UPDATE_CHECK: "1" },
    readConfigImpl: async () => config,
    readCredentialsImpl: async () => ({ version: 1, device_token: null }),
    writeConfigImpl: async (value) => { writes.push(JSON.parse(JSON.stringify(value))); },
  };
  for (let session = 1; session <= 3; session += 1) {
    assert.match(await sessionStartContext(dependencies), /not connected/, `session ${session} reminds`);
    assert.equal(config.onboarding.connect_notices, session);
  }
  assert.equal(await sessionStartContext(dependencies), "", "the fourth session stays quiet");
  assert.equal(await sessionStartContext(dependencies), "");
  assert.equal(writes.length, 3, "only sessions that showed the reminder wrote config");
  assert.equal(writes.at(-1).onboarding.connect_notices, 3);

  // A stored config without the field (upgraded install) starts counting from zero.
  const legacy = { server: {}, updates: {} };
  assert.match(await sessionStartContext({ ...dependencies, readConfigImpl: async () => legacy }), /not connected/);
  assert.equal(legacy.onboarding.connect_notices, 1);

  // A connected install never counts or reminds.
  const connected = { server: {}, updates: {}, onboarding: { connect_notices: 0 } };
  assert.equal(await sessionStartContext({
    ...dependencies,
    readConfigImpl: async () => connected,
    readCredentialsImpl: async () => ({ version: 2, device_token: "tb_live_device.secret" }),
  }), "");
  assert.equal(connected.onboarding.connect_notices, 0);
});
