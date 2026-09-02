import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { syncUsageEntries } from "../../src/server-outbox.js";

const session = crypto.createHash("sha256")
  .update(`cline:${process.pid}:${crypto.randomUUID()}`)
  .digest("hex");
const snapshots = new Map();

function count(value) {
  const number = Number(value || 0);
  return Number.isSafeInteger(number) && number > 0 ? number : 0;
}

function safeDimension(value, fallback = "unknown") {
  const normalized = String(value || fallback).trim().toLowerCase().replace(/[^a-z0-9._-]/g, "-");
  return /^[a-z0-9]/.test(normalized) ? normalized.slice(0, 64) : fallback;
}

async function connection() {
  const root = path.join(os.homedir(), ".burn");
  const [credentials, config] = await Promise.all([
    fs.readFile(path.join(root, "credentials.json"), "utf8").then(JSON.parse),
    fs.readFile(path.join(root, "config.json"), "utf8").then(JSON.parse),
  ]);
  if (!credentials.device_token || !config.server?.enabled) return null;
  return {
    token: credentials.device_token,
    origin: String(config.server.api_origin || "https://api.tokensburned.com").replace(/\/$/, ""),
  };
}

async function uploadUsage(context) {
  try {
    const usage = context?.result?.usage || {};
    const input = count(usage.inputTokens ?? usage.input_tokens);
    const output = count(usage.outputTokens ?? usage.output_tokens);
    const cacheRead = count(usage.cacheReadTokens ?? usage.cache_read_tokens);
    const cacheWrite = count(usage.cacheWriteTokens ?? usage.cache_write_tokens);
    if (input + output + cacheRead + cacheWrite === 0) return;
    const bucket = Math.floor(Date.now() / 1000 / 900);
    const previous = snapshots.get(bucket) || {
      input: 0, output: 0, cache_read: 0, cache_write: 0, reasoning: 0, requests: 0, revision: 0,
    };
    const current = {
      ...previous,
      input: previous.input + input,
      output: previous.output + output,
      cache_read: previous.cache_read + cacheRead,
      cache_write: previous.cache_write + cacheWrite,
      requests: previous.requests + 1,
      revision: previous.revision + 1,
    };
    snapshots.set(bucket, current);
    const connected = await connection();
    if (!connected) return;
    const provider = safeDimension(context?.result?.providerId ?? context?.providerId);
    const model = String(context?.result?.modelId ?? context?.modelId ?? "unknown").slice(0, 160);
    await syncUsageEntries([{
        bucket, session, harness: "cline", provider, model,
        ...current,
      }], {
      token: connected.token,
      apiOrigin: connected.origin,
      timeoutMs: 2500,
      minIntervalMs: 60 * 60 * 1000,
    });
  } catch {
    // Telemetry must never delay or break the Cline run.
  }
}

const plugin = {
  name: "tokensburned",
  manifest: { capabilities: ["hooks"] },
  setup() {},
  hooks: { afterRun: uploadUsage },
};

export default plugin;
