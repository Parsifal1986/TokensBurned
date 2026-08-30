import { stableId } from "./crypto.js";
import { HttpError } from "./http.js";
import { identifyDimensions } from "./identity.js";
import { BUCKET_SECONDS } from "./protocol.js";

const INSERT_EVENT = `INSERT OR IGNORE INTO usage_events (
  id, device_id, bucket, harness, provider, model,
  input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
  reasoning_tokens, request_count, observed_at, created_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

function otelValue(value) {
  if (!value || typeof value !== "object") return value;
  if ("stringValue" in value) return value.stringValue;
  if ("intValue" in value) return Number(value.intValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("boolValue" in value) return Boolean(value.boolValue);
  if (value.arrayValue?.values) return value.arrayValue.values.map(otelValue);
  if (value.kvlistValue?.values) return attributes(value.kvlistValue.values);
  return undefined;
}

function attributes(items = []) {
  const result = {};
  for (const item of items) {
    if (typeof item?.key === "string") result[item.key] = otelValue(item.value);
  }
  return result;
}

function first(source, keys, fallback) {
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null && source[key] !== "") return source[key];
  }
  return fallback;
}

function count(value) {
  const parsed = Number(value ?? 0);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function unixNanoToDate(value, fallback = Date.now()) {
  if (value === undefined || value === null || value === "") return new Date(fallback);
  try {
    return new Date(Number(BigInt(String(value)) / 1_000_000n));
  } catch {
    return new Date(fallback);
  }
}

function emptyCounts() {
  return {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_tokens: 0,
    cache_write_tokens: 0,
    reasoning_tokens: 0,
    request_count: 0,
  };
}

function dimensions(attrs, fallbackHarness) {
  return identifyDimensions({
    harness: first(attrs, [
      "tokensburned.harness", "gen_ai.agent.name", "service.name",
      "process.executable.name", "process.command",
    ], fallbackHarness),
    provider: first(attrs, [
      "gen_ai.provider.name", "gen_ai.system", "provider", "provider.id",
      "provider_id", "model_provider",
    ], "unknown"),
    model: first(attrs, [
      "gen_ai.response.model", "gen_ai.request.model", "model", "model.id",
      "model_id", "model_name",
    ], "unknown"),
  });
}

function tokenField(type) {
  const normalized = String(type || "").toLowerCase().replace(/[._ -]/g, "");
  if (["input", "inputtokens", "prompt", "prompttokens"].includes(normalized)) return "input_tokens";
  if (["output", "outputtokens", "completion", "completiontokens"].includes(normalized)) return "output_tokens";
  if (["cacheread", "cachereadtokens", "cachedinput", "cachedinputtokens"].includes(normalized)) return "cache_read_tokens";
  if (["cachecreation", "cachewrite", "cachewritetokens"].includes(normalized)) return "cache_write_tokens";
  if (["reasoning", "reasoningtokens", "reasoningoutput"].includes(normalized)) return "reasoning_tokens";
  return null;
}

export async function parseClaudeMetrics(payload, deviceId, now = Date.now()) {
  const events = [];
  for (const resourceMetric of payload?.resourceMetrics || []) {
    const resource = attributes(resourceMetric.resource?.attributes);
    for (const scopeMetric of resourceMetric.scopeMetrics || []) {
      for (const metric of scopeMetric.metrics || []) {
        if (metric.name !== "claude_code.token.usage") continue;
        const points = metric.sum?.dataPoints || metric.gauge?.dataPoints || [];
        for (const point of points) {
          const attrs = { ...resource, ...attributes(point.attributes) };
          const field = tokenField(first(attrs, ["type", "token.type", "token_type"]));
          const value = count(point.asInt ?? point.asDouble);
          if (!field || value === 0) continue;
          const observed = unixNanoToDate(point.timeUnixNano, now);
          const counts = emptyCounts();
          counts[field] = value;
          const identity = {
            signal: "claude-metric",
            deviceId,
            timeUnixNano: String(point.timeUnixNano || observed.getTime() * 1_000_000),
            type: field,
            value,
            model: first(attrs, ["model", "model.id", "model_id"], "unknown"),
          };
          const identityDimensions = dimensions(attrs, "claude-code");
          events.push({
            id: await stableId(identity),
            bucket: Math.floor(observed.getTime() / 1000 / BUCKET_SECONDS),
            ...identityDimensions,
            observed_at: observed.toISOString(),
            ...counts,
          });
        }
      }
    }
  }
  return events;
}

const TOKEN_KEYS = {
  input_tokens: ["input_token_count", "input_tokens", "usage.input_tokens", "tokens.input"],
  output_tokens: ["output_token_count", "output_tokens", "usage.output_tokens", "tokens.output"],
  cache_read_tokens: ["cached_input_token_count", "cached_input_tokens", "cache_read_tokens", "usage.cache_read_tokens"],
  cache_write_tokens: ["cache_write_token_count", "cache_write_tokens", "usage.cache_write_tokens"],
  reasoning_tokens: ["reasoning_output_token_count", "reasoning_tokens", "usage.reasoning_tokens"],
};

export async function parseCodexLogs(payload, deviceId, now = Date.now()) {
  const events = [];
  for (const resourceLog of payload?.resourceLogs || []) {
    const resource = attributes(resourceLog.resource?.attributes);
    for (const scopeLog of resourceLog.scopeLogs || []) {
      for (const record of scopeLog.logRecords || []) {
        const attrs = { ...resource, ...attributes(record.attributes) };
        const name = String(first(attrs, ["event.name", "event_name", "name"], ""));
        const kind = String(first(attrs, ["event.kind", "event_kind", "sse.event_kind", "kind"], ""));
        if (name !== "codex.sse_event" || kind !== "response.completed") continue;

        const counts = emptyCounts();
        for (const [field, aliases] of Object.entries(TOKEN_KEYS)) {
          counts[field] = count(first(attrs, aliases, 0));
        }
        // Codex reports cached input as a subset of input and reasoning as a
        // subset of output. Store non-overlapping categories so totals remain
        // exact when the aggregate query sums every category.
        counts.cache_read_tokens = Math.min(counts.input_tokens, counts.cache_read_tokens);
        counts.reasoning_tokens = Math.min(counts.output_tokens, counts.reasoning_tokens);
        counts.input_tokens -= counts.cache_read_tokens;
        counts.output_tokens -= counts.reasoning_tokens;
        counts.request_count = 1;
        if (Object.entries(counts).every(([key, value]) => key === "request_count" || value === 0)) continue;

        const observed = unixNanoToDate(record.timeUnixNano ?? record.observedTimeUnixNano, now);
        const identity = {
          signal: "codex-log",
          deviceId,
          timeUnixNano: String(record.timeUnixNano || observed.getTime() * 1_000_000),
          conversation: first(attrs, ["conversation.id", "conversation_id", "session.id"], "unknown"),
          turn: first(attrs, ["turn.id", "turn_id"], "unknown"),
          counts,
        };
        const identityDimensions = dimensions(attrs, "codex");
        events.push({
          id: await stableId(identity),
          bucket: Math.floor(observed.getTime() / 1000 / BUCKET_SECONDS),
          ...identityDimensions,
          observed_at: observed.toISOString(),
          ...counts,
        });
      }
    }
  }
  return events;
}

function usageCounts(attrs) {
  const result = emptyCounts();
  result.input_tokens = count(first(attrs, [
    "gen_ai.usage.input_tokens", "input_token_count", "input_tokens",
    "usage.input_tokens", "prompt_tokens",
  ], 0));
  result.output_tokens = count(first(attrs, [
    "gen_ai.usage.output_tokens", "output_token_count", "output_tokens",
    "usage.output_tokens", "completion_tokens",
  ], 0));
  result.cache_read_tokens = count(first(attrs, [
    "gen_ai.usage.cache_read.input_tokens", "cached_content_token_count",
    "cached_input_token_count", "cache_read_tokens",
  ], 0));
  result.cache_write_tokens = count(first(attrs, [
    "gen_ai.usage.cache_write.input_tokens", "cache_creation_input_tokens",
    "cache_write_tokens",
  ], 0));
  result.reasoning_tokens = count(first(attrs, [
    "gen_ai.usage.reasoning.output_tokens", "thoughts_token_count",
    "reasoning_output_token_count", "reasoning_tokens",
  ], 0));
  // Cache and reasoning are usually subsets of input/output in GenAI semantic
  // conventions. Store disjoint categories so SUM remains exact.
  result.cache_read_tokens = Math.min(result.input_tokens, result.cache_read_tokens);
  result.reasoning_tokens = Math.min(result.output_tokens, result.reasoning_tokens);
  result.input_tokens -= result.cache_read_tokens;
  result.output_tokens -= result.reasoning_tokens;
  result.request_count = 1;
  return result;
}

function hasTokens(counts) {
  return counts.input_tokens + counts.output_tokens + counts.cache_read_tokens +
    counts.cache_write_tokens + counts.reasoning_tokens > 0;
}

function genericEventName(attrs, record) {
  return String(first(attrs, ["event.name", "event_name", "name"], record?.name || ""));
}

export async function parseGenAiLogs(payload, deviceId, now = Date.now()) {
  const events = [];
  for (const resourceLog of payload?.resourceLogs || []) {
    const resource = attributes(resourceLog.resource?.attributes);
    for (const scopeLog of resourceLog.scopeLogs || []) {
      for (const record of scopeLog.logRecords || []) {
        const attrs = { ...resource, ...attributes(record.attributes) };
        const name = genericEventName(attrs, record);
        if (!["gen_ai.client.inference.operation.details", "gemini_cli.api_response"].includes(name)) continue;
        const counts = usageCounts(attrs);
        if (!hasTokens(counts)) continue;
        const observed = unixNanoToDate(record.timeUnixNano ?? record.observedTimeUnixNano, now);
        const dims = dimensions(attrs, name.startsWith("gemini_cli") ? "gemini-cli" : "unknown");
        const identity = {
          signal: "gen-ai-log",
          deviceId,
          timeUnixNano: String(record.timeUnixNano || observed.getTime() * 1_000_000),
          name,
          conversation: first(attrs, ["gen_ai.conversation.id", "session.id", "session_id"], "unknown"),
          operation: first(attrs, ["gen_ai.operation.name", "prompt_id", "request.id"], "unknown"),
          counts,
          ...dims,
        };
        events.push({
          id: await stableId(identity),
          bucket: Math.floor(observed.getTime() / 1000 / BUCKET_SECONDS),
          observed_at: observed.toISOString(),
          ...dims,
          ...counts,
        });
      }
    }
  }
  return events;
}

export async function parseGenAiSpans(payload, deviceId, now = Date.now()) {
  const events = [];
  for (const resourceSpan of payload?.resourceSpans || []) {
    const resource = attributes(resourceSpan.resource?.attributes);
    for (const scopeSpan of resourceSpan.scopeSpans || []) {
      for (const span of scopeSpan.spans || []) {
        const attrs = { ...resource, ...attributes(span.attributes) };
        const counts = usageCounts(attrs);
        if (!hasTokens(counts)) continue;
        const observed = unixNanoToDate(span.endTimeUnixNano ?? span.startTimeUnixNano, now);
        const dims = dimensions(attrs, "unknown");
        const identity = {
          signal: "gen-ai-span",
          deviceId,
          traceId: span.traceId || "unknown",
          spanId: span.spanId || "unknown",
          counts,
          ...dims,
        };
        events.push({
          id: await stableId(identity),
          bucket: Math.floor(observed.getTime() / 1000 / BUCKET_SECONDS),
          observed_at: observed.toISOString(),
          ...dims,
          ...counts,
        });
      }
    }
  }
  return events;
}

export async function parseGenAiMetrics(payload, deviceId, now = Date.now()) {
  const grouped = new Map();
  for (const resourceMetric of payload?.resourceMetrics || []) {
    const resource = attributes(resourceMetric.resource?.attributes);
    for (const scopeMetric of resourceMetric.scopeMetrics || []) {
      for (const metric of scopeMetric.metrics || []) {
        if (!["gen_ai.client.token.usage", "gemini_cli.token.usage"].includes(metric.name)) continue;
        const points = metric.sum?.dataPoints || metric.histogram?.dataPoints || metric.gauge?.dataPoints || [];
        for (const point of points) {
          const attrs = { ...resource, ...attributes(point.attributes) };
          const field = tokenField(first(attrs, ["gen_ai.token.type", "type", "token.type", "token_type"]));
          const value = count(point.asInt ?? point.asDouble ?? point.sum);
          if (!field || value === 0) continue;
          const observed = unixNanoToDate(point.timeUnixNano, now);
          const dims = dimensions(attrs, metric.name.startsWith("gemini_cli") ? "gemini-cli" : "unknown");
          const key = `${point.timeUnixNano || observed.getTime()}\0${dims.harness}\0${dims.provider}\0${dims.model}`;
          const row = grouped.get(key) || { observed, dims, counts: emptyCounts(), metric: metric.name };
          row.counts[field] += value;
          grouped.set(key, row);
        }
      }
    }
  }
  const events = [];
  for (const row of grouped.values()) {
    const identity = {
      signal: "gen-ai-metric", deviceId, metric: row.metric,
      observed: row.observed.toISOString(), counts: row.counts, ...row.dims,
    };
    events.push({
      id: await stableId(identity),
      bucket: Math.floor(row.observed.getTime() / 1000 / BUCKET_SECONDS),
      observed_at: row.observed.toISOString(),
      ...row.dims,
      ...row.counts,
    });
  }
  return events;
}

export async function ingestOtel(env, device, payload, signal, now = Date.now()) {
  const parsed = signal === "metrics"
    ? await Promise.all([
      parseClaudeMetrics(payload, device.id, now),
      parseGenAiMetrics(payload, device.id, now),
    ])
    : signal === "traces"
      ? [await parseGenAiSpans(payload, device.id, now)]
      : await Promise.all([
        parseCodexLogs(payload, device.id, now),
        parseGenAiLogs(payload, device.id, now),
      ]);
  const events = [...new Map(parsed.flat().map((event) => [event.id, event])).values()];
  if (events.length === 0) return { accepted: 0, filtered: true };
  if (events.length > 500) throw new HttpError(413, "too_many_points", "OTLP batch contains too many accepted points.");
  const createdAt = new Date(now).toISOString();
  const statements = events.map((event) => env.DB.prepare(INSERT_EVENT).bind(
    event.id,
    device.id,
    event.bucket,
    event.harness,
    event.provider,
    event.model,
    event.input_tokens,
    event.output_tokens,
    event.cache_read_tokens,
    event.cache_write_tokens,
    event.reasoning_tokens,
    event.request_count,
    event.observed_at,
    createdAt,
  ));
  statements.push(env.DB.prepare("UPDATE devices SET last_seen_at = ? WHERE id = ?").bind(createdAt, device.id));
  await env.DB.batch(statements);
  return { accepted: events.length, filtered: false };
}
