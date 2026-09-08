# TokensBurned

TokensBurned publishes aggregate AI coding token usage as a live GitHub profile card.

- Use the bundled `connect`, `backfill`, `server`, `privacy`, `update`, and `doctor` skills only for matching user requests.
- Treat ambiguous privacy requests as read-only status checks. Never publish or install an update silently.
- Automatic Gemini collection and history backfill are not implemented. For an explicitly authorized cloud import use `tokensburned ingest usage.json --harness gemini-cli --upload --dry-run`, then the same command without `--dry-run`. Read `docs/usage-import.md` for stable request IDs, timestamps and exclusive token counters. Plain `ingest` changes local statistics only. Never configure Gemini's telemetry exporter to send data to the TokensBurned API; that route is disabled.
- Never upload prompts, responses, source code, repository names, transcript paths, API keys, or raw session files.
- Keep harness, provider, and model as separate identities.
