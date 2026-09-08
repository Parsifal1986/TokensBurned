# Contributing to TokensBurned

This guide covers development of the TokensBurned client, plugins, and website.

## Prerequisites

- Node.js 20 or newer
- npm

## Getting started

```bash
npm install
npm run plugin:sync
npm run check
```

To run the static website locally:

```bash
npm run dev
```

The site is served at `http://127.0.0.1:4173`.

## Repository layout

| Path | Contents |
| --- | --- |
| `src/`, `bin/` | The standalone client and CLI entry point |
| `skills/`, `commands/`, `hooks/` | Shared plugin components for the supported harnesses |
| `integrations/` | Harness-specific integration code, such as the Cline plugin |
| `public/` | The static website and card builder |
| `docs/` | Public user documentation (`cli-collection.md`, `usage-import.md`, and the translated READMEs) |
| `plugins/tokensburned/` | Generated plugin runtime. Do not edit this directory directly. |
| `test/` | Node test suite |

`plugins/tokensburned/` is produced by `npm run plugin:sync` from the shared sources. CI fails when the generated copy is out of date, so run the sync after every change to `src/`, `bin/`, `skills/`, `commands/`, `hooks/`, `integrations/`, or the public docs.

## Development workflow

1. Make your change in the shared sources.
2. Run `npm run plugin:sync`.
3. Run `npm run check`. It performs a syntax check and runs the complete test suite.
4. Add focused tests whenever you change parsing, normalization, privacy boundaries, card composition, or install manifests.

## Documentation policy

Write public documentation in the style of a maintained commercial open-source product: concise, accurate, and focused on installation, supported behavior, and user tasks. Do not include private service architecture, infrastructure, deployment procedures, internal limits, or operational details. Document only the interfaces required to use and contribute to this client.

Only user-facing documentation is published. The `docs/` directory is ignored by Git except for an explicit allowlist in `.gitignore`. Working notes, plans, audits, cost analyses, and implementation diaries stay local and are never committed. When a new document is explicitly approved for publication, add it to the allowlist, to the npm `files` list in `package.json` if it ships with the package, and to `scripts/sync-plugin-runtime.js` if the plugin bundle needs it.

## Pull requests

- Keep new collection paths allow-list based. Read only the fields needed for token counts and model attribution.
- Do not add prompt, response, or source-code collection under any circumstances.
- State precisely which harness and version you used for integration testing.
- Label every compatibility claim as native, plugin workflow, adapter, or fallback.
- Update the README and the translated READMEs in `docs/readme/` when user-visible behavior changes.

## Release process

Releases are cut by maintainers.

1. Open a pull request that bumps the version in `package.json`, `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`, and the generated plugin runtime, and merge it.
2. Tag the merge commit as `vX.Y.Z` and publish a GitHub Release. Prereleases and drafts are ignored by the update checker.
3. Pin the plugin catalogs to the published release:

   ```bash
   node scripts/promote-release.mjs vX.Y.Z
   ```

   The script verifies that the release is published, that the tag and the package version agree, and then writes the release tag and commit into the marketplace catalogs. Review and merge the resulting change separately.

Installed plugins compare their version with the latest published release at most once every 24 hours. Versions with prerelease or local build suffixes never check for remote updates, so development builds are tested from a local checkout.

## Security issues

Report security issues privately to the maintainers before opening a public issue. See [SECURITY.md](SECURITY.md) for the data boundary this project commits to.
