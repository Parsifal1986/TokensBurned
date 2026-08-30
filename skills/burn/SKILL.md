---
name: burn
description: Show, configure, diagnose, or publish the user's local Burn AI coding activity. Use when the user asks for Burn stats, Burn setup or sync, Burn Doctor, privacy settings, or local Burn cleanup.
---

# Burn

Use the plugin's `bin/burn.js` as the single source of truth. Resolve the plugin root from this skill's location, then run `node <plugin-root>/bin/burn.js <command>`.

- For a stats request, run the CLI with no command.
- For setup, sync, hook installation, privacy changes, or cleanup, explain the exact local or GitHub mutation before running it. Preserve the CLI's confirmation step unless the user explicitly approved the action.
- For diagnosis, run `doctor` and report unknown backend attribution honestly. Harness identity is never evidence of provider identity.
- Never inspect transcripts, prompts, responses, source code, API keys, or arbitrary home-directory files to improve attribution.
- Do not add a proxy, daemon, traffic interception, or backend request. Burn's network scope is GitHub during an explicitly configured sync.
