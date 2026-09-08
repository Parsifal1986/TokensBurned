# Test suite review — 2026-09-08

Scope: the 105 Burn tests after the harness compatibility fixes. The counts below record the earlier cleanup stage; this collector PR contains 104 passing tests after excluding unreleased card tests and adding collector/service coverage.

## Removed or consolidated

| Previous test | Decision and remaining coverage |
| --- | --- |
| Landing page Taste Skill anti-tell budget | Remove punctuation, class-count and styling bans. These enforce a particular design rather than product behavior. |
| Cline integration uploads only aggregate usage fields | Remove source-code regex checks. Executed Cline tests check normalized counters, model switches, duplicate messages, throwing content/snapshot getters, failure handling and durable queuing. The subprocess test still verifies BURN_HOME credential lookup. |
| Gemini extension ships focused setup commands | Remove the exact six-filename snapshot. It cannot establish that commands work and rejects harmless additions. Manifest checks remain; command execution inside Gemini is still unverified. |
| Keeps the harness section below the token total | Remove exact y=166/y=177 assertions. They do not measure overlap or text bounds. Rendering labels and provider privacy remain tested; visual layout needs preview review. |
| Hook payloads keep the event name and nothing else from the harness | Consolidate into the existing sanitizer test, retaining event-name preservation and prompt/notification exclusion checks. |

Result: 100 test cases, down from 105 (four removed, two consolidated into one).

## Assertion cleanup

- Replace the large homepage source snapshot with a focused check of declared privacy metadata and the fictional demo. Remove assertions tied to copy, selectors, function names, theme implementation and preview query strings. This static test does not claim to verify browser interaction or network behavior.
- Compare bundled skills against source skill directories and contents instead of freezing a list of six names. Missing or stale bundled skills still fail.
- Remove the optional SVG blocks' hardcoded height and rename the test to describe what it actually checks: disabled blocks disappear.
- Narrow the disabled OTLP documentation guard to the obsolete setup command and exporter endpoint assignment. Merely mentioning OTLP, including explaining that it is unsupported, should not fail a test. The obsolete command-file absence check remains.

## Deliberately retained

Keep normalization, history boundaries, exclusive counters, immutable request conflicts, prototype-key handling, atomic storage, upload revisions/ACKs, retry/backoff, persisted leases, worker lifecycle, authentication/origin isolation, redirects, privacy, translations and CLI integration coverage.

Similar unit and integration scenarios are not automatically duplicates: outbox throttling checks the algorithm, while hook subprocess tests check that lifecycle events actually use it. Cline restart/concurrency tests check adapter-to-storage wiring; pure merge tests isolate arithmetic and conflict atomicity. Update polling and onboarding tests cover different persistence and notification behavior.

No native harness installation or real cloud upload is needed for this review. The automated fixtures do not prove compatibility with every installed harness version or visual layout correctness.

## Verification

`npm test`: 100 passed, 0 failed, 0 skipped (42.1 seconds). After retaining the explicit prompt-key exclusion assertion, the five schema tests also passed. `git diff --check` passed. No deployment was performed.
