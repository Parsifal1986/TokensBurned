---
name: connect
description: Connect a GitHub account to TokensBurned. Use for first-time setup, device authorization, or reconnecting; do not use for history-only imports or viewing existing totals.
---

# Connect TokensBurned

Resolve the plugin root from this skill's location and use `node <plugin-root>/bin/burn.js connect`.

- Run connection only after the user asks to connect, install, or set up the service.
- Explain that GitHub authorization verifies identity and that one TokensBurned device credential is stored in `~/.burn/credentials.json` with user-only permissions.
- Treat history import as separate consent. Pass `--backfill` only when the user explicitly asks to import existing history; otherwise pass `--no-backfill` so a non-interactive harness never imports by implication.
- When history import is approved, state that only token counts, harness, provider, model, a hashed session identifier, and a 15-minute bucket are uploaded. Prompts, replies, tool payloads, source code, repository paths, and transcript files are not uploaded.
- Do not add cron jobs, daemons, proxies, or Git synchronization.
