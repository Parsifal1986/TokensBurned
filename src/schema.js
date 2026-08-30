import {
  KNOWN_CONFIDENCE,
  KNOWN_ENDPOINT_TYPES,
  KNOWN_PROVIDERS,
} from "./constants.js";
import { stableHash, toFiniteInteger } from "./utils.js";

const USAGE_ALIASES = {
  input_tokens: ["input_tokens", "inputTokens", "prompt_tokens", "promptTokens"],
  output_tokens: ["output_tokens", "outputTokens", "completion_tokens", "completionTokens"],
  cache_read_tokens: ["cache_read_tokens", "cacheReadTokens", "cache_read_input_tokens"],
  cache_write_tokens: ["cache_write_tokens", "cacheWriteTokens", "cache_creation_input_tokens"],
};

function firstValue(source, keys) {
  for (const key of keys) {
    if (source?.[key] !== undefined) return source[key];
  }
  return undefined;
}

function stringOrUndefined(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function normalizeUsage(raw = {}) {
  const usageSource = raw.usage && typeof raw.usage === "object" ? raw.usage : raw;
  const usage = {};
  for (const [canonical, aliases] of Object.entries(USAGE_ALIASES)) {
    usage[canonical] = toFiniteInteger(firstValue(usageSource, aliases));
  }
  return usage;
}

export function normalizeBackend(raw = {}) {
  const source = raw.backend && typeof raw.backend === "object" ? raw.backend : raw;
  let provider = stringOrUndefined(source.provider)?.toLowerCase() || "unknown";
  if (!KNOWN_PROVIDERS.has(provider)) provider = "custom";

  let confidence = stringOrUndefined(source.confidence)?.toLowerCase() || "unknown";
  if (!KNOWN_CONFIDENCE.has(confidence)) confidence = "unknown";

  let endpointType =
    stringOrUndefined(source.endpoint_type ?? source.endpointType)?.toLowerCase() || "unknown";
  if (!KNOWN_ENDPOINT_TYPES.has(endpointType)) endpointType = "unknown";

  return {
    provider,
    reported_model: stringOrUndefined(
      source.reported_model ?? source.reportedModel ?? source.model,
    ),
    resolved_model: stringOrUndefined(source.resolved_model ?? source.resolvedModel),
    endpoint_type: endpointType,
    confidence,
  };
}

export function normalizeEvent(raw, defaults = {}) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Usage event must be a JSON object.");
  }

  const harnessSource =
    raw.harness && typeof raw.harness === "object" ? raw.harness : {};
  const harnessId = String(
    harnessSource.id ?? raw.harness_id ?? defaults.harnessId ?? "unknown",
  )
    .trim()
    .toLowerCase();
  const timestamp = new Date(raw.timestamp ?? defaults.timestamp ?? Date.now());
  if (Number.isNaN(timestamp.getTime())) throw new Error("Usage event has an invalid timestamp.");

  const event = {
    timestamp: timestamp.toISOString(),
    harness: {
      id: harnessId || "unknown",
      version: stringOrUndefined(harnessSource.version ?? raw.harness_version),
    },
    backend: normalizeBackend(raw.backend ?? defaults.backend ?? {}),
    usage: normalizeUsage(raw),
  };

  const total = Object.values(event.usage).reduce((sum, value) => sum + value, 0);
  if (total === 0) throw new Error("Usage event contains no token counts.");

  return {
    ...event,
    id: stringOrUndefined(raw.id ?? raw.event_id) || stableHash(event),
  };
}

// Hook payloads differ between harness releases. This function deliberately copies
// only allow-listed identity and usage fields. Prompt, response, transcript and code
// fields are never traversed or retained.
export function eventFromHookPayload(payload, harnessId, backend) {
  const candidates = [
    payload?.usage,
    payload?.token_usage,
    payload?.message?.usage,
    payload?.response?.usage,
    payload?.event?.usage,
  ].filter((candidate) => candidate && typeof candidate === "object");

  if (candidates.length === 0) return null;

  const usage = normalizeUsage(candidates[0]);
  if (Object.values(usage).every((value) => value === 0)) return null;

  return normalizeEvent({
    id: payload.event_id ?? payload.id,
    timestamp: payload.timestamp ?? new Date().toISOString(),
    harness: {
      id: harnessId,
      version: payload.harness_version ?? payload.version,
    },
    backend: {
      ...backend,
      reported_model:
        backend?.reported_model ?? payload.model ?? payload.model_name ?? undefined,
      confidence:
        backend?.confidence === "unknown" && (payload.model ?? payload.model_name)
          ? "reported"
          : backend?.confidence,
    },
    usage,
  });
}
