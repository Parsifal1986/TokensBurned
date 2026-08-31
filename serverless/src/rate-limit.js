import { hashDeviceSecret } from "./crypto.js";
import { HttpError } from "./http.js";

function clientAddress(request) {
  return request.headers.get("CF-Connecting-IP")
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "unknown";
}

export async function enforceRateLimit(env, request, scope, {
  limit,
  windowSeconds = 60,
  now = Date.now(),
} = {}) {
  const window = Math.floor(now / 1000 / windowSeconds);
  const subjectHash = await hashDeviceSecret(
    `rate-limit:${clientAddress(request)}`,
    env.TOKEN_PEPPER,
  );
  const result = await env.DB.prepare(
    `INSERT INTO rate_limits (scope, subject_hash, window, count)
     VALUES (?, ?, ?, 1)
     ON CONFLICT (scope, subject_hash, window)
     DO UPDATE SET count = rate_limits.count + 1
     RETURNING count`,
  ).bind(scope, subjectHash, window).first();
  if (Number(result?.count || 0) > limit) {
    throw new HttpError(429, "rate_limited", "Too many requests. Try again later.");
  }

  // Opportunistic cleanup keeps the limiter bounded without a separate daemon.
  if (Number(result?.count || 0) === 1) {
    await env.DB.prepare("DELETE FROM rate_limits WHERE window < ?")
      .bind(window - 2).run();
  }
}
