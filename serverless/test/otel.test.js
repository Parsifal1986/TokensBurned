import test from "node:test";
import assert from "node:assert/strict";
import {
  parseClaudeMetrics,
  parseCodexLogs,
  parseGenAiLogs,
  parseGenAiSpans,
} from "../src/otel.js";

function attr(key, value) {
  const typed = typeof value === "number"
    ? { intValue: String(value) }
    : { stringValue: value };
  return { key, value: typed };
}

test("allow-lists Claude token metrics without retaining identity attributes", async () => {
  const payload = {
    resourceMetrics: [{
      resource: { attributes: [attr("user.email", "private@example.com")] },
      scopeMetrics: [{ metrics: [{
        name: "claude_code.token.usage",
        sum: { dataPoints: [{
          attributes: [attr("type", "input"), attr("model", "claude-opus-4-1")],
          asInt: "4200",
          timeUnixNano: "1788091200000000000",
        }] },
      }, {
        name: "claude_code.cost.usage",
        sum: { dataPoints: [{ asInt: "999" }] },
      }] }],
    }],
  };
  const events = await parseClaudeMetrics(payload, "dev_123");
  assert.equal(events.length, 1);
  assert.equal(events[0].input_tokens, 4200);
  assert.equal(events[0].model, "claude-opus-4-1");
  assert.equal(JSON.stringify(events).includes("private@example.com"), false);
});

test("accepts only Codex response.completed token events", async () => {
  const completed = {
    timeUnixNano: "1788091200000000000",
    attributes: [
      attr("event.name", "codex.sse_event"),
      attr("event.kind", "response.completed"),
      attr("model", "gpt-5.6-sol"),
      attr("input_token_count", 900),
      attr("output_token_count", 100),
      attr("cached_input_token_count", 400),
      attr("reasoning_output_token_count", 25),
      attr("tool.output", "must-not-survive"),
    ],
  };
  const ignored = {
    attributes: [attr("event.name", "codex.tool_result"), attr("output_token_count", 999)],
  };
  const events = await parseCodexLogs({
    resourceLogs: [{ scopeLogs: [{ logRecords: [completed, ignored] }] }],
  }, "dev_123");
  assert.equal(events.length, 1);
  assert.equal(events[0].input_tokens, 500);
  assert.equal(events[0].output_tokens, 75);
  assert.equal(events[0].cache_read_tokens, 400);
  assert.equal(events[0].reasoning_tokens, 25);
  assert.equal(JSON.stringify(events).includes("must-not-survive"), false);
});

test("accepts standard GenAI usage logs from Gemini CLI and discards message content", async () => {
  const record = {
    timeUnixNano: "1788091200000000000",
    attributes: [
      attr("event.name", "gen_ai.client.inference.operation.details"),
      attr("gen_ai.agent.name", "gemini-cli"),
      attr("gen_ai.provider.name", "google"),
      attr("gen_ai.response.model", "gemini-2.5-pro"),
      attr("gen_ai.usage.input_tokens", 1000),
      attr("gen_ai.usage.output_tokens", 200),
      attr("gen_ai.input.messages", "private prompt"),
    ],
  };
  const events = await parseGenAiLogs({
    resourceLogs: [{ scopeLogs: [{ logRecords: [record] }] }],
  }, "dev_123");
  assert.equal(events.length, 1);
  assert.equal(events[0].harness, "gemini-cli");
  assert.equal(events[0].provider, "google");
  assert.equal(events[0].model, "gemini-2.5-pro");
  assert.equal(events[0].input_tokens, 1000);
  assert.equal(JSON.stringify(events).includes("private prompt"), false);
});

test("accepts standard GenAI span usage for additional harnesses", async () => {
  const events = await parseGenAiSpans({
    resourceSpans: [{
      resource: { attributes: [attr("service.name", "OpenCode-AI")] },
      scopeSpans: [{ spans: [{
        traceId: "trace",
        spanId: "span",
        endTimeUnixNano: "1788091200000000000",
        attributes: [
          attr("gen_ai.request.model", "anthropic/claude-sonnet-4"),
          attr("gen_ai.usage.input_tokens", 700),
          attr("gen_ai.usage.output_tokens", 100),
        ],
      }] }],
    }],
  }, "dev_123");
  assert.equal(events.length, 1);
  assert.equal(events[0].harness, "opencode");
  assert.equal(events[0].provider, "anthropic");
  assert.equal(events[0].model, "claude-sonnet-4");
});
