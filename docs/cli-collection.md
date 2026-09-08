# Collection guide

Set up background collection, select supported tools, and import retained usage history.

## Normal use

```sh
tokensburned connect
tokensburned run
```

`run` installs and starts a background **user** service: LaunchAgent on macOS, or `systemd --user` on Linux. It automatically starts after login (not before login as root), restarts after unexpected crashes and survives closing the terminal. Linux requires a working user systemd manager; no linger/root configuration is changed. Windows can use `run --foreground` until a native service integration is added.

Use `run --stop` to stop the service and remove login startup; credentials and queued usage remain intact. Repeating `run` replaces the managed service with a fresh runtime snapshot and retains the previous source scope unless `--harness` is provided. After upgrading the CLI/plugin or replacing its Node installation, run it again to refresh the snapshot/runtime path. `run --foreground` remains available for debugging (stop the background service first).

The collector checks local usage once a minute and retries interrupted uploads automatically. Initial collection covers the last two days; retained history can be imported for a selected range of up to 90 days. Use `tokensburned` to check status and `tokensburned doctor` to identify sources needing attention.

`run --harness codex,opencode` explicitly narrows collection. A new service defaults to Codex, Claude Code, OpenCode, Gemini CLI and Cline; absent sources contribute no usage. To expand an existing service's saved scope after upgrading, run `tokensburned run --harness codex,claude-code,opencode,gemini-cli,cline`. Connection alone still does not enable collection.

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

OpenCode defaults to `$XDG_DATA_HOME/opencode/opencode.db` or `~/.local/share/opencode/opencode.db`; its `OPENCODE_DB` override is respected for filesystem databases. It only selects message identity, completion time, provider/model and numeric token columns via JSON extraction. It never selects full message JSON, parts, project paths, titles or tool payloads. Stored OpenCode input/output already exclude cache/reasoning, so those subsets are not subtracted again. No harness binary is invoked for this reader.

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

Use the same version, `BURN_HOME` (default: `~/.burn`), and connection for the CLI and plugins. The client deduplicates supported records locally, including records received both through a plugin and through history scanning. Keep the existing data directory when upgrading or switching installation methods.

Do not create separate data directories to collect the same history. Do not manually import automatically collected requests under new IDs. Either action can count the same usage more than once.

Cline history can omit separate reasoning counts. When both records are available, the client keeps the more detailed live breakdown without adding another request. History-only imports keep reasoning within output when no separate count is reported.

## History import

```sh
tokensburned backfill --harness gemini-cli --days 30 --dry-run
tokensburned backfill --harness gemini-cli --days 30
```

Preview before importing. Choose `codex`, `claude-code`, `gemini-cli`, `opencode`, or `cline`; use `--all-harnesses` only when you intend to import every supported source. Copilot's live usage events cannot be recovered from ordinary history.

## Commands and migration

Use `tokensburned help` for everyday commands and `tokensburned help --advanced` for history import, authenticated totals, data removal, and integration setup.

Earlier static-card commands (`setup`, plain `sync`, `render`, and `clean`) are no longer supported. Use `connect`, `run`, and the online card builder instead. `sync --cloud` remains available for compatible integrations. Updating the client does not delete queued usage or change your card visibility.

For tools without a native reader, see [usage import](usage-import.md). Installing the CLI alone does not supply missing usage data.
