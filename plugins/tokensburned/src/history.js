import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { stableHash, toFiniteInteger } from "./utils.js";

const BUCKET_SECONDS = 15 * 60;
const MAX_DAYS = 90;

export function historyRoots(home = os.homedir()) {
  return {
    codex: path.join(home, ".codex", "sessions"),
    "claude-code": path.join(home, ".claude", "projects"),
  };
}

function cleanModel(value) {
  if (typeof value !== "string") return "unknown";
  const model = value.trim().replace(/[\u0000-\u001f]/g, "");
  return model ? model.slice(0, 160) : "unknown";
}

function usage(raw = {}, { codex = false } = {}) {
  const rawInput = toFiniteInteger(raw.input_tokens);
  const rawOutput = toFiniteInteger(raw.output_tokens);
  const cacheRead = toFiniteInteger(raw.cached_input_tokens ?? raw.cache_read_input_tokens);
  const cacheWrite = toFiniteInteger(raw.cache_creation_input_tokens);
  const reasoning = toFiniteInteger(raw.reasoning_output_tokens);
  return {
    input: codex ? Math.max(0, rawInput - Math.min(rawInput, cacheRead)) : rawInput,
    output: codex ? Math.max(0, rawOutput - Math.min(rawOutput, reasoning)) : rawOutput,
    cache_read: cacheRead,
    cache_write: cacheWrite,
    reasoning: codex ? Math.min(rawOutput, reasoning) : 0,
  };
}

function total(counts) {
  return counts.input + counts.output + counts.cache_read + counts.cache_write + counts.reasoning;
}

function delta(current, previous) {
  const result = {};
  for (const key of ["input", "output", "cache_read", "cache_write", "reasoning"]) {
    const difference = current[key] - previous[key];
    result[key] = difference >= 0 ? difference : current[key];
  }
  return result;
}

function timestamp(value) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function bucketFor(date) {
  return Math.floor(date.getTime() / 1000 / BUCKET_SECONDS);
}

function addBucket(buckets, { bucket, model, counts, revision }) {
  if (total(counts) === 0) return;
  const key = `${bucket}\u0000${model}`;
  const row = buckets.get(key) || {
    bucket,
    model,
    revision: 1,
    input: 0,
    output: 0,
    cache_read: 0,
    cache_write: 0,
    reasoning: 0,
    requests: 0,
  };
  row.revision = Math.max(row.revision, revision);
  row.input += counts.input;
  row.output += counts.output;
  row.cache_read += counts.cache_read;
  row.cache_write += counts.cache_write;
  row.reasoning += counts.reasoning;
  row.requests += 1;
  buckets.set(key, row);
}

async function assertAllowedFile(file, root) {
  const [realFile, realRoot] = await Promise.all([fsp.realpath(file), fsp.realpath(root)]);
  const relative = path.relative(realRoot, realFile);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("History file is outside the selected harness history directory.");
  }
  return { realFile, relative };
}

async function parseCodex(realFile, minimumBucket) {
  const buckets = new Map();
  let currentModel = "unknown";
  let previous = usage({}, { codex: true });
  let sessionId;
  let lineNumber = 0;
  const lines = readline.createInterface({
    input: fs.createReadStream(realFile, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  for await (const line of lines) {
    lineNumber += 1;
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }
    const payload = record?.payload;
    if (!payload || typeof payload !== "object") continue;
    if (!sessionId && typeof payload.session_id === "string") sessionId = payload.session_id;
    if (payload.type === "turn_context") currentModel = cleanModel(payload.model);
    if (payload.type !== "token_count") continue;
    const raw = payload.info?.total_token_usage;
    const observed = timestamp(record.timestamp);
    if (!raw || !observed) continue;
    const current = usage(raw, { codex: true });
    const counts = delta(current, previous);
    previous = current;
    const bucket = bucketFor(observed);
    if (bucket < minimumBucket) continue;
    addBucket(buckets, { bucket, model: currentModel, counts, revision: lineNumber });
  }
  return { buckets, sessionId };
}

async function parseClaude(realFile, minimumBucket) {
  const messages = new Map();
  let sessionId;
  let lineNumber = 0;
  const lines = readline.createInterface({
    input: fs.createReadStream(realFile, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  for await (const line of lines) {
    lineNumber += 1;
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }
    if (!sessionId && typeof record?.sessionId === "string") sessionId = record.sessionId;
    const message = record?.type === "assistant" ? record.message : null;
    const observed = timestamp(record?.timestamp);
    if (!message?.usage || !observed) continue;
    const bucket = bucketFor(observed);
    if (bucket < minimumBucket) continue;
    const messageId = String(message.id || record.uuid || `${lineNumber}`);
    messages.set(messageId, {
      bucket,
      model: cleanModel(message.model),
      counts: usage(message.usage),
      revision: lineNumber,
    });
  }
  const buckets = new Map();
  for (const message of messages.values()) addBucket(buckets, message);
  return { buckets, sessionId };
}

export async function parseHistoryFile(file, {
  harness,
  backend = {},
  root = historyRoots()[harness],
  now = Date.now(),
  days = MAX_DAYS,
} = {}) {
  if (!new Set(["codex", "claude-code"]).has(harness)) {
    throw new Error(`Unsupported history harness: ${harness}`);
  }
  const range = Math.max(1, Math.min(MAX_DAYS, toFiniteInteger(days, MAX_DAYS)));
  const minimumBucket = Math.floor(now / 1000 / BUCKET_SECONDS) - range * 96;
  const { realFile, relative } = await assertAllowedFile(file, root);
  const parsed = harness === "codex"
    ? await parseCodex(realFile, minimumBucket)
    : await parseClaude(realFile, minimumBucket);
  const session = stableHash({ harness, session: parsed.sessionId || relative });
  return [...parsed.buckets.values()].map((row) => ({
    ...row,
    session,
    harness,
    provider: backend.provider || "unknown",
  }));
}

async function walkJsonl(root, minimumMtime) {
  const files = [];
  const pending = [root];
  while (pending.length) {
    const directory = pending.pop();
    let entries;
    try {
      entries = await fsp.readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw error;
    }
    for (const entry of entries) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) pending.push(file);
      else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        const stat = await fsp.stat(file);
        if (stat.mtimeMs >= minimumMtime) files.push(file);
      }
    }
  }
  return files.sort();
}

export async function collectHistoryEntries({
  harnesses = ["codex", "claude-code"],
  roots = historyRoots(),
  backendByHarness = {},
  now = Date.now(),
  days = MAX_DAYS,
  filesByHarness,
  onFile,
} = {}) {
  const range = Math.max(1, Math.min(MAX_DAYS, toFiniteInteger(days, MAX_DAYS)));
  const minimumMtime = now - range * 24 * 60 * 60 * 1000;
  const entries = [];
  const summary = {};
  for (const harness of harnesses) {
    const files = filesByHarness?.[harness] || await walkJsonl(roots[harness], minimumMtime);
    let acceptedFiles = 0;
    for (const file of files) {
      const rows = await parseHistoryFile(file, {
        harness,
        root: roots[harness],
        backend: backendByHarness[harness],
        now,
        days: range,
      });
      if (rows.length) acceptedFiles += 1;
      entries.push(...rows);
      onFile?.({ harness, rows: rows.length });
    }
    summary[harness] = { files: files.length, files_with_usage: acceptedFiles };
  }
  return { entries, summary, days: range };
}
