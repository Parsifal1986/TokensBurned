<div align="center">
  <img src="public/favicon.svg" width="112" alt="TokensBurned logo" />
  <h1>TokensBurned</h1>
  <p><strong>Privacy-first AI coding activity for your GitHub profile.</strong></p>
  <p>
    <a href="https://tokensburned.com/"><img alt="Website" src="https://img.shields.io/badge/website-tokensburned.com-eb6733?style=flat-square"></a>
    <a href="https://www.npmjs.com/package/tokensburned"><img alt="npm" src="https://img.shields.io/npm/v/tokensburned?style=flat-square&label=npm"></a>
    <a href="https://github.com/Parsifal1986/TokensBurned/releases"><img alt="GitHub release" src="https://img.shields.io/github/v/release/Parsifal1986/TokensBurned?style=flat-square&label=release"></a>
    <a href="https://github.com/Parsifal1986/TokensBurned/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/Parsifal1986/TokensBurned/ci.yml?style=flat-square&label=ci"></a>
    <a href="LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/license-MIT-f1eadf?style=flat-square"></a>
  </p>
  <p>
    <strong>English</strong> · <a href="docs/readme/README.zh-CN.md">简体中文</a> · <a href="docs/readme/README.ja.md">日本語</a> · <a href="docs/readme/README.ko.md">한국어</a> · <a href="docs/readme/README.es.md">Español</a> · <a href="docs/readme/README.fr.md">Français</a>
  </p>
  <p>
    <a href="#quick-start">Quick start</a> ·
    <a href="#profile-card">Profile card</a> ·
    <a href="#command-line">Command line</a> ·
    <a href="#privacy-and-security">Privacy</a> ·
    <a href="#documentation">Documentation</a>
  </p>
</div>

TokensBurned turns the token usage of your AI coding tools into a live SVG card for your GitHub profile. The client reads usage metadata from harnesses such as Claude Code and Codex, reduces it locally to aggregate counters, and uploads only those aggregates. Prompts, responses, and source code never leave your machine.

<div align="center">
  <img src="assets/demo-card-builder.gif" width="840" alt="TokensBurned card builder switching between full, compact, and meme layouts" />
  <p><sub><a href="https://tokensburned.com/#card-builder">Open the interactive card builder</a>. The preview uses fictional local data.</sub></p>
</div>

## Features

- **Live profile card.** One image URL shows 24 hour, 7 day, 30 day, and all-time totals, daily and hourly heatmaps, harness, provider, and model comparisons, and an anonymous site-wide rank. No scheduled jobs or README commits.
- **Local reduction.** Sessions are reduced on your machine into 15 minute buckets before anything is uploaded.
- **Strict privacy boundary.** Prompts, responses, source code, repository names, transcript paths, and API keys are never collected. See [Privacy and security](#privacy-and-security).
- **Private by default.** Connecting an account and uploading aggregates does not create a public card. Publishing is a separate, explicit command.
- **Accurate attribution.** Harness, provider, and model are recorded as separate identities. A Claude Code session that talks to a different provider is labeled as such.
- **Honest compatibility.** Native hooks, plugin workflows, and the standalone CLI are labeled separately so you know how each harness is measured.

## Supported harnesses

| Harness | Install surface | Token source | Support level |
| --- | --- | --- | --- |
| Claude Code | Plugin marketplace | Lifecycle hooks and approved local history | Native |
| Codex | Plugin marketplace | Plugin hooks and approved local history | Native |
| Cline CLI / SDK / classic IDE | Cline plugin and standalone CLI | `afterModel`, SDK messages and classic task metrics | Format-scoped per-call capture and backfill |
| OpenCode | Standalone CLI | v1/v2 SQLite and legacy message JSON | Finalized request usage; history backfill |
| Gemini CLI | Gemini extension and standalone CLI | Recorded JSON/JSONL usage | Background collection and backfill |
| GitHub Copilot CLI | Setup plugin and live extension | Official `assistant.usage` events | Live per-call capture; no transcript backfill |
| Cursor, Aider, others | Standalone CLI | Integrator-supplied observed usage | No automatic capture |

TokensBurned never estimates tokens from prompt length or cost, and it does not accept telemetry-exporter traffic. Details for each source are in [Local collection contracts](docs/cli-collection.md).

## Quick start

<table>
  <tr>
    <td width="50%" valign="top">
      <h3>Claude Code</h3>
      <pre><code>/plugin marketplace add Parsifal1986/TokensBurned
/plugin install tokensburned@tokensburned
/reload-plugins
/tokensburned:connect</code></pre>
      <p>Optional history import (preview first):</p>
      <pre><code>/tokensburned:backfill --dry-run --days 90</code></pre>
    </td>
    <td width="50%" valign="top">
      <h3>Codex</h3>
      <pre><code>codex plugin marketplace add Parsifal1986/TokensBurned
codex plugin add tokensburned@tokensburned</code></pre>
      <p>Start a new task, then use the bundled skills:</p>
      <pre><code>$tokensburned:connect
$tokensburned:backfill
$tokensburned:server
$tokensburned:privacy
$tokensburned:update
$tokensburned:doctor</code></pre>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <h3>Cline CLI / SDK</h3>
      <pre><code>cline plugin install https://github.com/Parsifal1986/TokensBurned.git</code></pre>
      <p>Compatible hosts report per-message usage through <code>afterModel</code>. The background collector also reads SDK message histories and classic IDE task metrics. Hooks and SDK history share request identities, so collecting both does not add tokens twice. See the <a href="docs/cli-collection.md">supported formats and limits</a>.</p>
    </td>
    <td width="50%" valign="top">
      <h3>OpenCode and other tools</h3>
      <pre><code>npm install -g tokensburned
tokensburned connect
tokensburned run --harness opencode</code></pre>
      <p>The collector reads OpenCode v1/v2 SQLite usage and legacy message JSON. SQLite requires <code>sqlite3</code>. Cursor and Aider do not yet have automatic readers.</p>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <h3>Gemini CLI</h3>
      <pre><code>gemini extensions install https://github.com/Parsifal1986/TokensBurned
gemini
/tokensburned:connect</code></pre>
      <p>The extension provides setup skills. Start <code>tokensburned run --harness gemini-cli</code> to collect recorded JSON/JSONL session usage, including child sessions. Preview history with <code>tokensburned backfill --harness gemini-cli --dry-run</code>.</p>
    </td>
    <td width="50%" valign="top">
      <h3>GitHub Copilot CLI</h3>
      <pre><code>copilot plugin install https://github.com/Parsifal1986/TokensBurned</code></pre>
      <p>After connecting, run <code>tokensburned integrations install copilot</code> and start <code>copilot --experimental</code>. The live extension records official per-call usage events, including subagents. These events cannot be recovered from ordinary session history. The setup plugin alone does not enable capture.</p>
    </td>
  </tr>
</table>

### How collection works

- **Lifecycle hooks.** In Claude Code and Codex, the plugin reduces the current transcript into a local queue after each turn and re-checks recent sessions at startup, so a session that never ends cleanly is still counted.
- **CLI and plugins together.** Use the same <code>BURN_HOME</code> (default <code>~/.burn</code>) and device credentials. Their shared queue deduplicates requests and transcript snapshots, and the server replaces each device's daily revision. Separate homes/devices reading the same history can double count; anonymous cloud totals cannot deduplicate those copies.
- **Scheduled uploads.** Queued aggregates are uploaded on the service's schedule, at most once per hour by default. No command can force an early upload.
- **Update notices.** Installed plugins check for a newer release at most once every 24 hours and print the native plugin-manager command when one exists. Updates are never installed without an explicit request, and a failed check never blocks startup.
- **Onboarding.** While installed but not connected, the plugin mentions the connect command at most three times and then stays silent.

## Profile card

Cards are private until you opt in:

```sh
tokensburned privacy public
```

Publishing exposes totals, harness, provider, and model breakdowns, activity heatmaps, rank, and your GitHub identity. The setting belongs to your GitHub account, so every connected device shares the same choice. Then open the [card builder](https://tokensburned.com/#card-builder), enter your GitHub username, pick a preset, and paste the Markdown into your profile README:

```markdown
[![TokensBurned activity](https://api.tokensburned.com/v1/cards/u/YOUR_GITHUB_NAME.svg?theme=auto)](https://tokensburned.com/)
```

<div align="center">
  <img src="public/demo/card-full.svg" width="840" alt="TokensBurned card rendered from fictional sample data" />
  <p><sub>Rendered from bundled fictional data. Viewing this README does not call the TokensBurned API.</sub></p>
</div>

### Card elements

Every card keeps the flame character, the seven-day trend, the doodles, and the caption. Optional elements are toggled with query parameters:

| Element | Parameter | Default |
| --- | --- | --- |
| Activity heatmap | `heatmap=0\|1` | On |
| Harness breakdown | `stack=0\|1` | On |
| Consecutive active days | `streak=0\|1` | On |
| Cached input share over the last seven days | `cache=0\|1` | Off |
| Rank badge | `rank=0\|1` | Off |

`theme=auto|light|dark` selects the appearance. `dark` is used when the parameter is omitted, and `auto` follows the viewer's color scheme. For example:

```text
?theme=auto&heatmap=1&stack=1&streak=1&cache=1&rank=0
```

Privacy settings always apply. A hidden activity history does not appear in the trend, and query parameters cannot reveal anything your account has not published. The earlier full, compact, and meme layout presets are retired; use the card builder to generate current links.

## Command line

The standalone CLI works with every harness and is the transport behind the plugins.

```sh
npm install -g tokensburned
tokensburned connect
tokensburned run
```

| Command | Purpose |
| --- | --- |
| `tokensburned` | Show local collection and upload status |
| `tokensburned connect` | Authorize your GitHub account and create a device credential |
| `tokensburned run` | Start background collection and enable login startup (macOS and Linux) |
| `tokensburned privacy [public\|private]` | View or change card visibility |
| `tokensburned doctor` | Diagnose collection, connection, and privacy |
| `tokensburned update` | Check for a newer release and catch up recent history |
| `tokensburned disconnect` | Revoke this device's credential |

`run` installs a user-level service that reads supported local sources once a minute, persists the queue, and retries on the service's schedule. It requires no root privileges. Use `run --stop` to remove login startup and `run --foreground` for diagnostics or on platforms without a supported service manager. `burn` is a shorter alias for `tokensburned`.

Maintenance commands such as scoped history backfill, authenticated totals, and account deletion are listed by `tokensburned help --advanced`. Command migration notes and the manual import contract are in [Local collection contracts](docs/cli-collection.md) and [Usage import](docs/usage-import.md).

## Privacy and security

| Uploaded | Never uploaded |
| --- | --- |
| Token counts | Prompts and responses |
| Harness, provider, and model labels | Source code and tool payloads |
| Hashed session identifier | Repository names and paths |
| 15 minute time bucket | Transcript files and paths |
| Request count | API keys and provider credentials |

An unrecognized gateway is recorded by hostname only. Device credentials expire after 180 days and can be revoked at any time with `tokensburned disconnect`. Server-side aggregates are retained until you run `tokensburned delete-server-data`. TokensBurned installs no root daemon, traffic proxy, or Git synchronization task. The complete data boundary and authentication model are documented in [SECURITY.md](SECURITY.md).

## Usage limits

- Each GitHub account has five device slots. A disconnected device keeps its slot reserved for up to 30 days, and the same device can reconnect into that reservation.
- Successful connections are limited to five per rolling 10 minutes and ten per rolling 24 hours per account.
- History backfill covers a user-selected range of 1 to 90 days.
- Deleting server data removes usage, credentials, the account profile, and the public card. Outstanding slot reservations and connection allowances expire on their normal schedule.

The full policy is published at [tokensburned.com/limits](https://tokensburned.com/limits.html).

## Documentation

- [Website and card builder](https://tokensburned.com/)
- [Security and privacy boundary](SECURITY.md)
- [Local collection contracts and command migration](docs/cli-collection.md)
- [Usage import contract for integrators](docs/usage-import.md)
- [Usage limits](https://tokensburned.com/limits.html)

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) for local setup, testing, and the rules for new collection paths. Report security issues privately as described in [SECURITY.md](SECURITY.md) before opening a public issue.

## License

[MIT](LICENSE) © 2026 [Parsifal1986](https://github.com/Parsifal1986)
