<div align="center">
  <img src="assets/logo.svg" width="112" alt="TokensBurned logo" />
  <h1>TokensBurned</h1>
  <p><strong>Put your AI coding activity on GitHub without uploading prompts or source code.</strong></p>
  <p>
    <a href="https://tokensburned.com/"><img alt="Website" src="https://img.shields.io/badge/website-tokensburned.com-eb6733?style=flat-square"></a>
    <a href="https://github.com/Parsifal1986/TokensBurned/actions/workflows/pages.yml"><img alt="GitHub Pages" src="https://img.shields.io/github/actions/workflow/status/Parsifal1986/TokensBurned/pages.yml?style=flat-square&label=pages"></a>
    <a href="LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/license-MIT-f1eadf?style=flat-square"></a>
  </p>
  <p>
    <strong>English</strong> · <a href="docs/readme/README.zh-CN.md">简体中文</a> · <a href="docs/readme/README.ja.md">日本語</a> · <a href="docs/readme/README.ko.md">한국어</a> · <a href="docs/readme/README.es.md">Español</a> · <a href="docs/readme/README.fr.md">Français</a>
  </p>
  <h3><a href="https://tokensburned.com/#card-builder">Open the interactive card builder →</a></h3>
  <p><sub>Choose a layout, light/dark/auto theme, and profile elements. The preview uses fictional local data.</sub></p>
</div>

TokensBurned collects token counts and model metadata from AI coding harnesses, aggregates them into 15 minute buckets, and serves a live SVG for your GitHub profile. The card can show 24 hour, 7 day, 30 day, and all-time totals, daily and hourly heatmaps, harness/provider/model comparisons, and an anonymous site-wide rank.

<div align="center">
  <img src="assets/demo-card-builder.gif" width="840" alt="TokensBurned card builder switching between full, compact, and meme cards" />
</div>

## Why TokensBurned

- **One live link.** Your profile updates without scheduled jobs or noisy README commits.
- **Observed usage.** Harness, provider, and model stay separate. TokensBurned does not call every Claude Code session “Claude.”
- **Local reduction.** Raw sessions are reduced on your machine before upload.
- **Hard privacy boundary.** Prompts, responses, source code, repository names, transcript paths, and API keys are not uploaded.
- **Private until you publish.** Connecting and uploading aggregates do not create a public card; publishing is a separate explicit command.
- **Honest compatibility.** Native hooks, plugin workflows, and the CLI fallback are labeled separately.

## Install for your harness

<div align="center">
  <img src="assets/demo-install.gif" width="840" alt="TokensBurned installer switching between Claude Code, Codex, and Gemini CLI" />
</div>

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
  <tr>
    <td width="50%" valign="top">
      <h3>Gemini CLI</h3>
      <p><strong>Setup extension + explicit cloud import</strong></p>
      <pre><code>gemini extensions install https://github.com/Parsifal1986/TokensBurned
gemini
/tokensburned:connect
/tokensburned:privacy
/tokensburned:update
/tokensburned:doctor</code></pre>
      <p>The extension provides setup skills, not automatic collection or history backfill. Use <code>ingest --upload</code> with finalized request observations to update the cloud card; plain <code>ingest</code> is local only. Do not point a telemetry exporter at the API.</p>
    </td>
    <td width="50%" valign="top">
      <h3>GitHub Copilot CLI</h3>
      <p><strong>Open Plugin Spec + CLI collection</strong></p>
      <pre><code>copilot plugin install https://github.com/Parsifal1986/TokensBurned</code></pre>
      <p>Ask Copilot to connect TokensBurned. Automatic capture and history backfill are not implemented. Convert observed request usage to the explicit <code>ingest --upload</code> contract; connecting alone does not collect tokens.</p>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <h3>Cline CLI</h3>
      <p><strong>Per-model usage hook</strong></p>
      <pre><code>cline plugin install https://github.com/Parsifal1986/TokensBurned.git</code></pre>
      <p>Compatible Cline CLI / SDK hosts provide <code>afterModel.assistantMessage</code> metrics, model identity and stable message IDs. Requests are deduplicated on disk before upload. Hosts that expose only afterRun or do not load this plugin need the explicit import fallback.</p>
    </td>
    <td width="50%" valign="top">
      <h3>OpenCode, Cursor, Aider, other</h3>
      <p><strong>Standalone CLI</strong></p>
      <pre><code>npm install -g tokensburned
tokensburned connect
tokensburned run --harness opencode</code></pre>
      <p>The local collector supports OpenCode v1 SQLite usage with sqlite3 installed. Cursor and Aider do not yet have automatic readers. See the <a href="docs/cli-collection.md">collection contracts and limits</a>.</p>
    </td>
  </tr>
</table>

### Compatibility at a glance

| Harness | Install surface | Token source | Current level |
| --- | --- | --- | --- |
| Claude Code | Plugin marketplace | Session hook + approved local history | Native |
| Codex | Plugin marketplace | Plugin hook + approved local history | Native |
| Gemini CLI | Gemini extension | Explicit CLI import | Plugin workflow |
| Cline CLI / SDK | Cline Git plugin | `afterModel.assistantMessage.metrics` | Contract-tested per-call capture; no history backfill |
| GitHub Copilot CLI | Open Plugin Spec | Explicit CLI import | Plugin workflow |
| OpenCode | Standalone CLI collector | Read-only v1 SQLite message usage | Format-limited; v2 unsupported |
| Cursor, Aider, others | Standalone CLI transport | Integrator-supplied observed usage only | No automatic capture |

## Build your profile card

First opt in with `tokensburned privacy public`. This publishes totals, harness/provider/model breakdowns, activity heatmaps, rank, and your GitHub identity. The policy belongs to the verified GitHub account, so every connected device inherits the same choice without asking again. Then open the [interactive card builder](https://tokensburned.com/#card-builder), enter your GitHub username, choose a preset, and copy the generated Markdown. Query parameters can hide published sections, but cannot enable fields disabled by the account's server-side policy.

The full card is the default:

```markdown
[![TokensBurned activity](https://api.tokensburned.com/v1/cards/u/YOUR_GITHUB_NAME.svg?theme=auto)](https://tokensburned.com/)
```

The preview below is bundled fictional data. Rendering this README does not call the TokensBurned API.

<div align="center">
  <img src="public/demo/card-full.svg" width="840" alt="Static TokensBurned card with fictional sample data" />
</div>

### Card presets and options

| Result | Query | Good for |
| --- | --- | --- |
| Full report | `?layout=full&heatmap=1&compare=1&rank=1&meme=0` | Profile overview |
| Compact totals | `?layout=compact&compare=0&rank=1` | Small README footprint |
| Meme receipt | `?layout=full&heatmap=0&compare=0&rank=1&meme=1` | A shorter, less serious card |
| Private rank | Add `&rank=0` | Hide the site-wide rank |
| Totals + comparison | `?layout=full&heatmap=0&compare=1` | Keep breakdowns, remove heatmaps |
| Follow system theme | Add `&theme=auto` | Switch with the viewer's light/dark preference |
| Fixed light or dark | Add `&theme=light` or `&theme=dark` | Keep one appearance everywhere |

Supported query parameters:

- `layout=full|compact`
- `heatmap=0|1` (compact layout always disables heatmaps)
- `compare=0|1`
- `rank=0|1`
- `meme=0|1`
- `theme=auto|light|dark` (`auto` uses `prefers-color-scheme` inside the SVG)

## Standalone CLI

```sh
npm install -g tokensburned
tokensburned connect
tokensburned run
```

`run` starts a background user service and enables startup after login on macOS/Linux. It reads local sources once a minute, persists the queue, and retries network failures on the server schedule. Use `run --stop` to disable it or `run --foreground` for diagnostics; it does not need root. Codex and Claude Code use the existing history readers. OpenCode supports only the verified v1 SQLite format and requires `sqlite3`; Cursor and Aider do not yet have reliable automatic readers.

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
