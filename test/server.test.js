import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import {
  fetchClientRelease,
  pollDeviceAuthorization,
  startDeviceAuthorization,
  uploadDailyEnvelopes,
  uploadEntries,
  serverInternals,
} from "../src/server.js";

function response(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("API origin rejects remote plaintext URLs and supports IPv6 loopback", () => {
  assert.throws(() => serverInternals.origin("http://api.example"), /HTTPS/);
  assert.throws(() => serverInternals.origin("http://localhost.example"), /HTTPS/);
  assert.throws(() => serverInternals.origin("file:///tmp/api"), /HTTPS/);
  assert.equal(serverInternals.origin("http://[::1]:4173"), "http://[::1]:4173");
});

test("a credential bound to one API cannot be sent using another server's configuration", async () => {
  let requests = 0;
  const options = {
    apiOrigin: "https://other.example", credentialApiOrigin: "https://original.example",
    token: "private-fixture", fetchImpl: async () => { requests += 1; return response({}); },
  };
  await assert.rejects(() => serverInternals.request("/v1/me/summary", options), /different API origin/);
  assert.equal(requests, 0);
  await serverInternals.request("/v1/me/summary", { ...options, apiOrigin: "https://original.example/" });
  assert.equal(requests, 1);
});

test("real HTTP redirects cannot forward device codes, usage, or proofs", async (t) => {
  let redirectedRequests = 0;
  const sink = http.createServer((_request, res) => {
    redirectedRequests += 1;
    res.end("{}");
  });
  sink.listen(0, "127.0.0.1");
  await once(sink, "listening");
  t.after(() => { sink.closeAllConnections(); sink.close(); });
  let redirectStatus = 307;
  const source = http.createServer((_request, res) => {
    res.writeHead(redirectStatus, { location: `http://127.0.0.1:${sink.address().port}/sink` }).end();
  });
  source.listen(0, "127.0.0.1");
  await once(source, "listening");
  t.after(() => { source.closeAllConnections(); source.close(); });
  for (const status of [301, 302, 303, 307, 308]) {
    redirectStatus = status;
    await assert.rejects(() => pollDeviceAuthorization("private-device-code", {
      apiOrigin: `http://127.0.0.1:${source.address().port}`,
    }), /server is unavailable/);
  }
  assert.equal(redirectedRequests, 0);
});

test("device flow registers a per-device public key and signs polling", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return calls.length === 1
      ? response({ device_code: "opaque", verification_uri_complete: "https://example.test/connect" }, 201)
      : response({ status: "authorization_pending" }, 202);
  };
  const authorization = await startDeviceAuthorization({
    apiOrigin: "https://api.example",
    deviceName: "Codex",
    fetchImpl,
  });
  await pollDeviceAuthorization("opaque", {
    apiOrigin: "https://api.example",
    fetchImpl,
    devicePrivateKeyJwk: authorization.device_proof_keys.privateKeyJwk,
  });
  assert.equal(calls[0].body.device_name, "Codex");
  assert.equal(calls[0].init.headers["X-TokensBurned-Client-Version"], "0.6.3");
  assert.deepEqual(Object.keys(calls[0].body.public_key_jwk).sort(), ["crv", "kty", "x", "y"]);
  assert.deepEqual(calls[1].body, { device_code: "opaque" });
  assert.match(calls[1].init.headers["X-TokensBurned-Timestamp"], /^\d{10}$/);
  assert.match(calls[1].init.headers["X-TokensBurned-Proof"], /^[A-Za-z0-9_-]{80,96}$/);
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
  assert.equal(calls[0].init.headers["X-TokensBurned-Client-Version"], "0.6.3");
});

test("reconnect polling sends only the old device ID and requires an explicit reuse result", async () => {
  const previousDeviceId = "previous_device";
  const token = `tb_live_${previousDeviceId}.${"s".repeat(43)}`;
  let sent;
  const options = {
    apiOrigin: "https://api.example", previousDeviceId,
    fetchImpl: async (_url, init) => {
      sent = JSON.parse(init.body);
      return response({ status: "authorized", token, device_reused: true });
    },
  };
  await pollDeviceAuthorization("opaque", options);
  assert.deepEqual(sent, { device_code: "opaque", previous_device_id: previousDeviceId });
  await assert.rejects(() => pollDeviceAuthorization("opaque", {
    ...options, fetchImpl: async () => response({ status: "authorized", token }),
  }), /does not support safe device reconnection/);
  await assert.rejects(() => pollDeviceAuthorization("opaque", {
    ...options, fetchImpl: async () => response({ status: "authorized", token: `tb_live_other_device.${"s".repeat(43)}`, device_reused: true }),
  }), /inconsistent device identity/);
  const newAccount = await pollDeviceAuthorization("opaque", {
    ...options, fetchImpl: async () => response({ status: "authorized", token: `tb_live_other_device.${"s".repeat(43)}`, device_reused: false }),
  });
  assert.equal(newAccount.device_reused, false);
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


test("connection failures preserve structured cooldown and retry information", async () => {
  const { serverInternals } = await import("../src/server.js");
  const retryAt = "2026-09-05T00:00:00.000Z";
  for (const [status, code, metadata] of [
    [429, "connect_rate_limited", { retry_at: retryAt }],
    [409, "device_limit_reached", { next_slot_at: retryAt }],
  ]) {
    await assert.rejects(() => serverInternals.request("/v1/auth/device/status", {
      apiOrigin: "https://api.example.test",
      fetchImpl: async () => new Response(JSON.stringify({ error: { code, message: "Wait before connecting", ...metadata } }), { status }),
    }), (error) => error.status === status && error.code === code
      && error[Object.keys(metadata)[0]] === retryAt);
  }
});
