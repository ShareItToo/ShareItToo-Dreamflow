# S4A private support evidence security - architecture

Status: locally verified on 22.08.2026 at exact implementation commit
`06cef70fda31e2f83e621fc367909366b7277390`. This is a disabled, non-live
implementation for Drive scenarios `SUP-099` through `SUP-105`. It does not
activate production intake, a real malware-scanning provider, external AI,
Payment, Store, Firebase Console, Cloud/VPS/DNS, a signed candidate or public
rollout.

## Source basis

- Drive `13_SIT_SUPPORT_TEST_MATRIX_V1.md`, scenarios `SUP-099` through
  `SUP-105`.
- Drive Support Source of Truth: private support evidence must not be sent to
  external generative AI and upload limits remain an explicit pre-operation
  decision.
- Existing canonical support-case participation, immutable evidence, audit,
  privacy export and open Retention-policy boundaries.

## Intake and file trust

`SUPPORT_EVIDENCE_INTAKE_ENABLED` defaults to false and process startup refuses
to enable it in production. The current scanner transport is `none` and the
operating mode is `simulation`; the only terminal scan adapter is an explicit
internal test fixture. Therefore this package proves the security workflow but
does not claim real pilot or production malware-scanning readiness.

The multipart route accepts exactly one file of at most 8 MiB and four bounded
metadata fields. Only detected JPEG, PNG or WebP bytes are accepted. A client
filename is never trusted, persisted or returned; generated UUID-based storage
names are used instead. A claimed MIME type that conflicts with detected magic
bytes fails closed. Active markup and unsafe control characters in description
or purpose are rejected before persistence.

The deterministic EICAR-style fixture is recognized before image parsing and
is retained only under a quarantine storage name. It receives no preview and
cannot receive an access grant. This proves the quarantine path without calling
an external scanner or representing the fixture as a production antivirus
service.

## Immutable original and separate preview

The received bytes are hashed before storage. An accepted image is decoded and
re-encoded through the existing media pipeline into a separate WebP preview.
Original and preview have separate byte counts and SHA-256 values. PostgreSQL
migration `051` makes their identifiers, paths, formats, dimensions and hashes
immutable; scan state may move exactly once from `pending` to `clean`,
`quarantined` or `failed` and is terminal thereafter.

The original has no HTTP retrieval route. Only a clean preview may be returned.
Before each response, the application re-reads the generated preview, verifies
its stored byte count and SHA-256, sets `private, no-store` and `nosniff`, and
returns the verified hash in a response header. Preview generation therefore
cannot overwrite or silently substitute the original.

## Authorization and replay

Upload requires an active authenticated account that is the reporter or an
affected participant of an active canonical support case. A transaction lock
plus uploader/idempotency-key uniqueness converges exact retries on one record;
changed request bytes or metadata conflict.

A preview grant is possible only for a clean file and current case participant.
It contains 256 bits of random material, but PostgreSQL stores only its SHA-256
digest. The grant is bound to the exact user and active authentication session,
expires after 120 seconds in the current configuration and can never exceed
five minutes at schema level. Preview authorization rechecks the session,
account middleware, case participation, scan status and expiry on every use.
A forwarded token from another user or session and an expired token both fail
closed.

## Privacy, evidence and retention

Stored integrity metadata labels every upload
`user_submitted_unverified` and
`usableAsDecisionEvidenceWithoutReview=false`. Neither filename nor storage
path is exposed in list, event, audit or export projections. The account export
contains only the submitting user's safe evidence metadata, hashes and scan
state. The Retention inventory counts file truth under `moderation` and access
grants under `securityAudit`, but invents no period, purge eligibility or
deletion worker.

The workflow contains no network client, provider URL or external-AI switch.
Both runtime and schema force `external_ai_used=false`. Privacy and Retention
validators bind the exact workflow and migration hashes while both manifests
remain `draft` and fail closed.

## Rollback

Operational rollback is to leave intake disabled and retain evidence. Migration
rollback succeeds only while both new tables are empty. Once evidence or a
grant exists it refuses to drop the schema, preventing silent loss of retained
original/hash/audit truth.

## Local verification

- Twelve focused workflow and permanent-wiring tests passed.
- Privacy validator plus 17 tests and Retention validator plus 41 tests passed.
- A fresh isolated PostgreSQL 16 database applied all migrations through `051`
  twice idempotently and passed the exact integration route, quarantine, IDOR,
  expiry, forwarded-token, hash, immutability, export and inventory checks.
- The complete backend run passed 508 tests with one expected no-database skip;
  the isolated PostgreSQL integration then passed without a skip.
- Complete CI-equivalent technical regression accepted the 220-issue analyzer
  baseline, passed 369 Flutter tests with one documented skip, the separate
  Google-only profile test, Web build/loopback smoke and Android debug APK.
- The secret scanner found no high-confidence secret in history or the working
  tree.

GitHub push and CI verification are still pending because the previously stored
GitHub CLI HTTPS credential expired after the local commit. No new OAuth token
or SSH trust was created automatically.

## Remaining external gates

A real external or self-hosted malware scanner, its contract/DPA/security
review, approved upload limits and Retention periods, operator procedures,
manual accessibility/device testing, signed-candidate binding and actual pilot
or production activation remain separate gates. None is inferred from this
technical package.
