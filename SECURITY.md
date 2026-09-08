# Security policy

TokensBurned collects AI coding usage metadata while keeping conversation content and source code on your device.

## Reporting a vulnerability

Report suspected vulnerabilities through [GitHub private vulnerability reporting](https://github.com/Parsifal1986/TokensBurned/security/advisories/new). Include the affected client version, reproduction steps, and the potential impact. Do not include credentials, private transcripts, or customer data in a report.

Please avoid public issues for undisclosed vulnerabilities. Use the latest published client release when confirming an issue.

## Local data access

The client reads usage metadata from supported tools, configuration fields needed for provider and model attribution, and its own files under `BURN_HOME` (default: `~/.burn`). See [supported sources](docs/cli-collection.md) for the local paths and formats.

After you connect, installed plugin hooks can process that tool's usage history. Running `tokensburned run` enables collection from the selected local sources. Explicit history imports are limited to the tool and date range you select. JSON and JSONL records are parsed locally; message content is not retained in statistics or uploaded. SQLite sources are opened read-only and queried for usage fields.

Collected statistics contain token counts, request counts, tool/provider/model labels, and activity times. Request and session identifiers used for local deduplication are not included in usage uploads. Provider attribution can include an endpoint hostname, but excludes URL paths, credentials, and query strings.

## Uploads and credentials

Usage uploads contain aggregate counts, attribution labels, and activity dates and hours. They exclude prompts, responses, tool payloads, source code, repository names, paths, raw transcripts, and provider credentials.

Connection requires authorization through GitHub. Approve only a connection you initiated and verify the code displayed by your client. TokensBurned stores its device credential and signing key in `BURN_HOME` with user-only permissions. Do not copy or publish this directory. Run `tokensburned disconnect` to revoke the current connection.

## Background operation

On macOS and Linux, `tokensburned run` installs a user-level service that continues after the terminal closes. It requires no root access. `tokensburned run --stop` removes login startup and stops that collector without deleting queued usage. `tokensburned run --foreground` runs collection in the current terminal.

Plugin hooks may start a temporary upload process. All supported collection paths share the local queue and upload schedule. No traffic proxy or recurring Git synchronization job is installed. Plugins can check for updates but do not install them without your request.

## Publishing and removal

Cards are private by default. Publishing with `tokensburned privacy public` makes your selected activity data and GitHub identity publicly visible. Visibility settings apply across your connected devices.

Use `tokensburned privacy private` to hide the card. Previously downloaded or externally cached images may remain visible. Use `tokensburned help --advanced` for account data removal commands and review the displayed confirmation before proceeding.
