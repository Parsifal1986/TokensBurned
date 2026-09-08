<div align="center">
  <img src="public/favicon.svg" width="112" alt="TokensBurned logo" />
  <h1>TokensBurned</h1>
  <p><strong>Track your token usage. Share it on GitHub or your own website without uploading prompts or source code.</strong></p>
  <p>
    <a href="https://tokensburned.com/"><img alt="Website" src="https://img.shields.io/badge/website-tokensburned.com-eb6733?style=flat-square"></a>
    <a href="https://github.com/Parsifal1986/TokensBurned/actions/workflows/pages.yml"><img alt="GitHub Pages" src="https://img.shields.io/github/actions/workflow/status/Parsifal1986/TokensBurned/pages.yml?style=flat-square&label=pages"></a>
    <a href="LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/license-MIT-f1eadf?style=flat-square"></a>
  </p>
  <p>
    <strong>English</strong> · <a href="docs/readme/README.zh-CN.md">简体中文</a> · <a href="docs/readme/README.ja.md">日本語</a> · <a href="docs/readme/README.ko.md">한국어</a> · <a href="docs/readme/README.es.md">Español</a> · <a href="docs/readme/README.fr.md">Français</a>
  </p>
  <h3><a href="https://tokensburned.com/#card-builder">Open the interactive card builder →</a></h3>
  <p><sub>Choose a light/dark/auto theme and optional card elements. The preview uses fictional local data.</sub></p>
</div>

TokensBurned records token counts and model metadata from supported AI coding harnesses. It aggregates usage locally, uploads on the server schedule, and serves an automatically updating SVG for your GitHub profile, personal website, or anywhere that supports SVG images.

<div align="center">
  <img src="public/demo/card-full.svg" width="840" alt="New TokensBurned card with fictional sample data" />
  <p><sub>Bundled fictional data. Viewing this README does not request your live card.</sub></p>
</div>

## Why TokensBurned

- **One live link.** Your profile updates without scheduled jobs or noisy README commits.
- **Observed usage.** Harness, provider, and model stay separate. TokensBurned does not call every Claude Code session “Claude.”
- **Local reduction.** Raw sessions are reduced on your machine before upload.
- **Hard privacy boundary.** Prompts, responses, source code, repository names, transcript paths, and API keys are not uploaded.
- **Private until you publish.** Connecting and uploading aggregates do not create a public card; publishing is a separate explicit command.
- **Clear support status.** Installing a plugin or the CLI does not add support for a harness without a usage adapter.

## Install for your harness

<table>
  <tr>
    <td width="50%" valign="top">
      <h3>Claude Code</h3>
      <p><strong>Native plugin + SessionEnd hook</strong></p>
      <pre><code>/plugin marketplace add Parsifal1986/TokensBurned
/plugin install tokensburned@tokensburned
/reload-plugins
/tokensburned:connect</code></pre>
      <p>Optional history:</p>
      <pre><code>/tokensburned:backfill --dry-run --days 90</code></pre>
    </td>
    <td width="50%" valign="top">
      <h3>Codex</h3>
      <p><strong>Native marketplace plugin + focused skills</strong></p>
      <pre><code>codex plugin marketplace add Parsifal1986/TokensBurned
codex plugin add tokensburned@tokensburned</code></pre>
      <p>Start a new task, then use:</p>
      <pre><code>$tokensburned:connect
$tokensburned:backfill
$tokensburned:server
$tokensburned:privacy
$tokensburned:update
$tokensburned:doctor</code></pre>
      <p>SessionStart checks for a newer release at most once per day. It prompts with the native plugin-manager command but never installs silently.</p>
    </td>
  </tr>
</table>

### Supported harnesses

| Harness | Status | Scope |
| --- | --- | --- |
| Claude Code | Supported | Native plugin hooks and local history reader |
| Codex | Supported | Native plugin hooks and local history reader |
| OpenCode | Limited, experimental | Standalone collector for v1 SQLite only; requires `sqlite3`. v2 and legacy JSON storage are unsupported. |
| Cline CLI / SDK | Conditional, experimental | Requires a host exposing `afterModel.assistantMessage.metrics`, model identity and stable message IDs. Contract-tested; no native end-to-end certification or history backfill. Editor extensions are unsupported. |
| Cursor | **Not supported** | No token-usage collection adapter |
| Aider | **Not supported** | No token-usage collection adapter |
| Gemini CLI | **Not supported for usage collection** | Setup extension exists; automatic collection and history backfill are not implemented |
| GitHub Copilot CLI | **Not supported for usage collection** | Setup plugin exists; automatic collection and history backfill are not implemented |
| Other harnesses | **Not supported** | No supported collection adapter |

Manual usage import is an integration interface, **not harness support**. Installing the standalone CLI does not make Cursor, Aider, Gemini or Copilot usage appear automatically. See [collection requirements](docs/cli-collection.md) for the limited OpenCode and Cline paths.

## Build your profile card

First opt in with `tokensburned privacy public`. This publishes totals, harness/provider/model breakdowns, activity heatmaps, rank, and your GitHub identity. The policy belongs to the verified GitHub account, so every connected device inherits the same choice without asking again. Then open the [interactive card builder](https://tokensburned.com/#card-builder), enter your GitHub username, choose the visible elements, and copy the generated Markdown. Query parameters can hide published sections, but cannot enable fields disabled by the account's server-side policy.

Embed the card once:

```markdown
[![TokensBurned activity](https://api.tokensburned.com/v1/cards/u/YOUR_GITHUB_NAME.svg?theme=auto)](https://tokensburned.com/)
```

### Card elements

Every card keeps the flame character, seven-day trend, doodles and bottom phrase. Privacy settings still apply: a hidden activity history does not appear in the trend.

| Optional element | Parameter | Default |
| --- | --- | --- |
| Activity heatmap | `heatmap=0\|1` | On |
| Harness breakdown | `stack=0\|1` | On |
| Consecutive active days | `streak=0\|1` | On |
| Cached input share (seven days) | `cache=0\|1` | Off |
| Rank badge | `rank=0\|1` | Off |

Use `theme=auto|light|dark` for the appearance (`dark` if omitted). For example:

```text
?theme=auto&heatmap=1&stack=1&streak=1&cache=1&rank=0
```

The old full/compact/meme layout presets are retired. Use the current builder to generate links.

Cards are assembled on demand when the CDN cache misses; individual styles are not saved as SVG files in R2. Edge and browser caches last one hour. Local collection, cloud uploads and card caching have separate schedules, so updates are automatic, not instant.

## Standalone CLI

Install the [stable v0.6.9 release](https://github.com/Parsifal1986/TokensBurned/releases/tag/v0.6.9) below. The npm registry may lag behind GitHub releases.

```sh
npm install -g https://github.com/Parsifal1986/TokensBurned/releases/download/v0.6.9/tokensburned-0.6.9.tgz
tokensburned connect
tokensburned run
```

`run` starts a background user service and enables startup after login on macOS/Linux. It reads local sources once a minute, persists the queue, and retries network failures on the server schedule. Use `run --stop` to disable it or `run --foreground` for diagnostics; it does not need root. Codex and Claude Code use the existing history readers. OpenCode supports only the verified v1 SQLite format and requires `sqlite3`; Cursor and Aider are not supported.

Daily commands are `connect`, `run`, `status` (the default), `privacy`, `doctor`, `update` and `disconnect`. No user command can force an early upload. Use `help --advanced` for maintenance operations such as scoped historical backfill and account deletion.

The old `setup`, plain `sync`, `render` and `clean` commands are retired. Existing hook callers and integration entry points remain compatible. See [collection contracts and command migration](docs/cli-collection.md). [Manual usage import](docs/usage-import.md) is an integrator fallback, not a substitute for native collection.

While TokensBurned is installed but not connected, the SessionStart hook asks the
assistant to mention the connect command at most three times (tracked in
`~/.burn/config.json` under `onboarding.connect_notices`), then stays silent.

Installed harness plugins also perform a best-effort release check at SessionStart,
throttled to once every 24 hours; while the installed version is older than the
published one, every SessionStart reminds the assistant to mention it. Update
failures never block startup, and applying an available update always requires
an explicit user request. `tokensburned update` also merges the last two days of
every installed, supported history adapter, then checks the shared cloud queue once.
Only the release check is forced; usage remains queued until the server permits
upload. For ongoing standalone collection and queue transport, use `tokensburned run`.

## Privacy boundary

| Uploaded | Never uploaded |
| --- | --- |
| Token counts | Prompts and responses |
| Harness, provider, model (an unrecognized gateway is recorded by hostname only) | Source code and tool payloads |
| Hashed session identifier | Repository names and paths |
| 15 minute time bucket | Transcript files and paths |
| Request count | API keys and provider credentials |

The lifecycle upload is short and best effort. Server aggregates are retained until you run `tokensburned delete-server-data`; credentials expire after 180 days and can be revoked sooner. Background collection is installed only by an explicit `run` command and uses the user service manager; no root daemon, traffic proxy or Git synchronization task is installed. See [SECURITY.md](SECURITY.md) for the complete boundary.

## License

[MIT](LICENSE) © 2026 [parsifal1986](https://github.com/Parsifal1986). Issues and pull requests are welcome; contributor and implementation notes live in [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), and [`docs/`](docs/).

### Free device slots

Each GitHub account has 5 device slots, shared across active devices and devices
in a 30-day cooldown. Disconnecting revokes access immediately but reserves that
slot for the same device for up to 30 days. Reconnecting the same device reuses the
slot; disconnecting it again restarts the cooldown. Credential expiry releases
the slot immediately, including during cooldown. Reconnecting after expiry needs
a free slot and consumes a connection allowance. Other free slots remain usable.

Keep the local device ID in `~/.burn` to reconnect as the same device. Disconnect
does not delete cloud history. The CLI shows the server-confirmed slot release
time after disconnecting. Deleting local files does not release a cloud slot.
Successful connections, including reconnections and credential rotations, are
limited per GitHub account to 5 per rolling 10 minutes and 10 per rolling 24 hours.
Disconnecting does not refund that allowance; authorization polling does not use it.

Deleting all server data removes usage, credentials, the account profile, and the
public card, but does not refund allowances. A keyed account identifier, recent
connection times, and outstanding slot release times remain until their normal
deadlines. Connection windows last up to 24 hours; deleted device reservations
last up to 30 days or credential expiry, whichever comes first. Expired records
are cleaned up regularly. See [all usage limits](https://tokensburned.com/limits.html).

### Stable plugin updates

Plugin catalogs pin the last promoted GitHub Release by tag and commit. `tokensburned update` refreshes release metadata and prints the native plugin-manager commands; it does not install from the current development checkout. Versions with prerelease or local build suffixes skip remote update checks. Test those builds from a local checkout.

After publishing a non-prerelease GitHub Release, maintainers can run `node scripts/promote-release.mjs vX.Y.Z /path/to/TokensBurned-Cloud` to prepare the pinned catalogs and API release metadata. The script verifies the published release, commit and package version, and writes local changes only. Review and publish those changes separately.
