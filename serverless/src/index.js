import { authenticate, createDeviceCredential } from "./auth.js";
import { constantTimeEqual, randomId } from "./crypto.js";
import { normalizeCardOptions, refreshUserCard, renderServerCard } from "./card.js";
import { HttpError, json, problem, readJson } from "./http.js";
import { ingestBatch } from "./ingest.js";
import { ingestOtel } from "./otel.js";
import {
  githubCallback,
  pollDeviceAuthorization,
  startDeviceAuthorization,
  verifyDeviceAuthorization,
} from "./oauth.js";
import { summarizeUser } from "./summary.js";

function withCors(response, request, env) {
  const origin = request.headers.get("origin");
  if (!origin || !env.APP_ORIGIN || origin !== env.APP_ORIGIN) return response;
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type, Idempotency-Key");
  headers.set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
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
    device: { id: credential.deviceId, token: credential.token },
    card_url: `${env.CARD_ORIGIN || ""}/u/${publicSlug}.svg`,
  }, 201);
}

async function authenticatedRoute(request, env, ctx, pathname) {
  const device = await authenticate(request, env);
  if (pathname === "/v1/ingest/batch" && request.method === "POST") {
    const result = await ingestBatch(env, device, await readJson(request));
    ctx.waitUntil(refreshUserCard(env, device));
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
    if (result.accepted) ctx.waitUntil(refreshUserCard(env, device));
    return json({ partialSuccess: {}, tokensburned: result });
  }
  if (pathname === "/v1/me/summary" && request.method === "GET") {
    return json(await summarizeUser(env, device.user_id));
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

async function card(request, env, url) {
  if (!["GET", "HEAD"].includes(request.method)) {
    throw new HttpError(405, "method_not_allowed", "Method not allowed.");
  }
  const match = url.pathname.match(/^\/v1\/cards\/u\/([A-Za-z0-9-]+)\.svg$/);
  if (!match) throw new HttpError(404, "not_found", "Not found.");
  const publicSlug = match[1].toLowerCase();
  const hasOptions = [...url.searchParams.keys()].some((key) =>
    ["layout", "heatmap", "compare", "meme", "rank"].includes(key));
  if (hasOptions) {
    const user = await env.DB.prepare("SELECT id, public_slug FROM users WHERE public_slug = ?")
      .bind(publicSlug).first();
    if (!user) throw new HttpError(404, "card_not_found", "Card not found.");
    const options = normalizeCardOptions(Object.fromEntries(url.searchParams));
    const svg = renderServerCard(await summarizeUser(env, user.id), user.public_slug, options);
    return new Response(request.method === "HEAD" ? null : svg, { headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=900, stale-while-revalidate=86400",
      "X-Content-Type-Options": "nosniff",
    } });
  }
  const object = await env.CARDS.get(`u/${publicSlug}.svg`);
  if (!object) throw new HttpError(404, "card_not_found", "Card not found.");
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("ETag", object.httpEtag);
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(request.method === "HEAD" ? null : object.body, { headers });
}

export async function handleRequest(request, env, ctx) {
  const url = new URL(request.url);
  if (request.method === "OPTIONS") return new Response(null, { status: 204 });
  if (url.pathname === "/health" && request.method === "GET") {
    return json({ ok: true, service: "tokensburned-api", version: 2 });
  }
  if (url.pathname === "/v1/admin/bootstrap" && request.method === "POST") {
    return bootstrap(request, env);
  }
  if (url.pathname === "/v1/auth/device/start" && request.method === "POST") {
    return startDeviceAuthorization(request, env);
  }
  if (url.pathname === "/v1/auth/device/status" && request.method === "POST") {
    return pollDeviceAuthorization(request, env);
  }
  if (url.pathname === "/v1/auth/device/verify" && request.method === "GET") {
    return verifyDeviceAuthorization(request, env);
  }
  if (url.pathname === "/v1/auth/github/callback" && request.method === "GET") {
    return githubCallback(request, env);
  }
  if (url.pathname.startsWith("/v1/cards/")) return card(request, env, url);
  if (url.pathname.startsWith("/v1/")) return authenticatedRoute(request, env, ctx, url.pathname);
  throw new HttpError(404, "not_found", "Not found.");
}

export default {
  async fetch(request, env, ctx) {
    try {
      return withCors(await handleRequest(request, env, ctx), request, env);
    } catch (error) {
      if (error instanceof HttpError) {
        return withCors(problem(error.status, error.code, error.message), request, env);
      }
      console.error("Unhandled TokensBurned Worker error", error?.message || error);
      return withCors(problem(500, "internal_error", "Internal server error."), request, env);
    }
  },
};
