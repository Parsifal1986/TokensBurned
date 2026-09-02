# TokensBurned architecture

TokensBurned separates local collection, server aggregation, and public rendering so each boundary can be inspected independently.

## Data flow

1. A harness plugin, official telemetry exporter, or explicit CLI import receives observed token usage.
2. The local client keeps only allow-listed counts and identity fields.
3. Native history is reduced locally into revisioned device/day envelopes with hourly and allow-listed dimension totals.
4. The production API authenticates a device token and stores aggregate usage.
5. If the user explicitly enables a public policy, normalized SVG variants are generated lazily and may only remove server-approved fields.

## Components

- `src/`: local CLI, history adapters, normalization, privacy controls, and server client.
- `plugins/tokensburned/`: self-contained runtime installed by Claude Code and Codex.
- `integrations/`: harness-specific adapters that cannot share the Open Plugin Spec runtime.
- `public/`: GitHub Pages site and interactive install/card builders.

## Deduplication

Native envelopes use a stable device/day identity and a monotonically increasing revision. The service keeps the highest revision, making retries idempotent.

## Storage

- The production service stores only authenticated aggregate usage and card policy.
- Public cards are cached only for users who explicitly opt in; disabling publication removes cached variants and blocks the public route.
- Device bearer tokens stay in `~/.burn/credentials.json` with user-only file permissions, expire after 180 days, and can be revoked independently.

## Trust boundary

Raw transcripts are never sent to the Worker. The client parser opens only the approved harness history directory and extracts token usage fields locally. See [../SECURITY.md](../SECURITY.md).
