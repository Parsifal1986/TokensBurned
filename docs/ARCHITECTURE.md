# TokensBurned architecture

TokensBurned separates local collection, server aggregation, and public rendering so each boundary can be inspected independently.

## Data flow

1. A harness plugin or an explicit CLI import receives observed token usage.
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

The Worker accepts one write per device/day per UTC hour for the current day and
one per UTC day for earlier days. Its response acknowledges only days it actually
wrote, or whose stored revision already covers the submitted one; days that fell
inside a closed write window are listed in an optional `throttled_days` array with
a `retry_after`. The local outbox advances `acked_revision` only for acknowledged
days, records `last_successful_upload_at` only when at least one day was
acknowledged, and defers the next flush by the server's `next_flush_after`.
Older Workers omit these fields, which the client treats as "nothing throttled".

Each dimension map (harness, provider, model) is capped locally at 32 keys, the
Worker's limit, with the smallest values folded into `other`. If the Worker still
rejects a batch as invalid (`400 invalid_payload` / `too_many_dimensions`), the
client retries each day separately and parks only the rejected days at their
current revision, so one bad day never blocks the rest; a later local change to
that day produces a new revision and retries it automatically.

The `SessionEnd` hook merges the session transcript into the outbox on every
session but uploads at most once per hour; only the explicit `backfill` command
and `connect --backfill` force an immediate upload.

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

While waiting for GitHub, the connect command keeps polling until the
authorization deadline: HTTP 429 waits for the server's `retry_at`, transport
errors and 5xx back off exponentially up to 30 seconds, and only definitive 4xx
answers (`authorization_failed`, `invalid_grant`, `expired_token`) end the wait
with a readable reason.

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

## Hook installation

The Claude Code plugin ships its own `SessionEnd` hook in `hooks/hooks.json`.
`tokensburned hooks install` writes an equivalent hook into
`~/.claude/settings.json` only for installs that do not use the plugin: it
refuses when it runs inside the plugin (`CLAUDE_PLUGIN_ROOT`) or when Claude
Code's plugin registry already lists TokensBurned, because two hooks would count
every session twice locally.

## Storage

- The production service stores only authenticated aggregate usage and card policy.
- Public cards are cached only for users who explicitly opt in; disabling publication removes stored variants, purges the API's edge cache (which otherwise expires within five minutes), and blocks the public route. Downstream caches such as GitHub's image proxy may keep a copy for up to one hour.
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
