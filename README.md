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
  <img src="assets/demo-card-builder.gif" width="840" alt="TokensBurned card builder preview" />
  <p><sub><a href="https://tokensburned.com/#card-builder">Open the interactive card builder</a>. The preview uses fictional local data.</sub></p>
</div>

## Features

- **Live profile card.** Display usage totals, a seven-day trend, an activity heatmap, tool breakdowns, and optional streak, cache, and rank badges. Embed one image link in your profile.
- **Local reduction.** Usage records are processed on your device. Only aggregate counts and attribution metadata are uploaded.
- **Strict privacy boundary.** Prompts, responses, source code, repository names, transcript paths, and API keys are never retained in usage statistics or uploaded. See [Privacy and security](#privacy-and-security).
- **Private by default.** Connecting an account and uploading aggregates does not create a public card. Publishing is a separate, explicit command.
- **Accurate attribution.** Harness, provider, and model are recorded as separate identities. A Claude Code session that talks to a different provider is labeled as such.
- **Honest compatibility.** Native hooks, plugin workflows, and the standalone CLI are labeled separately so you know how each harness is measured.

## Supported harnesses

This table describes the current source. For an installed release, consult the README at its [release tag](https://github.com/Parsifal1986/TokensBurned/releases).

| Harness | Install surface | Token source | Support level |
| --- | --- | --- | --- |
| Claude Code | Plugin marketplace | Lifecycle hooks and approved local history | Native |
| Codex | Plugin marketplace | Plugin hooks and approved local history | Native |
| Cline CLI / SDK / classic IDE | Cline plugin and standalone CLI | `afterModel`, SDK messages and classic task metrics | Format-scoped per-call capture and backfill |
| OpenCode | Standalone CLI | v1/v2 SQLite and legacy message JSON | Finalized request usage; history backfill |
| Gemini CLI | Gemini extension and standalone CLI | Recorded JSON/JSONL usage | Background collection and backfill |
| GitHub Copilot CLI | Setup plugin and live extension | Official `assistant.usage` events | Live per-call capture; no transcript backfill |
| Cursor, Aider, others | Standalone CLI | Integrator-supplied observed usage | No automatic capture |

TokensBurned uses reported token counts, not estimates based on prompt length or cost. Support depends on the tool version and available usage records. Details for each source are in [Local collection contracts](docs/cli-collection.md).

## Quick start

Background collection requires Node.js 20 or newer and the standalone CLI:

```sh
npm install -g tokensburned
```

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

### Using the CLI with plugins

Use the same `BURN_HOME` directory (default: `~/.burn`) and connection for the CLI and plugins. Keep them on the same version. The client deduplicates supported usage records, so the background collector and plugin hooks can run together.

Do not configure separate data directories to collect the same history, or manually import records that an automatic collector already tracks. Doing so can duplicate usage.

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

Privacy settings always apply. A hidden activity history does not appear in the trend, and query parameters cannot reveal anything your account has not published. Use the card builder to generate a link with your preferred options.

## Command line

The standalone CLI collects usage from the supported tools listed above and manages your connection, uploads, and privacy settings. Requires Node.js 20 or newer.

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

| Uploaded usage data | Never included in usage uploads |
| --- | --- |
| Aggregate token and request counts | Prompts, responses, source code, and tool payloads |
| Tool, provider, and model labels | Repository names, file paths, and raw transcripts |
| Activity dates and hours | Session IDs, API keys, and provider credentials |

Usage files are processed locally. Raw message content is not retained in the client's statistics. An unrecognized provider endpoint may be labeled by hostname; review your attribution with `tokensburned doctor` before publishing.

Cards are private by default. Use `tokensburned privacy public` to publish or `tokensburned privacy private` to hide your card. Use `tokensburned disconnect` to disconnect this device. For account data removal, see `tokensburned help --advanced`.

Read [SECURITY.md](SECURITY.md) for the client's data handling and vulnerability reporting policy. Current account limits are available on the [usage limits page](https://tokensburned.com/limits.html).

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
