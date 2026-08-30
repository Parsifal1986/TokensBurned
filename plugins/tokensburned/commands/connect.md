---
description: Connect TokensBurned to GitHub and optionally import historical token totals
argument-hint: "[--backfill|--no-backfill]"
allowed-tools: Bash(node:*)
---

Explain that this opens GitHub authorization, stores one device token in `~/.burn/credentials.json`, and offers an opt-in local history scan that uploads only aggregate token metadata. Then run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/burn.js" connect $ARGUMENTS
```
