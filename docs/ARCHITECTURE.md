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

On reconnect, the client supplies the previous device ID (never the old secret) to
the authorized device-code poll. After GitHub authorization, the Worker rotates
the credential on the existing device row only if it belongs to that account.
Expired or explicitly revoked credentials and a changed token pepper therefore
do not create another usage identity. A new or missing device, or a different
account, receives a new ID. Disconnect retains the non-secret ID and API origin;
deleting local data removes that recovery hint.

Reusing a device preserves the local outbox acknowledgements, so unchanged
backfills need no upload. New usage replaces the same absolute daily snapshot.
A genuinely new identity resets acknowledgements, with a generation guard so an
in-flight upload from the old connection cannot acknowledge the new one. Clients
refuse reconnect results from older Workers that do not explicitly report
`device_reused`; deploy the Worker update before updating clients.

No new tables, migrations, per-event hashes, or ingest reads/writes are needed.
An existing-device reconnect uses one primary-key UPDATE instead of an INSERT;
an unmatched hint adds one zero-match UPDATE before creating a device. Renewal
also rotates the signing public key. An atomic account-cap predicate allows an
active device to rotate at the five-device limit, while an expired/revoked device
can reactivate only when there is room; this uses the existing per-account index
instead of the count-before-insert path. This
prevents future reconnect duplication while the previous identity is retained.
It does not merge duplicates already stored under separate device IDs, or detect
copied history after all local identity data has been deleted.

## Storage

- The production service stores only authenticated aggregate usage and card policy.
- Public cards are cached only for users who explicitly opt in; disabling publication removes cached variants and blocks the public route.
- Device bearer tokens stay in `~/.burn/credentials.json` with user-only file permissions, expire after 180 days, and can be revoked independently.

## Trust boundary

Raw transcripts are never sent to the Worker. The client parser opens only the approved harness history directory and extracts token usage fields locally. See [../SECURITY.md](../SECURITY.md).
