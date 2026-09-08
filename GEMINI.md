# TokensBurned

TokensBurned publishes aggregate AI coding token usage as a live GitHub profile card.

- Use the bundled `connect`, `backfill`, `server`, `privacy`, `update`, and `doctor` skills only for matching user requests.
- Treat ambiguous privacy requests as read-only status checks. Never publish or install an update silently.
- After connecting, `tokensburned run --harness gemini-cli` collects recorded JSON/JSONL session usage. Preview history with `tokensburned backfill --harness gemini-cli --dry-run --days 90`, then omit `--dry-run` only when importing is authorized. Read `docs/cli-collection.md` for formats and limitations. Plain `ingest` changes local statistics only. TokensBurned does not accept telemetry-exporter traffic; never configure Gemini's telemetry exporter to send data to it.
- Never upload prompts, responses, source code, repository names, transcript paths, API keys, or raw session files.
- Keep harness, provider, and model as separate identities.
