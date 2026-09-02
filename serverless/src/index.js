import { authenticate, createDeviceCredential } from "./auth.js";
import { constantTimeEqual, randomId } from "./crypto.js";
import { refreshUserCard } from "./card.js";
import { HttpError, json, problem, readJson } from "./http.js";
import { ingestBatch } from "./ingest.js";
import { ingestOtel } from "./otel.js";
import {
  approveDeviceAuthorization,
  deviceVerificationPage,
  githubCallback,
  oauthErrorPage,
  pollDeviceAuthorization,
  startDeviceAuthorization,
  verifyDeviceAuthorization,
} from "./oauth.js";
import { getPrivacy, updatePrivacy } from "./privacy.js";
import { enforceRateLimit } from "./rate-limit.js";
import { clientRelease } from "./release.js";
import { summarizeUser } from "./summary.js";
import { compactUserUsage } from "./compaction.js";

const BROWSER_AUTH_ROUTES = new Set([
  "/v1/auth/device/verify",
  "/v1/auth/device/approve",
  "/v1/auth/github/callback",
]);

export function featureEnabled(env, name) {
  return env?.[name] !== "false";
}

function withCors(response, request, env) {
  const origin = request.headers.get("origin");
  if (!origin || !env.APP_ORIGIN || origin !== env.APP_ORIGIN) return response;
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type, Idempotency-Key");
  headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  headers.set("Vary", "Origin");
  return new Response(response.body, { status: response.status, headers });
}

function slug(value) {
  const result = String(value || "").trim();
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(result)) {
    throw new HttpError(400, "invalid_github_login", "github_login is invalid.");
  }
  return result;
}

async function bootstrap(request, env) {
  if (!env.BOOTSTRAP_SECRET) throw new HttpError(404, "not_found", "Not found.");
  const presented = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!constantTimeEqual(presented, env.BOOTSTRAP_SECRET)) {
    throw new HttpError(401, "invalid_token", "Bootstrap authorization failed.");
  }
  const existing = await env.DB.prepare("SELECT COUNT(*) AS count FROM users").first();
  if (Number(existing?.count || 0) > 0) {
    throw new HttpError(409, "already_bootstrapped", "Bootstrap is only available before the first user exists.");
  }
  const body = await readJson(request, 8 * 1024);
  const githubLogin = slug(body.github_login);
  const publicSlug = githubLogin.toLowerCase();
  const userId = `usr_${randomId(12)}`;
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO users (id, github_id, github_login, public_slug, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(userId, body.github_id || null, githubLogin, publicSlug, now, now).run();
  const credential = await createDeviceCredential(env, {
    userId,
    name: body.device_name || "Bootstrap device",
  });
  const user = { id: userId, user_id: userId, public_slug: publicSlug };
  await refreshUserCard(env, user);
  return json({
    user: { id: userId, github_login: githubLogin, public_slug: publicSlug },
    device: { id: credential.deviceId, token: credential.token, expires_at: credential.expiresAt },
    card_url: null,
  }, 201);
}

async function authenticatedRoute(request, env, ctx, pathname) {
  const device = await authenticate(request, env);
  if (pathname === "/v1/ingest/batch" && request.method === "POST") {
    const payload = await readJson(request, 512 * 1024);
    if (payload?.v === 2 && !featureEnabled(env, "V2_INGEST_ENABLED")) {
      throw new HttpError(503, "v2_ingest_paused", "Daily-envelope ingestion is temporarily paused; retry later.");
    }
    const result = await ingestBatch(env, device, payload);
    return json(result, 202);
  }
  const otelSignals = new Map([
    ["/v1/otel/metrics", "metrics"], ["/v1/metrics", "metrics"],
    ["/v1/otel/logs", "logs"], ["/v1/logs", "logs"],
    ["/v1/otel/traces", "traces"], ["/v1/traces", "traces"],
  ]);
  if (otelSignals.has(pathname) && request.method === "POST") {
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("json")) {
      throw new HttpError(415, "unsupported_media_type", "Use OTLP/HTTP JSON for the initial serverless collector.");
    }
    const signal = otelSignals.get(pathname);
    const result = await ingestOtel(env, device, await readJson(request, 512 * 1024), signal);
    return json({ partialSuccess: {}, tokensburned: result });
  }
  if (pathname === "/v1/me/summary" && request.method === "GET") {
    const summaryState = {};
    const summary = await summarizeUser(env, device.user_id, Date.now(), summaryState);
    if (featureEnabled(env, "COMPACTION_ENABLED") && summaryState.cache === "miss") {
      ctx.waitUntil(compactUserUsage(env, device.user_id));
    }
    return json(summary);
  }
  if (pathname === "/v1/me/privacy" && request.method === "GET") {
    return getPrivacy(env, device);
  }
  if (pathname === "/v1/me/privacy" && request.method === "PUT") {
    return updatePrivacy(request, env, device);
  }
  if (pathname === "/v1/me/device" && request.method === "DELETE") {
    await env.DB.prepare("UPDATE devices SET revoked_at = ? WHERE id = ?")
      .bind(new Date().toISOString(), device.id).run();
    return new Response(null, { status: 204 });
  }
  if (pathname === "/v1/me/data" && request.method === "DELETE") {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM usage_buckets WHERE device_id IN (SELECT id FROM devices WHERE user_id = ?)").bind(device.user_id),
      env.DB.prepare("DELETE FROM usage_events WHERE device_id IN (SELECT id FROM devices WHERE user_id = ?)").bind(device.user_id),
      env.DB.prepare("DELETE FROM devices WHERE user_id = ?").bind(device.user_id),
      env.DB.prepare("DELETE FROM users WHERE id = ?").bind(device.user_id),
    ]);
    await env.CARDS.delete(`u/${device.public_slug}.svg`);
    return new Response(null, { status: 204 });
  }
  throw new HttpError(404, "not_found", "Not found.");
}

const CARD_REGENERATION_INTERVAL_MS = 60 * 60 * 1000;
const cardRegenerations = new Map();

export function singleflightCard(key, work) {
  const running = cardRegenerations.get(key);
  if (running) return running;
  const pending = Promise.resolve()
    .then(work)
    .finally(() => {
      if (cardRegenerations.get(key) === pending) cardRegenerations.delete(key);
    });
  cardRegenerations.set(key, pending);
  return pending;
}

function regenerateCard(env, user) {
  return singleflightCard(user.id, async () => {
    const [cardResult] = await Promise.all([
      refreshUserCard(env, user),
      compactUserUsage(env, user.id),
    ]);
    return cardResult;
  });
}

function cardResponse(request, object, body) {
  const headers = new Headers();
  object?.writeHttpMetadata?.(headers);
  if (object?.httpEtag) headers.set("ETag", object.httpEtag);
  headers.set("Content-Type", "image/svg+xml; charset=utf-8");
  headers.set("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox");
  headers.set("Referrer-Policy", "no-referrer");
  return new Response(request.method === "HEAD" ? null : body, { headers });
}

async function card(request, env, ctx, url) {
  if (!["GET", "HEAD"].includes(request.method)) {
    throw new HttpError(405, "method_not_allowed", "Method not allowed.");
  }
  const match = url.pathname.match(/^\/v1\/cards\/u\/([A-Za-z0-9-]+)\.svg$/);
  if (!match) throw new HttpError(404, "not_found", "Not found.");
  const publicSlug = match[1].toLowerCase();
  const user = await env.DB.prepare(
    `SELECT id, public_slug, public_card, publish_harness, publish_provider,
            publish_model, publish_heatmap, publish_rank
       FROM users WHERE public_slug = ? AND public_card = 1`,
  ).bind(publicSlug).first();
  if (!user) throw new HttpError(404, "card_not_found", "Card not found.");
  const object = await env.CARDS.get(`u/${publicSlug}.svg`);
  if (!object) {
    if (!featureEnabled(env, "CARD_REGENERATION_ENABLED")) {
      throw new HttpError(503, "card_regeneration_paused", "Card generation is temporarily paused; retry later.");
    }
    const refreshed = await regenerateCard(env, user);
    if (!refreshed.svg) throw new HttpError(404, "card_not_found", "Card not found.");
    return cardResponse(request, null, refreshed.svg);
  }
  const generatedAt = Date.parse(object.customMetadata?.generatedAt || "");
  if (featureEnabled(env, "CARD_REGENERATION_ENABLED")
      && (!Number.isFinite(generatedAt) || Date.now() - generatedAt >= CARD_REGENERATION_INTERVAL_MS)) {
    ctx.waitUntil(regenerateCard(env, user));
  }
  return cardResponse(request, object, object.body);
}

export async function handleRequest(request, env, ctx) {
  const url = new URL(request.url);
  if (request.method === "OPTIONS") return new Response(null, { status: 204 });
  if (url.pathname === "/health" && request.method === "GET") {
    return json({ ok: true, service: "tokensburned-api", version: 2 });
  }
  if (url.pathname === "/v1/client/version" && request.method === "GET") {
    return json(clientRelease());
  }
  if (url.pathname === "/v1/admin/bootstrap" && request.method === "POST") {
    return bootstrap(request, env);
  }
  if (url.pathname === "/v1/auth/device/start" && request.method === "POST") {
    await enforceRateLimit(env, request, "device-start", { limit: 10 });
    return startDeviceAuthorization(request, env);
  }
  if (url.pathname === "/v1/auth/device/status" && request.method === "POST") {
    await enforceRateLimit(env, request, "device-status", { limit: 60 });
    return pollDeviceAuthorization(request, env);
  }
  if (url.pathname === "/v1/auth/device/verify" && request.method === "GET") {
    await enforceRateLimit(env, request, "device-verify", { limit: 30 });
    return deviceVerificationPage(request);
  }
  if (url.pathname === "/v1/auth/device/verify" && request.method === "POST") {
    await enforceRateLimit(env, request, "device-verify", { limit: 30 });
    return verifyDeviceAuthorization(request, env);
  }
  if (url.pathname === "/v1/auth/device/approve" && request.method === "POST") {
    await enforceRateLimit(env, request, "device-approve", { limit: 20 });
    return approveDeviceAuthorization(request, env);
  }
  if (url.pathname === "/v1/auth/github/callback" && request.method === "GET") {
    await enforceRateLimit(env, request, "github-callback", { limit: 30 });
    return githubCallback(request, env);
  }
  if (url.pathname.startsWith("/v1/cards/")) return card(request, env, ctx, url);
  if (url.pathname.startsWith("/v1/")) return authenticatedRoute(request, env, ctx, url.pathname);
  throw new HttpError(404, "not_found", "Not found.");
}

export default {
  async fetch(request, env, ctx) {
    try {
      return withCors(await handleRequest(request, env, ctx), request, env);
    } catch (error) {
      if (error instanceof HttpError) {
        const pathname = new URL(request.url).pathname;
        if (BROWSER_AUTH_ROUTES.has(pathname)) {
          return withCors(oauthErrorPage(error), request, env);
        }
        return withCors(problem(error.status, error.code, error.message), request, env);
      }
      console.error("Unhandled TokensBurned Worker error", error?.message || error);
      return withCors(problem(500, "internal_error", "Internal server error."), request, env);
    }
  },
};
