const SECURITY_HEADERS = {
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...SECURITY_HEADERS,
      ...headers,
    },
  });
}

export function problem(status, code, message) {
  return json({ error: { code, message } }, status);
}

export async function readJson(request, limit = 64 * 1024) {
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > limit) throw new HttpError(413, "payload_too_large", "Payload is too large.");
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > limit) {
    throw new HttpError(413, "payload_too_large", "Payload is too large.");
  }
  try {
    return JSON.parse(body);
  } catch {
    throw new HttpError(400, "invalid_json", "Request body must be valid JSON.");
  }
}

export async function readForm(request, limit = 8 * 1024) {
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > limit) throw new HttpError(413, "payload_too_large", "Payload is too large.");
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > limit) {
    throw new HttpError(413, "payload_too_large", "Payload is too large.");
  }
  return new URLSearchParams(body);
}

export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function methodNotAllowed(allowed) {
  return problem(405, "method_not_allowed", "Method not allowed.", {
    Allow: allowed.join(", "),
  });
}
