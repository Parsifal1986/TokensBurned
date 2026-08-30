# Security and privacy boundary

Burn is designed so its product promise is also its architecture.

Burn may read:

- usage metadata delivered to an official lifecycle hook;
- known harness configuration fields needed for best-effort backend attribution;
- its own files under `~/.burn`.

Burn does not open transcript or rollout/session history, recursively scan the home directory, read prompt or response fields for attribution, inspect source repositories, read API keys, intercept traffic, install a proxy, or start a daemon.

In the current `0.1.x` release, the only network destination is GitHub, and only after profile sync is configured. Public output contains aggregate totals and, by default, harness/provider percentages. It never contains endpoints, raw events, timestamps, repository names, machine information, or credentials. Provider publication can be disabled with `burn privacy private`.

The serverless v2 collector in `serverless/` is not yet the default release. Its native endpoint accepts revisioned 15-minute usage snapshots. Its OTLP endpoints immediately reduce incoming documents to an allow-list of token counts, harness, provider, model, coarse time bucket and a deterministic replay id. Raw OTLP documents, prompts, tool details, output snippets, user email, repository names and file paths are not persisted.

Device credentials are scoped to usage writes and self-service reads. Production secrets belong in Cloudflare Worker Secrets and must never be committed. Public SVG cards are generated from aggregate counters and contain no device or session identifiers.

Please report security issues privately to the maintainers before opening a public issue.
