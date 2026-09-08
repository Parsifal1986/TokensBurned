# Explicit cloud usage import

`tokensburned ingest file.json` keeps its original **local statistics only** behavior. It does not update the API-hosted card. To queue observed usage for the connected account’s next normal sync, use `--upload` (queue-only; it does not start an upload):

```sh
tokensburned ingest usage.json --harness gemini-cli --upload --dry-run
tokensburned ingest usage.json --harness gemini-cli --upload
```

Dry run validates without credentials, file writes or networking. A real import requires `tokensburned connect` first. It only writes an idempotent local cloud outbox: it does not make network requests or launch an upload worker. Existing workers, subsequent hooks, `tokensburned update`, or `tokensburned sync --cloud` pick up these entries when the upload window permits. Without an existing worker or a later cloud sync, entries remain local. A successful server response’s next-flush time, per-day deferrals and retry backoff remain authoritative; manual import and legacy force callers cannot bypass them. Network failures retain pending data. It does not publish a private card or change account privacy. `tokensburned server` shows the cloud result; `doctor` distinguishes capture support from the latest queued usage.

## Integration fallback

Daily CLI use is now `connect` followed by `run`; see [local collection and command migration](cli-collection.md). Gemini, OpenCode v1/v2/legacy and Cline have format-scoped readers. Copilot requires the live extension. Cursor and Aider still need integrator-supplied observed requests; installing the CLI alone cannot collect their usage.

`ingest --upload` remains a queue-only compatibility entry point for integrators. Keep `run` active to transport the resulting queue on the shared server schedule. `sync --cloud` remains a deprecated compatibility flush; plain `sync` is retired and cannot write to GitHub. `update` checks releases and queues supported recent history before a scheduled flush; its forced release check never forces a usage upload.

## Input contract

Use an object or array of objects containing **finalized per-request deltas**, not cumulative session totals, estimates, `/tokens` context sizes or raw transcripts:

```json
{
  "id": "stable-provider-request-id",
  "timestamp": "2026-09-08T12:00:00Z",
  "usage_semantics": "exclusive-delta",
  "harness": { "id": "gemini-cli" },
  "backend": { "provider": "google", "model": "observed-model-id" },
  "usage": {
    "input_tokens": 800,
    "output_tokens": 150,
    "cache_read_tokens": 200,
    "cache_write_tokens": 0,
    "reasoning_tokens": 50
  },
  "request_count": 1
}
```

Replace the example ID, timestamp, model and counters with actual observed values. The example total is 1,200 tokens. `--harness`, `--provider` and `--model` provide defaults when those fields are absent; input fields take precedence.

- Each request has a stable, nonempty ID (up to 512 characters), unique within its harness. Keep IDs unchanged on retries. The client hashes IDs locally; IDs are not sent to the server.
- Timestamp is the request's completion time, with an explicit timezone, within the last 90 UTC days and not in the future. Re-importing a request must retain its original timestamp and counters.
- All five counters are **mutually exclusive**. If the provider's input includes cached input, subtract cache read/write from input. If output includes reasoning, subtract reasoning from output. If the provider already excludes these subsets, do not subtract them again. Use the provider's documented semantics; do not infer missing details from text or cost.
- Only canonical counter names are accepted inside `usage`; provider aliases are rejected for cloud imports instead of being silently discarded. Missing canonical counters mean zero. Values must be nonnegative integers within the server's limits. A zero-token observation is rejected.
- `request_count` defaults to 1; set it to the exact observed count (or 0 when unknown). Do not label a multi-call run as one API request.
- The same ID and content are a no-op across process restarts. Conflicting reuse of an ID rejects the batch before writing; generating a new ID to bypass a conflict will double count usage and is not a correction workflow.
- Unknown top-level content is not retained or uploaded. Still supply a token-only file, not a raw conversation. Dimensions are explicit, user-approved provider/model IDs; do not put project names or secrets in them.

Local `ingest` and cloud `ingest --upload` have separate stores. Cloud import intentionally does not mirror into legacy local statistics. Do not manually import requests already collected by an automatic adapter: IDs from two independent sources cannot establish that they represent the same underlying request.

## Cline capture contract

The Cline integration now uses `afterModel.assistantMessage` instead of cumulative `afterRun.result.usage`. It reads only `id`, `role`, `createdAt`, `metrics` and `modelInfo`; no content, tool payloads or conversation snapshots are traversed. Each finalized model message contributes one request at its completion time. All hosts must supply the compatible normalized Cline SDK contract; absence of this contract is not treated as successful capture.

The normalized SDK gateway input includes cache counters and output includes reasoning. TokensBurned separates those subsets before aggregation. Inconsistent custom-model counters are skipped rather than guessed. Missing model identity is reported as `unknown`. The hook performs local durable queuing; the existing worker handles networking outside the model callback.

Reference sources (checked 2026-09-08): [Cline AgentMessage and hook types](https://github.com/cline/cline/blob/main/sdk/packages/shared/src/agent.ts), [runtime per-message usage deltas](https://github.com/cline/cline/blob/main/sdk/packages/agents/src/agent-runtime.ts), [gateway normalized usage](https://github.com/cline/cline/blob/main/sdk/packages/llms/src/providers/ai-sdk.ts). Compatibility is tested with synthetic fixtures shaped like this contract, not a newly installed harness. Legacy hosts exposing only afterRun are not automatically supported.

Old incorrect Cline aggregates are not automatically subtracted: the old format did not retain the request identities needed to reconstruct them safely. This change corrects future collection; it does not claim to repair already-uploaded historical totals.

Integrators can use this fallback for unsupported hosts once observed usage is converted to the contract. Gemini, Copilot, OpenCode and Cline's supported native paths are documented in the collection guide; do not manually import the same requests under different IDs. Do not point OTLP exporters at the TokensBurned API.
