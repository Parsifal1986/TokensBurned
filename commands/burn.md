---
description: Show Burn stats or run a Burn subcommand
argument-hint: "[setup|sync|doctor|clean]"
allowed-tools: Bash(node:*)
---

Run the Burn CLI from this plugin's root with the requested arguments:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/burn.js" $ARGUMENTS
```

Before `setup`, `hooks install`, privacy changes, or `clean`, describe the mutation and preserve Burn's interactive confirmation unless the user already authorized it. Do not inspect transcripts, prompts, responses, source code, or API keys.
