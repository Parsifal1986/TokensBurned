import { hashDeviceSecret, randomId, sha256 } from "./crypto.js";
import { HttpError, json, readJson } from "./http.js";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function humanCode() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const chars = [...bytes].map((byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]);
  return `${chars.slice(0, 4).join("")}-${chars.slice(4).join("")}`;
}

function required(env, key) {
  if (!env[key]) throw new HttpError(503, "not_configured", `${key} is not configured.`);
  return env[key];
}

function safeDeviceName(value) {
  const name = String(value || "TokensBurned plugin").trim();
  if (!name || name.length > 80 || /[\u0000-\u001f]/.test(name)) {
    throw new HttpError(400, "invalid_device_name", "device_name is invalid.");
  }
  return name;
}

export async function startDeviceAuthorization(request, env, now = Date.now()) {
  const body = await readJson(request, 8 * 1024);
  const id = `auth_${randomId(12)}`;
  const deviceCode = randomId(32);
  const codeHash = await hashDeviceSecret(deviceCode, env.TOKEN_PEPPER);
  const userCode = humanCode();
  const createdAt = new Date(now).toISOString();
  const expiresAt = new Date(now + 10 * 60 * 1000).toISOString();
  await env.DB.prepare(
    `INSERT INTO device_authorizations
      (id, device_code_hash, user_code, device_name, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(id, codeHash, userCode, safeDeviceName(body.device_name), createdAt, expiresAt).run();
  const apiOrigin = required(env, "API_ORIGIN").replace(/\/$/, "");
  return json({
    device_code: deviceCode,
    user_code: userCode,
    verification_uri: `${apiOrigin}/v1/auth/device/verify`,
    verification_uri_complete: `${apiOrigin}/v1/auth/device/verify?user_code=${encodeURIComponent(userCode)}`,
    expires_in: 600,
    interval: 5,
  }, 201);
}

export async function verifyDeviceAuthorization(request, env, now = Date.now()) {
  const url = new URL(request.url);
  const userCode = String(url.searchParams.get("user_code") || "").trim().toUpperCase();
  const auth = await env.DB.prepare(
    `SELECT id FROM device_authorizations
      WHERE user_code = ? AND status = 'pending' AND expires_at > ?`,
  ).bind(userCode, new Date(now).toISOString()).first();
  if (!auth) throw new HttpError(400, "invalid_user_code", "The device code is invalid or expired.");
  const state = randomId(32);
  const stateHash = await hashDeviceSecret(state, env.TOKEN_PEPPER);
  await env.DB.prepare(
    "UPDATE device_authorizations SET oauth_state_hash = ? WHERE id = ?",
  ).bind(stateHash, auth.id).run();
  const callback = `${required(env, "API_ORIGIN").replace(/\/$/, "")}/v1/auth/github/callback`;
  const authorize = new URL("https://github.com/login/oauth/authorize");
  authorize.searchParams.set("client_id", required(env, "GITHUB_CLIENT_ID"));
  authorize.searchParams.set("redirect_uri", callback);
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("scope", "read:user");
  return Response.redirect(authorize.toString(), 302);
}

async function githubIdentity(code, env) {
  const callback = `${required(env, "API_ORIGIN").replace(/\/$/, "")}/v1/auth/github/callback`;
  const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: required(env, "GITHUB_CLIENT_ID"),
      client_secret: required(env, "GITHUB_CLIENT_SECRET"),
      code,
      redirect_uri: callback,
    }),
  });
  const tokenBody = await tokenResponse.json();
  if (!tokenResponse.ok || !tokenBody.access_token) {
    const reason = typeof tokenBody.error === "string" ? tokenBody.error : "unknown_error";
    throw new HttpError(502, "github_oauth_failed", `GitHub authorization failed (${reason}).`);
  }
  const userResponse = await fetch("https://api.github.com/user", {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${tokenBody.access_token}`,
      "User-Agent": "TokensBurned",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  const user = await userResponse.json();
  if (!userResponse.ok || !user.id || !user.login) {
    throw new HttpError(502, "github_identity_failed", "Could not read the GitHub identity.");
  }
  return { id: Number(user.id), login: String(user.login) };
}

export async function githubCallback(request, env, now = Date.now()) {
  const url = new URL(request.url);
  if (url.searchParams.get("error")) throw new HttpError(400, "github_denied", "GitHub authorization was denied.");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) throw new HttpError(400, "invalid_callback", "GitHub callback is incomplete.");
  const stateHash = await hashDeviceSecret(state, env.TOKEN_PEPPER);
  const auth = await env.DB.prepare(
    `SELECT id FROM device_authorizations
      WHERE oauth_state_hash = ? AND status = 'pending' AND expires_at > ?`,
  ).bind(stateHash, new Date(now).toISOString()).first();
  if (!auth) throw new HttpError(400, "invalid_oauth_state", "Authorization state is invalid or expired.");

  const github = await githubIdentity(code, env);
  const publicSlug = github.login.toLowerCase();
  let user = await env.DB.prepare("SELECT id FROM users WHERE github_id = ?").bind(github.id).first();
  if (!user) {
    user = await env.DB.prepare(
      "SELECT id FROM users WHERE github_login = ? COLLATE NOCASE",
    ).bind(github.login).first();
  }
  const timestamp = new Date(now).toISOString();
  if (!user) {
    user = { id: `usr_${randomId(12)}` };
    await env.DB.prepare(
      `INSERT INTO users (id, github_id, github_login, public_slug, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(user.id, github.id, github.login, publicSlug, timestamp, timestamp).run();
  } else {
    await env.DB.prepare(
      "UPDATE users SET github_id = ?, github_login = ?, public_slug = ?, updated_at = ? WHERE id = ?",
    ).bind(github.id, github.login, publicSlug, timestamp, user.id).run();
  }
  await env.DB.prepare(
    `UPDATE device_authorizations
        SET status = 'authorized', user_id = ?, authorized_at = ?, oauth_state_hash = NULL
      WHERE id = ?`,
  ).bind(user.id, timestamp, auth.id).run();

  return new Response(`<!doctype html><meta charset="utf-8"><title>TokensBurned connected</title><style>body{font:16px ui-monospace,monospace;background:#171513;color:#f4efe5;display:grid;place-items:center;min-height:100vh;margin:0}main{max-width:36rem;padding:2rem;border:1px solid #3b3733}b{color:#ff6b28}</style><main><b>🔥 TokensBurned connected.</b><p>You can close this tab and return to your coding harness.</p></main>`, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function pollDeviceAuthorization(request, env, now = Date.now()) {
  const body = await readJson(request, 8 * 1024);
  const deviceCode = String(body.device_code || "");
  const codeHash = await hashDeviceSecret(deviceCode, env.TOKEN_PEPPER);
  const auth = await env.DB.prepare(
    `SELECT a.*, u.github_login, u.public_slug
       FROM device_authorizations a
       LEFT JOIN users u ON u.id = a.user_id
      WHERE a.device_code_hash = ?`,
  ).bind(codeHash).first();
  if (!auth || auth.expires_at <= new Date(now).toISOString()) {
    throw new HttpError(400, "expired_token", "The device authorization expired.");
  }
  if (auth.status !== "authorized" || !auth.user_id) {
    return json({ status: "authorization_pending", interval: 5 }, 202);
  }

  const deviceId = auth.device_id || `dev_${auth.id.slice(5)}`;
  const secret = await sha256(`${env.TOKEN_PEPPER}:device-credential:${deviceCode}`);
  const tokenHash = await hashDeviceSecret(secret, env.TOKEN_PEPPER);
  const timestamp = new Date(now).toISOString();
  if (!auth.device_id) {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO devices (id, user_id, name, token_hash, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      ).bind(deviceId, auth.user_id, auth.device_name, tokenHash, timestamp),
      env.DB.prepare(
        "UPDATE device_authorizations SET device_id = ?, claimed_at = ? WHERE id = ?",
      ).bind(deviceId, timestamp, auth.id),
    ]);
  }
  return json({
    status: "authorized",
    token: `tb_live_${deviceId}.${secret}`,
    user: { github_login: auth.github_login, public_slug: auth.public_slug },
    card_url: `${required(env, "CARD_ORIGIN").replace(/\/$/, "")}/u/${auth.public_slug}.svg`,
  });
}
