import { API_ORIGIN } from "./constants.js";

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
  fetchImpl = globalThis.fetch,
} = {}) {
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  let response;
  try {
    response = await fetchImpl(`${origin(apiOrigin)}${pathname}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
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

export function startDeviceAuthorization(options = {}) {
  return request("/v1/auth/device/start", {
    ...options,
    method: "POST",
    body: { device_name: options.deviceName || "TokensBurned plugin" },
  });
}

export function pollDeviceAuthorization(deviceCode, options = {}) {
  return request("/v1/auth/device/status", {
    ...options,
    method: "POST",
    body: { device_code: deviceCode },
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

export const serverInternals = { origin, request };
