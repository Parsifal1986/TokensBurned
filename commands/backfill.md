---
description: Import up to 90 days of token totals from local Codex and Claude history
argument-hint: "[--days 1-90] [--dry-run]"
allowed-tools: Bash(node:*)
---

Explain that the parser reads session JSONL locally but retains and uploads only token counts, harness, provider, model, a hashed session id, and a 15-minute bucket. Then run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/burn.js" backfill $ARGUMENTS
```
