# Local collection and the simplified CLI

This describes the local development build, not a deployed release.

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

`run --harness codex,opencode` explicitly narrows collection. No frequency or force-upload flags are accepted. The default checks Codex, Claude Code and OpenCode; absent sources contribute no usage. Connection alone still does not enable collection.

## Supported source contracts

| Source | Local reader | Limit |
| --- | --- | --- |
| Codex | Scoped session JSONL, existing cumulative-delta parser | Same identities as the hooks, so rescanning does not add tokens twice. |
| Claude Code | Scoped project JSONL, existing final-message parser | Same identities as the hooks; no guessed usage. |
| OpenCode | Read-only SQLite projection from the v1 `message` table | Requires a `sqlite3` executable with JSON support. Only finalized assistant messages with all five numeric token counters. `session_message` v2 data is explicitly rejected; legacy JSON storage and alternate channel databases are not auto-discovered. |
| Cursor | No automatic reader | Hook context-window sizes do not establish per-request consumption. No transcript scraping or cost-to-token conversion. |
| Aider | No automatic reader | Its analytics `message_send` counters can originate from provider usage **or estimates** without a provenance flag. These logs are not treated as exact observed usage. |

OpenCode defaults to `$XDG_DATA_HOME/opencode/opencode.db` or `~/.local/share/opencode/opencode.db`; its `OPENCODE_DB` override is respected for filesystem databases. It only selects message identity, completion time, provider/model and numeric token columns via JSON extraction. It never selects full message JSON, parts, project paths, titles or tool payloads. Stored OpenCode input/output already exclude cache/reasoning, so those subsets are not subtracted again. No harness binary is invoked and no real user database was accessed during tests.

Sources checked 2026-09-08: [OpenCode SQL schema](https://github.com/anomalyco/opencode/blob/dev/packages/core/src/session/sql.ts), [usage normalization](https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/session/session.ts), [message finalization](https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/session/processor.ts), [database paths](https://github.com/anomalyco/opencode/blob/dev/packages/core/src/database/database.ts), [Cursor hooks](https://cursor.com/docs/hooks), [Aider usage accounting](https://github.com/Aider-AI/aider/blob/main/aider/coders/base_coder.py), [Aider local analytics](https://aider.chat/docs/more/analytics.html). These are schema-based fixture checks, not native harness end-to-end certification.

## Commands and migration

Daily help still shows seven operations: status (the default command), connect, run, privacy, doctor, update and disconnect. `update` may force a release check, never a usage upload.

`help --advanced` contains history backfill, authenticated server totals, data deletion and standalone hook installation. These retain their existing scoping/confirmation rules. `sync --cloud` and `plan` remain compatibility entry points but are not promoted as daily controls. Integrator entry points (`ingest`, `hook`, `upload-worker`) remain available for existing callers and are omitted from daily help; hiding a command is not an authorization boundary.

`setup`, plain `sync`, `render` and `clean` now fail with a migration message before side effects. Old `sync.enabled` configuration no longer causes a hook to write cards to GitHub. Pending data is not discarded. Public card visibility still requires `privacy public`; use the server-rendered card link rather than a static GitHub branch.

Manual `ingest --upload` still only queues approved observations. `run` will transport an already queued observation regardless of its harness name, but cannot manufacture a missing native capture adapter. Integrators must not import requests already represented by an automatic reader under different identities.

## Verification

Isolated CLI PR verification (2026-09-08): 104 tests passed, zero failures or skips. Five focused collector regressions cover actual SQLite metadata extraction, unknown-format rejection, rescans and new records, server timing, offline retries, source checkpoint isolation, process locking and a real CLI subprocess stopped with SIGTERM. Retired-command tests verify that stored local data stays unchanged. Package dry run includes the collector, OpenCode reader and this guide; bundled plugin runtime copies match the source. These automated tests use isolated fixtures and never contact the production usage API. Native launchd startup, forced-crash recovery and uninstall are additionally tested with a temporary service and loopback HTTP endpoint. System-service activation for the user is reported separately after verification.
