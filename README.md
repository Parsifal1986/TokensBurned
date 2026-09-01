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
- **Honest compatibility.** Native hooks, official OTLP, and CLI fallback are labeled separately.

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
      <p><strong>Official extension + GenAI OpenTelemetry</strong></p>
      <pre><code>gemini extensions install https://github.com/Parsifal1986/TokensBurned
gemini
/tokensburned:connect
/tokensburned:telemetry
/tokensburned:privacy
/tokensburned:update
/tokensburned:doctor</code></pre>
      <p>The telemetry command keeps <code>logPrompts</code> disabled and configures the authenticated JSON exporter.</p>
    </td>
    <td width="50%" valign="top">
      <h3>GitHub Copilot CLI</h3>
      <p><strong>Open Plugin Spec + CLI collection</strong></p>
      <pre><code>copilot plugin install https://github.com/Parsifal1986/TokensBurned</code></pre>
      <p>Ask Copilot to connect TokensBurned. Copilot hooks currently expose lifecycle events but not token totals, so the data path remains CLI assisted.</p>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <h3>Cline CLI</h3>
      <p><strong>Native afterRun usage hook</strong></p>
      <pre><code>cline plugin install https://github.com/Parsifal1986/TokensBurned.git</code></pre>
      <p>The plugin uploads only the usage object returned by Cline. Cline plugins currently apply to CLI, SDK, and Kanban, not the VS Code or JetBrains extensions.</p>
    </td>
    <td width="50%" valign="top">
      <h3>OpenCode, Cursor, Aider, other</h3>
      <p><strong>OTLP or standalone CLI</strong></p>
      <pre><code>npm install -g github:Parsifal1986/TokensBurned
tokensburned connect
tokensburned doctor</code></pre>
      <p>Use standard OTLP/HTTP JSON when the harness exports observed token fields. Otherwise use an explicit batch import. TokensBurned does not estimate usage from prompt text.</p>
    </td>
  </tr>
</table>

### Compatibility at a glance

| Harness | Install surface | Token source | Current level |
| --- | --- | --- | --- |
| Claude Code | Plugin marketplace | Session hook + approved local history | Native |
| Codex | Plugin marketplace | Plugin hook + approved local history | Native |
| Gemini CLI | Gemini extension | Official GenAI OTLP events | Native telemetry |
| Cline CLI / SDK | Cline Git plugin | `afterRun().result.usage` | Native telemetry |
| GitHub Copilot CLI | Open Plugin Spec | CLI or external OTLP | Plugin workflow |
| OpenCode | Configured plugin/exporter | OTLP or batch API | Adapter |
| Cursor, Aider, others | Standalone CLI | Explicit OTLP or batch API | Fallback |

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

## CLI fallback

The standalone CLI is the stable escape hatch for any harness:

```bash
npm install -g github:Parsifal1986/TokensBurned
tokensburned connect
```

| Command | Purpose |
| --- | --- |
| `tokensburned connect` | Authorize GitHub and create a 180-day device credential; the public card stays off. |
| `tokensburned backfill --harness codex --dry-run` | Preview Codex history without uploading. |
| `tokensburned backfill --harness claude-code --days 30` | Import an approved Claude Code range. |
| `tokensburned backfill --all-harnesses --days 30` | Explicitly import every recognized local harness. |
| `tokensburned server` | Show server totals and the public SVG URL. |
| `tokensburned update` | Force a release check and print the current harness's plugin-manager command when an update is available. |
| `tokensburned privacy` | Show the GitHub account's current public-card policy without changing it. |
| `tokensburned privacy public` | Explicitly publish aggregate activity tied to your GitHub identity. |
| `tokensburned privacy private` | Disable the public route and remove the cached SVG. |
| `tokensburned disconnect` | Revoke this device credential and remove the local connection. |
| `tokensburned delete-server-data` | Delete server aggregates, devices, identity, and public card. |
| `tokensburned doctor` | Show detected harnesses and data boundaries. |

`burn` remains a shorter alias for `tokensburned`.

Installed harness plugins also perform a best-effort release check at SessionStart,
throttled to once every 24 hours. Update failures never block startup, and applying
an available update always requires an explicit user request.

## Privacy boundary

| Uploaded | Never uploaded |
| --- | --- |
| Token counts | Prompts and responses |
| Harness, provider, model | Source code and tool payloads |
| Hashed session identifier | Repository names and paths |
| 15 minute time bucket | Transcript files and paths |
| Request count | API keys and provider credentials |

The lifecycle upload is short and best effort. Server aggregates are retained until you run `tokensburned delete-server-data`; credentials expire after 180 days and can be revoked sooner. TokensBurned installs no cron job, daemon, proxy, or Git synchronization task. See [SECURITY.md](SECURITY.md) for the complete boundary.

## License

[MIT](LICENSE) © 2026 [parsifal1986](https://github.com/Parsifal1986). Issues and pull requests are welcome; contributor and implementation notes live in [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), and [`docs/`](docs/).
