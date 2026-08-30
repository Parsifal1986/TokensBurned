---
name: tokensburned
description: Connect, backfill, diagnose, or show TokensBurned AI coding activity. Use when the user asks about TokensBurned setup, server totals, GitHub profile cards, privacy, or importing Codex and Claude token history.
---

# TokensBurned

Use the plugin's `bin/burn.js` as the single source of truth. Resolve the plugin root from this skill's location, then run `node <plugin-root>/bin/burn.js <command>`.

- For first-time setup, explain that `connect` opens GitHub authorization and stores one device credential in `~/.burn/credentials.json`. Run `connect` only after the user asks to connect or install the service. In a non-interactive harness, ask separately whether to import history and pass `--backfill` only after explicit consent; otherwise connection safely skips history.
- For history import, use `backfill`; never inspect or summarize raw transcripts yourself. Before a non-dry-run import, state that the local parser opens only recognized Codex and Claude JSONL directories and uploads only token counts, harness, provider, model, a hashed session identifier, and a 15-minute bucket. Raw prompts, replies, tool payloads, repository paths, and transcript files are not uploaded.
- Use `backfill --dry-run` when the user wants a preview. The supported range is 1–90 days.
- For current server totals and the public card URL, run `server`.
- For diagnosis, run `doctor`. Keep harness and provider identities separate; do not infer provider from the harness name.
- The bundled `SessionEnd` hook performs best-effort incremental upload in a detached process. Do not add cron jobs, launch agents, daemons, proxies, or Git commits for server synchronization.
- For legacy local profile sync, privacy changes, hook installation, or cleanup, explain the mutation and preserve CLI confirmation unless the user already authorized it.
