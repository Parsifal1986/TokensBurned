import test from "node:test";
import assert from "node:assert/strict";
import { authenticate } from "../src/auth.js";
import { hashDeviceSecret } from "../src/crypto.js";
import { HttpError } from "../src/http.js";
import {
  approveDeviceAuthorization,
  deviceVerificationPage,
  pollDeviceAuthorization,
  startDeviceAuthorization,
  verifyDeviceAuthorization,
} from "../src/oauth.js";
import { updatePrivacy } from "../src/privacy.js";
import { enforceRateLimit } from "../src/rate-limit.js";

function statement(first, run = async () => ({ meta: { changes: 1 } })) {
  return {
    bind(...params) {
      return {
        first: () => first(params),
        run: () => run(params),
      };
    },
  };
}

test("device verification works without persistent browser cookies", async () => {
  const writes = [];
  let expectedConfirmationHash = null;
  const env = {
    API_ORIGIN: "https://api.example",
    GITHUB_CLIENT_ID: "client-id",
    TOKEN_PEPPER: "pepper",
    DB: {
      prepare(sql) {
        if (sql.includes("SELECT id, user_code, device_name")) {
          return statement(async () => ({ id: "auth_1", user_code: "ABCD-2345", device_name: "My laptop" }));
        }
        if (sql.includes("SELECT id FROM device_authorizations")) {
          return statement(async (params) => (
            params[1] === expectedConfirmationHash ? { id: "auth_1" } : null
          ));
        }
        return statement(async () => null, async (params) => {
          if (sql.includes("SET confirmation_hash = ?")) {
            [expectedConfirmationHash] = params;
          }
          writes.push({ sql, params });
          return { meta: { changes: 1 } };
        });
      },
    },
  };
  const landing = deviceVerificationPage();
  assert.match(await landing.text(), /Enter the code shown/);
  assert.equal(landing.headers.get("Referrer-Policy"), "no-referrer");

  const verified = await verifyDeviceAuthorization(new Request("https://api.example/v1/auth/device/verify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "user_code=abcd-2345",
  }), env);
  const cookie = verified.headers.get("set-cookie");
  assert.match(cookie, /Secure; HttpOnly; SameSite=Strict/);
  const verificationHtml = await verified.text();
  assert.match(verificationHtml, /My laptop/);
  const confirmation = verificationHtml.match(/name="confirmation" value="([^"]+)"/)?.[1];
  assert.ok(confirmation);
  assert.ok(writes.some(({ sql }) => sql.includes("confirmation_hash")));

  await assert.rejects(
    () => approveDeviceAuthorization(new Request("https://api.example/v1/auth/device/approve", {
      method: "POST",
      body: "user_code=ABCD-2345",
    }), env),
    (error) => error instanceof HttpError && error.code === "invalid_confirmation",
  );

  const approved = await approveDeviceAuthorization(new Request("https://api.example/v1/auth/device/approve", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ user_code: "ABCD-2345", confirmation }),
  }), env);
  assert.equal(approved.status, 302);
  assert.equal(new URL(approved.headers.get("location")).hostname, "github.com");
  assert.match(approved.headers.get("set-cookie"), /Max-Age=0/);
});

test("device start returns no auto-authorizing URL and authorization can be claimed only once", async () => {
  const state = { authorization: null, deviceId: null };
  const env = {
    API_ORIGIN: "https://api.example",
    TOKEN_PEPPER: "pepper",
    DB: {
      prepare(sql) {
        if (sql.includes("INSERT INTO device_authorizations")) {
          return statement(async () => null, async (params) => {
            state.authorization = {
              id: params[0],
              device_code_hash: params[1],
              user_code: params[2],
              device_name: params[3],
              expires_at: params[5],
              status: "authorized",
              user_id: "usr_1",
              github_login: "octocat",
              public_slug: "octocat",
              claimed_at: null,
              device_id: null,
            };
            return { meta: { changes: 1 } };
          });
        }
        if (sql.includes("SELECT a.*")) return statement(async () => ({ ...state.authorization }));
        if (sql.includes("SET status = 'claiming'")) {
          return statement(async () => null, async ([claimedAt]) => {
            if (state.authorization.status !== "authorized") return { meta: { changes: 0 } };
            state.authorization.status = "claiming";
            state.authorization.claimed_at = claimedAt;
            return { meta: { changes: 1 } };
          });
        }
        if (sql.includes("INSERT INTO devices")) {
          return statement(async () => null, async ([deviceId]) => {
            state.deviceId = deviceId;
            return { meta: { changes: 1 } };
          });
        }
        if (sql.includes("SET status = 'claimed'")) {
          return statement(async () => null, async ([deviceId]) => {
            state.authorization.status = "claimed";
            state.authorization.device_id = deviceId;
            return { meta: { changes: 1 } };
          });
        }
        return statement(async () => null);
      },
    },
  };
  const started = await startDeviceAuthorization(new Request("https://api.example/v1/auth/device/start", {
    method: "POST",
    body: JSON.stringify({ device_name: "Test device" }),
  }), env, Date.now());
  const body = await started.json();
  assert.equal(body.verification_uri, "https://api.example/v1/auth/device/verify");
  assert.equal(body.verification_uri_complete, undefined);

  const first = await pollDeviceAuthorization(new Request("https://api.example/v1/auth/device/status", {
    method: "POST",
    body: JSON.stringify({ device_code: body.device_code }),
  }), env);
  const credential = await first.json();
  assert.equal(credential.public_card, false);
  assert.equal(credential.card_url, null);
  assert.ok(credential.expires_at);
  assert.ok(state.deviceId);

  await assert.rejects(
    () => pollDeviceAuthorization(new Request("https://api.example/v1/auth/device/status", {
      method: "POST",
      body: JSON.stringify({ device_code: body.device_code }),
    }), env),
    (error) => error instanceof HttpError && error.code === "invalid_grant",
  );
});

test("expired device tokens are rejected", async () => {
  const secret = "s".repeat(43);
  const tokenHash = await hashDeviceSecret(secret, "pepper");
  const env = {
    TOKEN_PEPPER: "pepper",
    DB: {
      prepare() {
        return statement(async () => ({
          id: "device123", user_id: "usr_1", token_hash: tokenHash,
          revoked_at: null, expires_at: "2000-01-01T00:00:00.000Z",
        }));
      },
    },
  };
  const request = new Request("https://api.example/v1/me/summary", {
    headers: { Authorization: `Bearer tb_live_device123.${secret}` },
  });
  await assert.rejects(
    () => authenticate(request, env),
    (error) => error instanceof HttpError && error.code === "expired_token",
  );
});

test("rate limits persist per hashed client and time window", async () => {
  let count = 0;
  const env = {
    TOKEN_PEPPER: "pepper",
    DB: {
      prepare(sql) {
        if (sql.includes("INSERT INTO rate_limits")) {
          return statement(async () => ({ count: ++count }));
        }
        return statement(async () => null);
      },
    },
  };
  const request = new Request("https://api.example", { headers: { "CF-Connecting-IP": "192.0.2.1" } });
  await enforceRateLimit(env, request, "test", { limit: 2, now: 1_000 });
  await enforceRateLimit(env, request, "test", { limit: 2, now: 1_000 });
  await assert.rejects(
    () => enforceRateLimit(env, request, "test", { limit: 2, now: 1_000 }),
    (error) => error instanceof HttpError && error.status === 429,
  );
});

test("making a card private deletes the public object and rejects partial policies", async () => {
  const deleted = [];
  const env = {
    CARD_ORIGIN: "https://api.example/v1/cards",
    CARDS: { delete: async (key) => deleted.push(key) },
    DB: { prepare: () => statement(async () => null) },
  };
  const device = { user_id: "usr_1", public_slug: "octocat" };
  const privatePolicy = {
    public_card: false,
    publish_harness: false,
    publish_provider: false,
    publish_model: false,
    publish_heatmap: false,
    publish_rank: false,
  };
  const response = await updatePrivacy(new Request("https://api.example/v1/me/privacy", {
    method: "PUT",
    body: JSON.stringify(privatePolicy),
  }), env, device);
  assert.equal((await response.json()).card_url, null);
  assert.deepEqual(deleted, ["u/octocat.svg"]);

  await assert.rejects(
    () => updatePrivacy(new Request("https://api.example/v1/me/privacy", {
      method: "PUT",
      body: JSON.stringify({ public_card: true }),
    }), env, device),
    (error) => error instanceof HttpError && error.code === "invalid_privacy",
  );
});
