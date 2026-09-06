# TokensBurned

TokensBurned publishes aggregate AI coding token usage as a live GitHub profile card.

- Use the bundled `connect`, `backfill`, `server`, `privacy`, `update`, and `doctor` skills only for matching user requests.
- Treat ambiguous privacy requests as read-only status checks. Never publish or install an update silently.
- Gemini CLI has no supported native token path. Use the bundled skills and the explicit `tokensburned ingest` import for totals. Never configure Gemini's telemetry exporter to send data to the TokensBurned API; that route is disabled.
- Never upload prompts, responses, source code, repository names, transcript paths, API keys, or raw session files.
- Keep harness, provider, and model as separate identities.
