# Usage import for integrations

`tokensburned ingest file.json` keeps its original **local statistics only** behavior. It does not update the API-hosted card. To queue observed usage for the connected account’s next normal sync, use `--upload` (queue-only; it does not start an upload):

```sh
tokensburned ingest usage.json --harness gemini-cli --upload --dry-run
tokensburned ingest usage.json --harness gemini-cli --upload
```

`--dry-run` validates the file without connecting, uploading, or changing local data. Importing requires `tokensburned connect`. Imported usage stays in the local queue until the collector or a plugin uploads it; keep `tokensburned run` active to process the queue. Importing does not publish your card or change privacy settings.

Use this interface for integrations that can provide observed request usage. Prefer the [native collectors](cli-collection.md) when available, and never import records those collectors already track.

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
- Only canonical counter names are accepted inside `usage`; provider aliases are rejected for cloud imports instead of being silently discarded. Missing canonical counters mean zero. Values must be nonnegative integers accepted by the client validator. A zero-token observation is rejected.
- `request_count` defaults to 1; set it to the exact observed count (or 0 when unknown). Do not label a multi-call run as one API request.
- The same ID and content are a no-op across process restarts. Conflicting reuse of an ID rejects the batch before writing; generating a new ID to bypass a conflict will double count usage and is not a correction workflow.
- Unknown top-level content is not retained or uploaded. Still supply a token-only file, not a raw conversation. Dimensions are explicit, user-approved provider/model IDs; do not put project names or secrets in them.

Local `ingest` and cloud `ingest --upload` have separate stores. Cloud import intentionally does not mirror into legacy local statistics. Do not manually import requests already collected by an automatic adapter: IDs from two independent sources cannot establish that they represent the same underlying request.

## Cline capture contract

The Cline integration now uses `afterModel.assistantMessage` instead of cumulative `afterRun.result.usage`. It reads only `id`, `role`, `createdAt`, `metrics` and `modelInfo`; no content, tool payloads or conversation snapshots are traversed. Each finalized model message contributes one request at its completion time. All hosts must supply the compatible normalized Cline SDK contract; absence of this contract is not treated as successful capture.

The normalized SDK gateway input includes cache counters and output includes reasoning. TokensBurned separates those subsets before aggregation. Inconsistent custom-model counters are skipped rather than guessed. Missing model identity is reported as `unknown`. The hook performs local durable queuing; the existing worker handles networking outside the model callback.

Integrators can use this fallback for unsupported hosts once observed usage is converted to the contract. Gemini, Copilot, OpenCode and Cline's supported native paths are documented in the collection guide; do not manually import the same requests under different IDs. Do not point OTLP exporters at the TokensBurned API.
