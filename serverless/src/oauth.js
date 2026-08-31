import { createDeviceCredential } from "./auth.js";
import { hashDeviceSecret, randomId } from "./crypto.js";
import { HttpError, json, readForm, readJson } from "./http.js";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CONFIRMATION_COOKIE = "tb_device_confirm";

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

function escapeHtml(value) {
  return String(value).replace(/[<>&"']/g, (character) => ({
    "<": "&lt;", ">": "&gt;", "&": "&amp;", "\"": "&quot;", "'": "&#39;",
  })[character]);
}

function page(body, status = 200, headers = {}) {
  return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>Connect TokensBurned</title><style>body{font:16px ui-monospace,monospace;background:#171513;color:#f4efe5;display:grid;place-items:center;min-height:100vh;margin:0}main{width:min(36rem,calc(100% - 3rem));padding:2rem;border:1px solid #3b3733}b,h1{color:#ff6b28}label,input,button{display:block;width:100%;box-sizing:border-box}input,button{font:inherit;padding:.8rem;margin-top:.6rem}button{background:#ff6b28;border:0;font-weight:800;cursor:pointer}.warning{color:#ffb000}</style><main>${body}</main></html>`, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      ...headers,
    },
  });
}

function cookieValue(request, name) {
  const cookie = request.headers.get("cookie") || "";
  for (const part of cookie.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return "";
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
  await env.DB.prepare("DELETE FROM device_authorizations WHERE expires_at <= ?")
    .bind(createdAt).run();
  const apiOrigin = required(env, "API_ORIGIN").replace(/\/$/, "");
  return json({
    device_code: deviceCode,
    user_code: userCode,
    verification_uri: `${apiOrigin}/v1/auth/device/verify`,
    expires_in: 600,
    interval: 5,
  }, 201);
}

export function deviceVerificationPage() {
  return page(`<h1>Connect TokensBurned</h1><p>Enter the code shown by the TokensBurned client. Never use a code sent by another person.</p><form method="post" action="/v1/auth/device/verify"><label>Device code<input name="user_code" autocomplete="one-time-code" inputmode="text" maxlength="9" required></label><button type="submit">Continue</button></form>`);
}

export async function verifyDeviceAuthorization(request, env, now = Date.now()) {
  const form = await readForm(request);
  const userCode = String(form.get("user_code") || "").trim().toUpperCase();
  const auth = await env.DB.prepare(
    `SELECT id, user_code, device_name FROM device_authorizations
      WHERE user_code = ? AND status = 'pending' AND expires_at > ?`,
  ).bind(userCode, new Date(now).toISOString()).first();
  if (!auth) throw new HttpError(400, "invalid_user_code", "The device code is invalid or expired.");
  const confirmation = randomId(32);
  const confirmationHash = await hashDeviceSecret(confirmation, env.TOKEN_PEPPER);
  await env.DB.prepare(
    "UPDATE device_authorizations SET confirmation_hash = ? WHERE id = ?",
  ).bind(confirmationHash, auth.id).run();

  return page(`<h1>Confirm this device</h1><p>Code: <b>${escapeHtml(auth.user_code)}</b></p><p>Device: <b>${escapeHtml(auth.device_name)}</b></p><p class="warning">Continue only if you personally started this connection on that device. TokensBurned will verify your GitHub identity; publishing a profile card remains off by default.</p><form method="post" action="/v1/auth/device/approve"><input type="hidden" name="user_code" value="${escapeHtml(auth.user_code)}"><button type="submit">Authorize with GitHub</button></form>`, 200, {
    "Set-Cookie": `${CONFIRMATION_COOKIE}=${encodeURIComponent(confirmation)}; Path=/v1/auth/device; Max-Age=600; Secure; HttpOnly; SameSite=Strict`,
  });
}

export async function approveDeviceAuthorization(request, env, now = Date.now()) {
  const form = await readForm(request);
  const userCode = String(form.get("user_code") || "").trim().toUpperCase();
  const confirmation = cookieValue(request, CONFIRMATION_COOKIE);
  if (!confirmation) throw new HttpError(400, "invalid_confirmation", "Device confirmation is missing or expired.");
  const confirmationHash = await hashDeviceSecret(confirmation, env.TOKEN_PEPPER);
  const auth = await env.DB.prepare(
    `SELECT id FROM device_authorizations
      WHERE user_code = ? AND confirmation_hash = ?
        AND status = 'pending' AND expires_at > ?`,
  ).bind(userCode, confirmationHash, new Date(now).toISOString()).first();
  if (!auth) throw new HttpError(400, "invalid_confirmation", "Device confirmation is invalid or expired.");

  const state = randomId(32);
  const stateHash = await hashDeviceSecret(state, env.TOKEN_PEPPER);
  await env.DB.prepare(
    "UPDATE device_authorizations SET oauth_state_hash = ?, confirmation_hash = NULL WHERE id = ?",
  ).bind(stateHash, auth.id).run();
  const callback = `${required(env, "API_ORIGIN").replace(/\/$/, "")}/v1/auth/github/callback`;
  const authorize = new URL("https://github.com/login/oauth/authorize");
  authorize.searchParams.set("client_id", required(env, "GITHUB_CLIENT_ID"));
  authorize.searchParams.set("redirect_uri", callback);
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("scope", "read:user");
  return new Response(null, {
    status: 302,
    headers: {
      Location: authorize.toString(),
      "Cache-Control": "no-store",
      "Set-Cookie": `${CONFIRMATION_COOKIE}=; Path=/v1/auth/device; Max-Age=0; Secure; HttpOnly; SameSite=Strict`,
    },
  });
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

  return page("<h1>TokensBurned connected</h1><p>You can close this tab and return to your coding harness.</p>");
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
  if (auth.status === "pending") {
    return json({ status: "authorization_pending", interval: 5 }, 202);
  }
  if (auth.status !== "authorized" || !auth.user_id || auth.claimed_at || auth.device_id) {
    throw new HttpError(400, "invalid_grant", "The device authorization was already claimed.");
  }

  const timestamp = new Date(now).toISOString();
  const reservation = await env.DB.prepare(
    `UPDATE device_authorizations
        SET status = 'claiming', claimed_at = ?
      WHERE id = ? AND status = 'authorized' AND claimed_at IS NULL`,
  ).bind(timestamp, auth.id).run();
  if (Number(reservation?.meta?.changes || 0) !== 1) {
    throw new HttpError(400, "invalid_grant", "The device authorization was already claimed.");
  }
  const credential = await createDeviceCredential(env, {
    userId: auth.user_id,
    name: auth.device_name,
  });
  await env.DB.prepare(
    `UPDATE device_authorizations
        SET status = 'claimed', device_id = ?
      WHERE id = ? AND status = 'claiming'`,
  ).bind(credential.deviceId, auth.id).run();
  return json({
    status: "authorized",
    token: credential.token,
    expires_at: credential.expiresAt,
    user: { github_login: auth.github_login, public_slug: auth.public_slug },
    card_url: null,
    public_card: false,
  });
}
