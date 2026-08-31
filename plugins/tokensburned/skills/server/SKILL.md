---
name: server
description: Show authenticated TokensBurned aggregate totals and the public GitHub profile card URL. Use for server status or card lookup; do not use to connect or import history.
---

# TokensBurned Server Status

Resolve the plugin root from this skill's location and run `node <plugin-root>/bin/burn.js server`.

- This is a read-only status operation. Do not reconnect or upload history when credentials are missing; explain that `$tokensburned:connect` is required instead.
- Report the authenticated account, all-time tokens, seven-day tokens, and whether the public card is off. Report a URL only when the server says it is public.
- Keep harness, provider, and model identities separate. Do not infer missing provider data from the harness name.
