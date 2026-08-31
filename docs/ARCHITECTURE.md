# TokensBurned architecture

TokensBurned separates local collection, server aggregation, and public rendering so each boundary can be inspected independently.

## Data flow

1. A harness plugin, official telemetry exporter, or explicit CLI import receives observed token usage.
2. The local client keeps only allow-listed counts and identity fields.
3. Native history is reduced into revisioned 15 minute snapshots. OTLP events are normalized into the same dimensions.
4. The Cloudflare Worker authenticates a device token and writes aggregates to D1.
5. If the user explicitly enables a public policy, R2 stores its default pre-rendered SVG. Custom card combinations render from the same summary data and may only remove server-approved fields.

## Components

- `src/`: local CLI, history adapters, normalization, privacy controls, and server client.
- `plugins/tokensburned/`: self-contained runtime installed by Claude Code and Codex.
- `integrations/`: harness-specific adapters that cannot share the Open Plugin Spec runtime.
- `serverless/src/`: Cloudflare Worker auth, ingest, OTLP parsing, summaries, and SVG rendering.
- `public/`: GitHub Pages site and interactive install/card builders.

## Deduplication

Native snapshots use a stable hashed session, harness, model, bucket, and monotonically increasing revision. The server keeps the highest revision. When a native snapshot overlaps with OTLP activity for the same user, harness, and bucket, the native snapshot wins.

## Storage

- D1 stores users, device credentials, aggregate snapshots, and accepted OTLP events.
- R2 stores default cards only for users who explicitly opt in; disabling publication deletes the object and blocks the public route.
- Device bearer tokens stay in `~/.burn/credentials.json` with user-only file permissions, expire after 180 days, and can be revoked independently.

## Trust boundary

Raw transcripts are never sent to the Worker. The client parser opens only the approved harness history directory and extracts token usage fields locally. See [../SECURITY.md](../SECURITY.md).
