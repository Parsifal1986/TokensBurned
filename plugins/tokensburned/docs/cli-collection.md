# Local collection and the command-line interface

This document describes how the standalone `tokensburned` CLI collects usage locally, which sources it supports, and how earlier commands map to the current ones.

## Normal use

```sh
tokensburned connect
tokensburned run
```

`run` installs and starts a background **user** service: LaunchAgent on macOS, or `systemd --user` on Linux. It automatically starts after login (not before login as root), restarts after unexpected crashes and survives closing the terminal. Linux requires a working user systemd manager; no linger/root configuration is changed. Windows can use `run --foreground` until a native service integration is added.

Use `run --stop` to stop the service and remove login startup; credentials and queued usage remain intact. Repeating `run` replaces the managed service with a fresh runtime snapshot and retains the previous source scope unless `--harness` is provided. After upgrading the CLI/plugin or replacing its Node installation, run it again to refresh the snapshot/runtime path. `run --foreground` remains available for debugging (stop the background service first).

Only src/bin code is copied to a stable directory under BURN_HOME. Service definitions use an absolute Node path and allowlisted HOME/BURN_HOME/PATH/data-source settings; no credential, provider key, shell initialization or NODE_OPTIONS is embedded. Metadata and snapshots use private permissions. Install/stop operations are serialized; an unsuccessful upgrade restores the previous definition. Disconnecting or deleting the account also attempts to remove the service. A managed process exits cleanly if disconnected. Failed install/rollback errors are reported rather than claiming that startup succeeded. Runtime snapshots are retained for recovery; this release does not garbage-collect old snapshots automatically.

The collector reads supported local sources once per minute. This interval controls local scanning, **not** uploading. Pending data uses the same account-bound outbox, immutable observation IDs, revisions, upload lease, plan cadence, successful next-flush deadline, per-day deferral and network backoff as the hooks. A failed upload is retried while `run` remains active, including deferrals beyond the old two-hour worker lifetime. An empty queue causes no upload request.

Initial collection covers the last two days. Successful per-source checkpoints allow catch-up after downtime, within the existing 90-day retention boundary. Checkpoints advance only after durable queueing. One failing source is reported without advancing its checkpoint or preventing healthy sources from collecting. Concurrent `run` processes for the same BURN_HOME are refused; dead locks can be recovered after a 30-second initialization grace period. Status distinguishes a running collector from a stale process record.

`run --harness codex,opencode` explicitly narrows collection. No frequency or force-upload flags are accepted. A new service defaults to Codex, Claude Code, OpenCode, Gemini CLI and Cline; absent sources contribute no usage. To expand an existing service's saved scope after upgrading, run `tokensburned run --harness codex,claude-code,opencode,gemini-cli,cline`. Connection alone still does not enable collection.

## Supported source contracts

| Source | Local reader | Limit |
| --- | --- | --- |
| Codex | Scoped session JSONL, existing cumulative-delta parser | Same identities as the hooks, so rescanning does not add tokens twice. |
| Claude Code | Scoped project JSONL, existing final-message parser | Same identities as the hooks; no guessed usage. |
| OpenCode | Read-only SQLite projections from v1 `message` and v2 `session_message`, plus legacy `storage/message` JSON | SQLite requires `sqlite3` with JSON support. Only finalized assistants with five numeric counters. The same message ID across formats counts once. Use `OPENCODE_DB` for a non-default database. |
| Gemini CLI | Recorded `chats` JSON and JSONL, including child sessions | Prompt cache is part of input; thoughts are separate from output. Repeated message updates and rewinds do not add tokens twice. Only retained recorded usage can be recovered. |
| Cline | SDK `*.messages.json`, `afterModel` plugin, and classic IDE task metrics | SDK hook/history share IDs. Classic IDE output retains reasoning within output when no separate counter exists. Legacy tasks require `ui_messages.json` plus the classic companion history file; companion contents are not read. SDK UI projections with the same task ID are skipped. |
| Copilot CLI | Official live `assistant.usage` extension | Requires extension-capable `copilot --experimental`. No ordinary transcript backfill: these events are ephemeral. Copilot IDE/chat surfaces are not covered. |
| Cursor | No automatic reader | Hook context-window sizes do not establish per-request consumption. No transcript scraping or cost-to-token conversion. |
| Aider | No automatic reader | Its analytics `message_send` counters can originate from provider usage **or estimates** without a provenance flag. These logs are not treated as exact observed usage. |

OpenCode defaults to `$XDG_DATA_HOME/opencode/opencode.db` or `~/.local/share/opencode/opencode.db`; its `OPENCODE_DB` override is respected for filesystem databases. It only selects message identity, completion time, provider/model and numeric token columns via JSON extraction. It never selects full message JSON, parts, project paths, titles or tool payloads. Stored OpenCode input/output already exclude cache/reasoning, so those subsets are not subtracted again. No harness binary is invoked and no real user database was accessed during tests.

Gemini reads `~/.gemini/tmp/*/chats` (honoring `GEMINI_CLI_HOME`). Cline SDK reads `~/.cline/data/sessions`, honoring `CLINE_DIR`, `CLINE_DATA_DIR` and `CLINE_SESSION_DATA_DIR`. Classic IDE discovery covers Code, Code Insiders, VSCodium, Cursor and Windsurf's `saoudrizwan.claude-dev/tasks` global storage on macOS/Linux/Windows. Set `CLINE_IDE_STORAGE` to that extension's global storage directory for a custom IDE installation. Custom/remote hosts must expose one of these verified formats; this is not a claim that every Cline host or historical version exposes exact usage.

JSON history files are parsed locally; only allowlisted identity, time, model/provider and token fields enter the queue. No prompts, responses or source paths are uploaded. Requests missing authoritative counters are skipped or reported as unsupported, never estimated.

Install Copilot's live bridge after connecting:

```sh
tokensburned integrations install copilot
copilot --experimental
```

Use `/extensions manage` to check that TokensBurned is running. The installer creates `~/.copilot/extensions/tokensburned/extension.mjs`, preserving an existing unmanaged extension. It references this installation's runtime: rerun the installer after moving/replacing it. SDK applications can call `attachCopilotUsage(session)` from `integrations/copilot/plugin.js`. Requests are queued before the upload worker starts. Missed live events cannot be reconstructed into exact per-call/hourly history using account quotas or context-window totals.

Use `backfill --harness gemini-cli`, `opencode` or `cline` with `--days 1-90 --dry-run` to preview retained history. Omit `--dry-run` to queue it after connecting.

### CLI and plugin coexistence

Keep the CLI and Codex/Claude plugins on the same version, `BURN_HOME` (default `~/.burn`), and device credentials. All writers share the locked outbox and upload lease. Codex/Claude snapshots replace the same session/bucket/model revision; Cline hook/history use the same request ID. Cline's persistence codec changes `createdAt` to `ts` and omits separate reasoning usage: the queue preserves the richer live output/reasoning split in either arrival order while checking that the request's total is unchanged. History alone retains that reasoning within output. The server replaces a device's daily envelope when its revision increases. Concurrent scans, repeated hooks, restarts and upload retries therefore do not multiply the same supported records.

Separate `BURN_HOME` directories registered as separate devices can count copied histories twice: the server receives anonymous daily aggregates and cannot identify the duplicate requests. Manually importing already-collected usage under new IDs has the same problem. Historical totals from an older incorrect collector are not automatically repaired. Do not delete the shared outbox to switch between CLI and plugins.

Reference sources (checked 2026-09-08): [OpenCode SQL schema](https://github.com/anomalyco/opencode/blob/dev/packages/core/src/session/sql.ts), [usage normalization](https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/session/session.ts), [message finalization](https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/session/processor.ts), [database paths](https://github.com/anomalyco/opencode/blob/dev/packages/core/src/database/database.ts), [Cursor hooks](https://cursor.com/docs/hooks), [Aider usage accounting](https://github.com/Aider-AI/aider/blob/main/aider/coders/base_coder.py), [Aider local analytics](https://aider.chat/docs/more/analytics.html). These are schema-based fixture checks, not native harness end-to-end certification.

## Commands and migration

Daily help still shows seven operations: status (the default command), connect, run, privacy, doctor, update and disconnect. `update` may force a release check, never a usage upload.

`help --advanced` contains history backfill, authenticated server totals, data deletion and standalone hook installation. These retain their existing scoping/confirmation rules. `sync --cloud` and `plan` remain compatibility entry points but are not promoted as daily controls. Integrator entry points (`ingest`, `hook`, `upload-worker`) remain available for existing callers and are omitted from daily help; hiding a command is not an authorization boundary.

`setup`, plain `sync`, `render` and `clean` now fail with a migration message before side effects. Old `sync.enabled` configuration no longer causes a hook to write cards to GitHub. Pending data is not discarded. Public card visibility still requires `privacy public`; use the server-rendered card link rather than a static GitHub branch.

Manual `ingest --upload` still only queues approved observations. `run` will transport an already queued observation regardless of its harness name, but cannot manufacture a missing native capture adapter. Integrators must not import requests already represented by an automatic reader under different identities.
