---
name: update
description: Check for and apply TokensBurned plugin updates. Use for version checks, update notices, or upgrading the installed plugin; do not use for account connection.
---

# Update TokensBurned

Resolve the plugin root from this skill's location and run `node <plugin-root>/bin/burn.js update` to force a release check.

The forced check applies only to release metadata. The command also merges supported recent history and handles the shared cloud queue, but cannot bypass the server upload window. Report pending/deferred output as queued, not as a completed upload. For ongoing automatic collection and retry, use `run` only when requested; it installs a user-level background service with login startup. `run --foreground` is for diagnostics. `sync --cloud` is compatibility-only, and plain `sync` is retired.

- TokensBurned also checks automatically at SessionStart at most once per 24 hours. A failed check must never block the harness.
- Checking is safe to run without upgrade consent. It reads the public release endpoint and stores only release metadata and the last-check time in `~/.burn/config.json`.
- Never install an update silently. Apply it only after the user explicitly asks to update.
- Use only the stable release URL and command printed by the CLI. Development builds (prerelease or build metadata versions) are local-only and must not be upgraded through the plugin manager. Never substitute main, a development branch, or an unverified tag.
- In Codex, refresh the stable catalog with `codex plugin marketplace upgrade tokensburned`, then use `codex plugin add tokensburned@tokensburned`, then tell the user to start a new task so the refreshed skills load.
- In Claude Code, refresh the stable catalog with `claude plugin marketplace update tokensburned`, then use `claude plugin update tokensburned@tokensburned`, then tell the user to restart the session.
- For another harness, provide the release URL printed by the CLI and use that harness's plugin or extension manager. Do not substitute `npm install`, edit marketplace files by hand, or run `git pull` in an unrelated checkout.
