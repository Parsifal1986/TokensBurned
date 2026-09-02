import test from "node:test";
import assert from "node:assert/strict";
import {
  fetchClientRelease,
  pollDeviceAuthorization,
  startDeviceAuthorization,
  uploadDailyEnvelopes,
  uploadEntries,
} from "../src/server.js";

function response(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("device flow sends only the device name and opaque device code", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return calls.length === 1
      ? response({ device_code: "opaque", verification_uri_complete: "https://example.test/connect" }, 201)
      : response({ status: "authorization_pending" }, 202);
  };
  await startDeviceAuthorization({ apiOrigin: "https://api.example", deviceName: "Codex", fetchImpl });
  await pollDeviceAuthorization("opaque", { apiOrigin: "https://api.example", fetchImpl });
  assert.deepEqual(calls.map((call) => call.body), [
    { device_name: "Codex" },
    { device_code: "opaque" },
  ]);
});

test("client release check uses the public version endpoint", async () => {
  const calls = [];
  const release = await fetchClientRelease({
    apiOrigin: "https://api.example",
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return response({ latest_version: "0.5.0", minimum_supported_version: "0.4.0" });
    },
  });
  assert.equal(release.latest_version, "0.5.0");
  assert.equal(calls[0].url, "https://api.example/v1/client/version");
  assert.equal(calls[0].init.method, "GET");
});

test("batch uploader chunks entries and keeps the bearer token out of payloads", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return response({ accepted: calls.at(-1).body.entries.length });
  };
  const entries = Array.from({ length: 205 }, (_, bucket) => ({ bucket }));
  const result = await uploadEntries(entries, {
    apiOrigin: "https://api.example",
    token: "tb_live_secret",
    fetchImpl,
  });
  assert.equal(result.accepted, 205);
  assert.deepEqual(calls.map((call) => call.body.entries.length), [100, 100, 5]);
  assert.ok(calls.every((call) => call.init.headers.Authorization === "Bearer tb_live_secret"));
  assert.ok(calls.every((call) => !JSON.stringify(call.body).includes("tb_live_secret")));
});

test("daily uploader sends v2 envelopes and preserves acknowledgements", async () => {
  const calls = [];
  const days = Array.from({ length: 21 }, (_, index) => ({
    day: `2026-08-${String(index + 1).padStart(2, "0")}`,
    revision: 1,
  }));
  const result = await uploadDailyEnvelopes(days, {
    apiOrigin: "https://api.example",
    token: "tb_live_secret",
    fetchImpl: async (url, init) => {
      const body = JSON.parse(init.body);
      calls.push({ url, init, body });
      return response({
        accepted: body.days.length,
        received: body.days.length,
        changed: body.days.length,
        ignored: 0,
        acked_days: body.days.map((day) => ({ day: day.day, revision: day.revision })),
      });
    },
  });
  assert.deepEqual(calls.map((call) => call.body.days.length), [20, 1]);
  assert.ok(calls.every((call) => call.body.v === 2));
  assert.equal(result.accepted, 21);
  assert.equal(result.acked_days.length, 21);
});
