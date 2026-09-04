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

Device identity remains separate from credentials. Reconnect rotates both the
secret and signing public key while preserving the device/day history identity.
This prevents future reconnect duplication while the previous identity is retained.
It does not merge duplicates already stored under separate device IDs, or detect
copied history after all local identity data has been deleted.

## Free device slots and connection limits

The server provides five slots per GitHub account. Credential expiry releases a slot immediately.
Manual revocation reserves it for up to 30 days, capped by credential expiry. Reconnecting the
same device within that reservation reuses the slot and cancels the cooldown;
disconnecting again starts a fresh cooldown. Once its reservation has ended,
reconnecting needs an available slot. Cloud history and local upload ACKs survive
disconnect. Deleting local files does not release a server slot.

Worker migrations 0008 through 0010 enforce slot allocation and successful credential
issuance atomically with database triggers. Connection limits are five per rolling
10 minutes and ten per rolling 24 hours, counting new devices and rotations, but
not polling or failed issuance. The short connection ledger is separate from usage
and is pruned on successful connection and daily cleanup. Normal ingestion does not
perform new slot or connection-quota writes. Existing IP/device request limits
still run before authentication database reads.

Disconnect accepts retries signed with the revoked credential only on the revoke
endpoint and returns its original cooldown dates. A conditional update prevents
an old disconnect from revoking a concurrently renewed credential. Clients clear
local secrets after success, retain the ID, and display the server's release time.
Deploy the migrations and Worker before this client to enable these policies.

## Storage

- The production service stores only authenticated aggregate usage and card policy.
- Public cards are cached only for users who explicitly opt in; disabling publication removes cached variants and blocks the public route.
- Device bearer tokens stay in `~/.burn/credentials.json` with user-only file permissions, expire after 180 days, and can be revoked independently.

## Trust boundary

Raw transcripts are never sent to the Worker. The client parser opens only the approved harness history directory and extracts token usage fields locally. See [../SECURITY.md](../SECURITY.md).

## Allowances after account deletion

A dedicated stable `QUOTA_PEPPER` derives an HMAC account key from the verified
numeric GitHub ID. It is independent of credential pepper rotation. Legacy quota
records are migrated to this key on authorization or before account deletion.
Deletion removes usage, credentials, and the profile; database triggers preserve
only unexpired slot reservations, and the 24-hour connection ledger has no account
foreign key. Recreating the same GitHub account therefore retains both limits.
Outstanding records stop counting at their deadlines and are pruned daily.
