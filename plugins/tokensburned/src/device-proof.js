import { webcrypto } from "node:crypto";

const encoder = new TextEncoder();

function canonicalJson(value) {
  if (value === undefined) return "";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => (
    `${JSON.stringify(key)}:${canonicalJson(value[key])}`
  )).join(",")}}`;
}

function base64Url(bytes) {
  return Buffer.from(bytes).toString("base64url");
}

async function sha256(value) {
  return Buffer.from(await webcrypto.subtle.digest("SHA-256", encoder.encode(value))).toString("hex");
}

export async function generateDeviceProofKeys() {
  const pair = await webcrypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const [privateKeyJwk, exportedPublic] = await Promise.all([
    webcrypto.subtle.exportKey("jwk", pair.privateKey),
    webcrypto.subtle.exportKey("jwk", pair.publicKey),
  ]);
  const publicKeyJwk = {
    kty: "EC",
    crv: "P-256",
    x: exportedPublic.x,
    y: exportedPublic.y,
  };
  return { privateKeyJwk, publicKeyJwk };
}

export async function deviceProofHeaders({
  privateKeyJwk,
  subject,
  method,
  url,
  body,
  now = Date.now(),
}) {
  if (!privateKeyJwk) return {};
  const timestamp = String(Math.floor(now / 1000));
  const target = new URL(url);
  const bodyHash = await sha256(canonicalJson(body));
  const canonical = [
    "tokensburned-proof-v1",
    subject,
    method.toUpperCase(),
    `${target.origin}${target.pathname}${target.search}`,
    timestamp,
    bodyHash,
  ].join("\n");
  const key = await webcrypto.subtle.importKey(
    "jwk",
    privateKeyJwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const signature = await webcrypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    encoder.encode(canonical),
  );
  return {
    "X-TokensBurned-Timestamp": timestamp,
    "X-TokensBurned-Proof": base64Url(signature),
  };
}

export const deviceProofInternals = { canonicalJson };
