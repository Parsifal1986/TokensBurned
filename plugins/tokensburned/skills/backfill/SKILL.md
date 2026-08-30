---
name: backfill
description: Preview or import 1–90 days of Codex and Claude token history into TokensBurned. Use for historical token backfill; do not use for account connection or current server totals.
---

# Backfill TokensBurned

Resolve the plugin root from this skill's location and use `node <plugin-root>/bin/burn.js backfill`.

- Never inspect, quote, or summarize raw session transcripts yourself. Always use the bundled parser.
- For previews, pass `--dry-run`; dry runs make no ingestion request. Preserve a requested `--days` value between 1 and 90.
- Before a non-dry-run import, require an explicit request to upload and state the boundary: the parser opens only recognized Codex and Claude JSONL directories and sends only token counts, harness, provider, model, a hashed session identifier, and a 15-minute bucket.
- Raw prompts, replies, tool payloads, source code, repository paths, transcript paths, and transcript files must not be uploaded.
- Report the CLI's file, token, and aggregate-bucket totals accurately. Do not infer provider solely from the harness name.
