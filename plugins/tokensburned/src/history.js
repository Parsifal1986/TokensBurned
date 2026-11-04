import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import zlib from "node:zlib";
import { stableHash, toFiniteInteger } from "./utils.js";
import { readOpenCodeUsage, openCodeDatabase } from "./opencode-usage.js";
import { readGeminiUsage, geminiHistoryRoot } from "./gemini-usage.js";
import { readClineUsage, clineHistoryRoot } from "./cline-usage.js";
import { readPiUsage, piSessionRoots } from "./pi-usage.js";
import { readGrokUsage, grokSessionsRoot } from "./grok-usage.js";

export const HISTORY_SOURCES = ["claude-code", "codex", "gemini-cli", "opencode", "cline", "pi", "grok-build"];

const BUCKET_SECONDS = 15 * 60;
const MAX_DAYS = 90;

export function historyRoots(home = os.homedir()) {
  return {
    codex: path.join(home, ".codex", "sessions"),
    "claude-code": path.join(home, ".claude", "projects"),
    "gemini-cli": geminiHistoryRoot(process.env, home),
    opencode: openCodeDatabase(process.env, home),
    cline: clineHistoryRoot(process.env, home),
    pi: piSessionRoots(process.env, home),
    "grok-build": grokSessionsRoot(process.env, home),
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

function addBucket(buckets, { bucket, model, counts, revision, retract = false }) {
  if (!retract && total(counts) === 0) return;
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
  if (!retract) row.requests += 1;
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

// Codex compresses rollouts older than about a week to `.jsonl.zst`. Node
// gained zstd in 22.15/23.8; older runtimes skip those files instead of failing.
export const ZSTD_SUPPORTED = typeof zlib.createZstdDecompress === "function";

function isHistoryFile(name) {
  return name.endsWith(".jsonl") || (ZSTD_SUPPORTED && name.endsWith(".jsonl.zst"));
}

function historyLines(realFile) {
  const raw = fs.createReadStream(realFile);
  const input = realFile.endsWith(".zst") ? raw.pipe(zlib.createZstdDecompress()) : raw;
  input.setEncoding("utf8");
  return readline.createInterface({ input, crlfDelay: Infinity });
}

async function parseCodex(realFile, minimumBucket) {
  const buckets = new Map();
  let currentModel = "unknown";
  let previous = usage({}, { codex: true });
  let sessionId;
  let lineNumber = 0;
  const lines = historyLines(realFile);
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
    // Codex has emitted turn context in two shapes over time:
    //   { type: "event_msg", payload: { type: "turn_context", model } }
    //   { type: "turn_context", payload: { model } }
    // Accept both so newer desktop rollouts do not lose their model identity.
    if (record.type === "turn_context" || payload.type === "turn_context") {
      currentModel = cleanModel(payload.model);
    }
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

// A Claude Code transcript starts at its session's creation. Forked and
// resumed desktop sessions copy earlier messages, with their original ids and
// timestamps, into the new file, so a message older than the file's first
// record is a copy.
async function readClaude(realFile, onMessage) {
  let sessionId;
  let startedAt;
  let lineNumber = 0;
  for await (const line of historyLines(realFile)) {
    lineNumber += 1;
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }
    if (!sessionId && typeof record?.sessionId === "string") sessionId = record.sessionId;
    const observed = timestamp(record?.timestamp);
    if (observed && startedAt === undefined) startedAt = observed.getTime();
    const message = record?.type === "assistant" ? record.message : null;
    if (!message?.usage || !observed) continue;
    onMessage({ record, message, observed, lineNumber, copied: observed.getTime() < startedAt });
  }
  return sessionId;
}

// Count a copied message only where it originated: skip it when a sibling
// transcript holds it as its own, or when another copy belongs to a session
// that sorts first (the original was deleted).
async function claudeCopiesCountedElsewhere(realFile, sessionId, copied) {
  const skipped = new Set();
  const earliest = Math.min(...copied.values());
  const directory = path.dirname(realFile);
  for (const entry of await fsp.readdir(directory, { withFileTypes: true })) {
    const sibling = path.join(directory, entry.name);
    if (!entry.isFile() || !entry.name.endsWith(".jsonl") || sibling === realFile) continue;
    // A sibling written before the copied messages cannot hold them.
    if ((await fsp.stat(sibling)).mtimeMs < earliest) continue;
    // One linear scan of the raw text before parsing any JSON.
    const text = await fsp.readFile(sibling, "utf8");
    let holds = false;
    for (const [, id] of text.matchAll(/"id":"([^"\\]+)"/g)) {
      if (copied.has(id)) { holds = true; break; }
    }
    if (!holds) continue;
    const originals = new Set();
    const present = new Set();
    const otherSession = await readClaude(sibling, ({ message, copied: isCopy }) => {
      if (!copied.has(message.id)) return;
      present.add(message.id);
      if (!isCopy) originals.add(message.id);
    }) || path.basename(sibling, ".jsonl");
    for (const id of otherSession < sessionId ? present : originals) skipped.add(id);
  }
  return skipped;
}

async function parseClaude(realFile, minimumBucket) {
  const messages = new Map();
  const copied = new Map();
  const sessionId = await readClaude(realFile, ({ record, message, observed, lineNumber, copied: isCopy }) => {
    const bucket = bucketFor(observed);
    if (bucket < minimumBucket) return;
    const messageId = String(message.id || record.uuid || `${lineNumber}`);
    if (isCopy && message.id) copied.set(messageId, observed.getTime());
    messages.set(messageId, {
      bucket,
      model: cleanModel(message.model),
      counts: usage(message.usage),
      revision: lineNumber,
    });
  });
  const skipped = copied.size
    ? await claudeCopiesCountedElsewhere(realFile, sessionId || path.basename(realFile, ".jsonl"), copied)
    : new Set();
  const buckets = new Map();
  for (const [id, message] of messages) {
    // An empty row replaces this session's earlier, double-counted snapshot.
    if (skipped.has(id)) addBucket(buckets, { ...message, counts: usage(), retract: true });
    else addBucket(buckets, message);
  }
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
      else if (entry.isFile() && isHistoryFile(entry.name)) {
        const stat = await fsp.stat(file);
        if (stat.mtimeMs >= minimumMtime) files.push(file);
      }
    }
  }
  // While Codex replaces a rollout with its compressed copy, read the plain one.
  const plain = new Set(files.filter((file) => file.endsWith(".jsonl")));
  return files.filter((file) => !file.endsWith(".zst") || !plain.has(file.slice(0, -4))).sort();
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
    if (!HISTORY_SOURCES.includes(harness)) throw new Error(`Unsupported history harness: ${harness}`);
    const native = { "gemini-cli": readGeminiUsage, opencode: readOpenCodeUsage, cline: readClineUsage, pi: readPiUsage, "grok-build": readGrokUsage }[harness];
    if (native) {
      if (filesByHarness?.[harness]) throw new Error("Native usage backfill requires a history root, not individual transcript files");
      const rows = await native({ ...(harness === "opencode" ? { file: roots[harness] } : { root: roots[harness] }), now, days: range });
      entries.push(...rows);
      summary[harness] = { files: 0, files_with_usage: 0, observations: rows.length };
      continue;
    }
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
