---
description: Show TokensBurned stats or run a TokensBurned subcommand
argument-hint: "[doctor|render|setup|sync|privacy|clean]"
allowed-tools: Bash(node:*)
---

Run the TokensBurned CLI from this plugin's root with the requested arguments:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/burn.js" $ARGUMENTS
```

Before `setup`, `hooks install`, privacy changes, or `clean`, describe the mutation and preserve TokensBurned's interactive confirmation unless the user already authorized it. Do not inspect transcripts, prompts, responses, source code, or API keys.
