---
name: doctor
description: Diagnose TokensBurned installation, harness detection, credentials, privacy, and update status. Use for troubleshooting; do not connect, publish, or import history.
---

# Diagnose TokensBurned

Resolve the plugin root from this skill's location and run `node <plugin-root>/bin/burn.js doctor`.

- This is a diagnostic operation. Do not reconnect, publish a card, import history, install hooks, or delete data.
- The doctor checks recognized harness configuration and credential presence, and performs a public release check. It must not open or summarize raw transcripts, prompts, replies, tool payloads, source code, repository paths, or API keys.
- Report detected harnesses, provider/model confidence, credential expiry, server/card status, and update guidance separately.
- If a fix would mutate files, credentials, privacy, hooks, or plugin installation, explain it and wait for an explicit user request before applying it.
