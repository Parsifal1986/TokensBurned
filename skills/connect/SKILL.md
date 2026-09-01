---
name: connect
description: Connect a GitHub account to TokensBurned. Use for first-time setup, device authorization, or reconnecting; do not use for history-only imports or viewing existing totals.
---

# Connect TokensBurned

Resolve the plugin root from this skill's location and use `node <plugin-root>/bin/burn.js connect`.

- Run connection only after the user asks to connect, install, or set up the service.
- Explain that GitHub authorization verifies identity and that one TokensBurned device credential is stored in `~/.burn/credentials.json` with user-only permissions.
- Open the server-provided complete verification URL when available so the short code is filled automatically. The user must still verify the displayed code and device name, then explicitly confirm before GitHub authorization. Use the printed short code only as a manual fallback, and never ask them to use a code supplied by someone else.
- Public cards are off by default. Pass `--publish-card` only when the user explicitly asks to publish and acknowledges that totals, harness/provider/model breakdowns, activity heatmaps, rank, and GitHub identity become public.
- Treat history import as separate consent. Pass `--backfill --harness codex` in Codex or `--backfill --harness claude-code` in Claude Code only when the user explicitly asks to import existing history; otherwise pass `--no-backfill` so a non-interactive harness never imports by implication.
- Pass `--all-harnesses` only when the user explicitly asks to import every recognized harness and acknowledges the expanded local file scope.
- When history import is approved, state that only token counts, harness, provider, model, a hashed session identifier, and a 15-minute bucket are uploaded. Prompts, replies, tool payloads, source code, repository paths, and transcript files are not uploaded.
- Do not add cron jobs, daemons, proxies, or Git synchronization.
