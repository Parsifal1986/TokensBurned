---
description: Show TokensBurned stats or run a TokensBurned subcommand
argument-hint: "[status|connect|backfill|server|privacy|update|doctor|render|setup|sync|disconnect|delete-server-data|clean]"
allowed-tools: Bash(node:*)
---

Run the TokensBurned CLI from this plugin's root with the requested arguments:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/burn.js" $ARGUMENTS
```

Before `setup`, `hooks install`, privacy changes, `disconnect`, `delete-server-data`, or `clean`, describe the mutation and preserve TokensBurned's interactive confirmation unless the user already authorized it. Never update the plugin silently. Do not inspect transcripts, prompts, responses, source code, or API keys.
