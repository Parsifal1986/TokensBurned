# Security and privacy boundary

TokensBurned is designed so its privacy promise is also its architecture.

## Data it may read

TokensBurned may read:

- usage metadata delivered by an official harness lifecycle hook;
- known harness configuration fields needed for best-effort provider and model attribution;
- its own files under `~/.burn`;
- after explicit backfill consent, JSONL files under `~/.codex/sessions` and `~/.claude/projects`, limited to a user-selected 1–90 day range;
- at `SessionEnd`, the single transcript path supplied by the harness, only when the user has already connected TokensBurned.

The history parser uses resolved-path boundary checks and rejects a transcript outside the recognized harness directory. It streams each file and extracts only usage counters, model identifiers, session identifiers, and timestamps. It does not retain message content.

## Data sent to the API

Native ingestion sends only:

- input, output, cache-read, cache-write, and reasoning token counts;
- harness, provider, and model labels;
- a one-way hashed session identifier;
- a 15-minute time bucket, revision, and request count.

Prompts, responses, tool payloads, source code, repository names, transcript paths, raw session files, machine information, API keys, and GitHub credentials are not included in ingestion requests.

The Worker reduces supported OTLP documents to the same allow-list before persistence. Raw OTLP documents are not persisted. Public SVG cards contain aggregate counters and no device or session identifiers.

## Authentication and local behavior

GitHub OAuth is used to verify account identity. The resulting GitHub user token is used once to read the authenticated identity and is not stored. TokensBurned issues a device credential scoped to usage writes and self-service reads; the client stores it in `~/.burn/credentials.json` with user-only permissions and sends it only in the `Authorization` header.

The plugin's `SessionEnd` hook launches a short-lived detached process because lifecycle hooks have a tight timeout. TokensBurned does not install a cron job, launch agent, daemon, traffic proxy, or recurring Git synchronization task for server ingestion.

Production secrets belong in Cloudflare Worker Secrets and must never be committed.

Please report security issues privately to the maintainers before opening a public issue.
