import { constantTimeEqual, hashDeviceSecret, randomId } from "./crypto.js";
import { HttpError } from "./http.js";

const TOKEN_PATTERN = /^tb_live_([A-Za-z0-9_-]{8,64})\.([A-Za-z0-9_-]{32,128})$/;
const DEVICE_LIFETIME_MS = 180 * 24 * 60 * 60 * 1000;

export async function createDeviceCredential(env, { userId, name = "Bootstrap device" }) {
  const deviceId = randomId(12);
  const secret = randomId(32);
  const tokenHash = await hashDeviceSecret(secret, env.TOKEN_PEPPER);
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + DEVICE_LIFETIME_MS).toISOString();
  await env.DB.prepare(
    `INSERT INTO devices (id, user_id, name, token_hash, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(deviceId, userId, name, tokenHash, now, expiresAt).run();
  return { deviceId, token: `tb_live_${deviceId}.${secret}`, expiresAt };
}

export async function authenticate(request, env) {
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const match = token.match(TOKEN_PATTERN);
  if (!match) throw new HttpError(401, "invalid_token", "A valid device token is required.");

  const row = await env.DB.prepare(
    `SELECT d.id, d.user_id, d.token_hash, d.revoked_at, d.expires_at,
            u.github_login, u.public_slug, u.public_card,
            u.publish_harness, u.publish_provider, u.publish_model,
            u.publish_heatmap, u.publish_rank
       FROM devices d
       JOIN users u ON u.id = d.user_id
      WHERE d.id = ?`,
  ).bind(match[1]).first();
  const presentedHash = await hashDeviceSecret(match[2], env.TOKEN_PEPPER);
  if (!row || row.revoked_at || !constantTimeEqual(row.token_hash, presentedHash)) {
    throw new HttpError(401, "invalid_token", "A valid device token is required.");
  }
  if (!row.expires_at || row.expires_at <= new Date().toISOString()) {
    throw new HttpError(401, "expired_token", "The device token expired. Connect again.");
  }
  return row;
}
