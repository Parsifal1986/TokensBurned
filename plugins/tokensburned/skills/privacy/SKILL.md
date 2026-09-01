---
name: privacy
description: View or change TokensBurned public-card privacy. Use for checking visibility or making aggregate activity public/private; do not use for connection or history import.
---

# Manage TokensBurned Privacy

Resolve the plugin root from this skill's location and use `node <plugin-root>/bin/burn.js privacy [status|public|private]`.

- Use `privacy status` for read-only visibility questions. Report the card URL only when the server says the card is public.
- Treat ambiguous requests as status checks. Never publish merely because the user asks to preview, build, or discuss a card.
- Run `privacy public` only after the user explicitly asks to publish. Before running it, state that totals, GitHub identity, harness/provider/model breakdowns, activity heatmaps, and anonymous rank will become public.
- Run `privacy private` only after the user explicitly asks to make the card private. Explain that the public route and cached SVG are removed while private aggregate data remains in the account.
- Do not reconnect, backfill history, or change unrelated settings as part of a privacy request.
- Never print or expose the stored device credential.
