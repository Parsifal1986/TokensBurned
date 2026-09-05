# Security and privacy boundary

TokensBurned is designed so its privacy promise is also its architecture.

The [September 2026 security review](docs/security-review-2026-09-04.md) records client fixes, regression checks, and deployment items that still require verification.

## Data it may read

TokensBurned may read:

- usage metadata delivered by an official harness lifecycle hook;
- known harness configuration fields needed for best-effort provider and model attribution;
- its own files under `~/.burn`;
- after explicit backfill consent, JSONL files under the selected harness directory (`~/.codex/sessions` or `~/.claude/projects`), limited to a user-selected 1–90 day range; reading both requires the explicit `--all-harnesses` flag;
- at `SessionEnd`, the single transcript path supplied by the harness, only when the user has already connected TokensBurned.

The history parser uses resolved-path boundary checks and rejects a transcript outside the recognized harness directory. It streams each file and extracts only usage counters, model identifiers, session identifiers, and timestamps. It does not retain message content.

## Data sent to the API

Native ingestion sends only:

- input, output, cache-read, cache-write, and reasoning token counts;
- harness, provider, and model labels;
- a device/day revision with hourly aggregate slots and request counts.

Prompts, responses, tool payloads, source code, repository names, transcript paths, raw session files, machine information, API keys, and GitHub credentials are not included in ingestion requests.

The Worker reduces supported OTLP documents to the same allow-list before persistence. Raw OTLP documents are not persisted.

Profile cards are private by default. Publishing requires the explicit `tokensburned privacy public` command (or `connect --publish-card`). A published card may expose totals, harness/provider/model labels, activity heatmaps, rank, and GitHub identity. The stored server policy belongs to the verified GitHub account and is authoritative across every connected device: connecting another device inherits the existing policy and never resets or republishes it. URL query parameters can hide fields but cannot publish a field the account has disabled. `tokensburned privacy private` immediately makes the route unavailable and removes the cached SVG.

## Authentication and local behavior

GitHub OAuth is used to verify account identity. The browser requires the short code shown by the client, displays the requesting device name, and requires a second confirmation before redirecting to GitHub. The short authorization can be claimed only once. The resulting GitHub user token is used once to read the authenticated identity and is not stored.

TokensBurned issues a 180-day device credential for usage uploads and account self-service actions. New connections also create a unique P-256 signing key: the server receives only the public key, while the credential and private key stay in `~/.burn/credentials.json` with user-only permissions. Authenticated requests are signed over the method, URL, timestamp, and canonical body so a bearer token copied on its own cannot be replayed from another client. `tokensburned disconnect` revokes the current device. `tokensburned delete-server-data` deletes the user's aggregates, devices, account profile, and public card. Outstanding allowances remain under a keyed account identifier after deletion: recent connection times for their 24-hour window and slot release times for up to 30 days, capped by credential expiry. These records contain no raw GitHub ID, username, credential, or usage totals and are cleaned up regularly after expiry. Aggregates are otherwise retained until you delete them; expired authorization attempts are cleaned up, expired device credentials cannot upload or access account data (signed revocation retries remain allowed), and each GitHub account has five device slots, including devices cooling down for up to 30 days after revocation. Credential expiry releases a slot immediately, even during cooldown. The same device can reuse its reserved slot after GitHub authorization. Successful credential issuance is limited to five connections per rolling 10 minutes and ten per rolling 24 hours.

The plugin's `SessionEnd` hook sanitizes the event before launching a short-lived detached process because lifecycle hooks have a tight timeout. It sends the child only an allow-listed environment and the reduced JSON on standard input; it does not copy raw hook payloads or the parent process's credentials into environment variables. TokensBurned does not install a cron job, launch agent, daemon, traffic proxy, or recurring Git synchronization task for server ingestion.

At `SessionStart`, the plugin may query the public TokensBurned release endpoint at most once every 24 hours. It stores only the last-check time and public release metadata in `~/.burn/config.json`. A failed check never blocks startup, and the plugin never installs an update without an explicit user request.

Unauthenticated device-flow endpoints use persistent per-client rate limits. API and authorization responses disable caching and apply restrictive browser security headers.

Production service credentials are maintained outside this client repository and must never be committed.

Please report security issues privately to the maintainers before opening a public issue.
