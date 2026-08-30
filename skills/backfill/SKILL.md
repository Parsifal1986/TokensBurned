---
name: backfill
description: Preview or import 1–90 days of current-harness token history into TokensBurned. Use for historical token backfill; do not use for account connection or current server totals.
---

# Backfill TokensBurned

Resolve the plugin root from this skill's location and use `node <plugin-root>/bin/burn.js backfill --harness <current-harness>`.

- Never inspect, quote, or summarize raw session transcripts yourself. Always use the bundled parser.
- In Codex, pass `--harness codex`. In Claude Code, pass `--harness claude-code`. A plain backfill must never silently scan another installed harness.
- Pass `--all-harnesses` only when the user explicitly asks to import every recognized harness. Tell the user that this expands local file access before running it.
- For previews, pass `--dry-run`; dry runs make no ingestion request. Preserve a requested `--days` value between 1 and 90.
- Before a non-dry-run import, require an explicit request to upload and state the boundary: the parser opens only the selected harness JSONL directory and sends only token counts, harness, provider, model, a hashed session identifier, and a 15-minute bucket.
- Raw prompts, replies, tool payloads, source code, repository paths, transcript paths, and transcript files must not be uploaded.
- Report the CLI's file, token, and aggregate-bucket totals accurately. Do not infer provider solely from the harness name.
