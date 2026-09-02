import { API_ORIGIN } from "./constants.js";
import { deviceProofHeaders, generateDeviceProofKeys } from "./device-proof.js";

function origin(value = API_ORIGIN) {
  let url;
  try {
    url = new URL(String(value || API_ORIGIN));
  } catch {
    throw new Error("TokensBurned API origin must be a valid URL.");
  }
  const local = new Set(["localhost", "127.0.0.1", "::1"]).has(url.hostname);
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
    throw new Error("TokensBurned API origin must use HTTPS (except localhost development).");
  }
  url.username = "";
  url.password = "";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

async function request(pathname, {
  apiOrigin = API_ORIGIN,
  method = "GET",
  body,
  token,
  devicePrivateKeyJwk,
  proofSubject,
  fetchImpl = globalThis.fetch,
  timeoutMs = 15_000,
} = {}) {
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  const target = `${origin(apiOrigin)}${pathname}`;
  const tokenDeviceId = token?.match(/^tb_live_([A-Za-z0-9_-]{8,64})\./)?.[1];
  Object.assign(headers, await deviceProofHeaders({
    privateKeyJwk: devicePrivateKeyJwk,
    subject: proofSubject || tokenDeviceId,
    method,
    url: target,
    body,
  }));
  let response;
  try {
    response = await fetchImpl(target, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new Error(`TokensBurned server is unavailable: ${error.message}`);
  }
  let payload = null;
  const text = await response.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }
  if (!response.ok) {
    const problem = payload?.error;
    throw new Error(problem?.message || `TokensBurned server returned HTTP ${response.status}.`);
  }
  return payload;
}

export async function startDeviceAuthorization(options = {}) {
  const keys = await generateDeviceProofKeys();
  const authorization = await request("/v1/auth/device/start", {
    ...options,
    method: "POST",
    body: {
      device_name: options.deviceName || "TokensBurned plugin",
      public_key_jwk: keys.publicKeyJwk,
    },
  });
  return { ...authorization, device_proof_keys: keys };
}

export function pollDeviceAuthorization(deviceCode, options = {}) {
  return request("/v1/auth/device/status", {
    ...options,
    method: "POST",
    body: { device_code: deviceCode },
    proofSubject: deviceCode,
  });
}

export function fetchClientRelease(options = {}) {
  return request("/v1/client/version", {
    ...options,
    timeoutMs: options.timeoutMs ?? 3_000,
  });
}

export async function uploadEntries(entries, { token, ...options } = {}) {
  if (!token) throw new Error("TokensBurned is not connected. Run `burn connect` first.");
  let accepted = 0;
  for (let index = 0; index < entries.length; index += 100) {
    const batch = entries.slice(index, index + 100);
    const result = await request("/v1/ingest/batch", {
      ...options,
      token,
      method: "POST",
      body: { v: 1, entries: batch },
    });
    accepted += Number(result?.accepted || 0);
  }
  return { accepted };
}

function dailyBatches(days, maxBytes = 480 * 1024) {
  const batches = [];
  let batch = [];
  for (const day of days) {
    const dayBytes = new TextEncoder().encode(JSON.stringify(day)).byteLength;
    if (dayBytes > 256 * 1024) {
      throw new Error(`TokensBurned UTC day ${day.day} exceeds the 256 KB upload limit.`);
    }
    const candidate = [...batch, day];
    const candidateBytes = new TextEncoder().encode(JSON.stringify({ v: 2, days: candidate })).byteLength;
    if (batch.length && (candidate.length > 20 || candidateBytes > maxBytes)) {
      batches.push(batch);
      batch = [day];
    } else {
      batch = candidate;
    }
  }
  if (batch.length) batches.push(batch);
  return batches;
}

export async function uploadDailyEnvelopes(days, { token, ...options } = {}) {
  if (!token) throw new Error("TokensBurned is not connected. Run `burn connect` first.");
  const totals = { accepted: 0, received: 0, changed: 0, ignored: 0, acked_days: [] };
  for (const batch of dailyBatches(days)) {
    const result = await request("/v1/ingest/batch", {
      ...options,
      token,
      method: "POST",
      body: { v: 2, days: batch },
    });
    for (const key of ["accepted", "received", "changed", "ignored"]) {
      totals[key] += Number(result?.[key] || 0);
    }
    totals.acked_days.push(...(result?.acked_days || []));
  }
  return totals;
}

export function fetchServerSummary({ token, ...options } = {}) {
  if (!token) throw new Error("TokensBurned is not connected. Run `burn connect` first.");
  return request("/v1/me/summary", { ...options, token });
}

export function fetchServerPrivacy({ token, ...options } = {}) {
  if (!token) throw new Error("TokensBurned is not connected. Run `burn connect` first.");
  return request("/v1/me/privacy", { ...options, token });
}

export function updateServerPrivacy(privacy, { token, ...options } = {}) {
  if (!token) throw new Error("TokensBurned is not connected. Run `burn connect` first.");
  return request("/v1/me/privacy", {
    ...options,
    method: "PUT",
    token,
    body: privacy,
  });
}

export function revokeDevice({ token, ...options } = {}) {
  if (!token) throw new Error("TokensBurned is not connected. Run `burn connect` first.");
  return request("/v1/me/device", { ...options, method: "DELETE", token });
}

export function deleteServerData({ token, ...options } = {}) {
  if (!token) throw new Error("TokensBurned is not connected. Run `burn connect` first.");
  return request("/v1/me/data", { ...options, method: "DELETE", token });
}

export const serverInternals = { origin, request, dailyBatches };
