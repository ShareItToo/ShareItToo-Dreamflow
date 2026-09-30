# Staging Web two-role fixture: preparation only

Original preflight source: `a16822038a4da747adb94713ec6f3b1e887adc89`.
Default-off catalog successor base: `c0fcb9b34227dfb8bf21e4ce6f40acb9629c62bd`.
The original Ops preflight remains read-only. The separately confirmed adapter
below prepares fixture rows and performs semantic cleanup, not a runtime
deployment, credential provisioner or authenticated browser acceptance.
No live application, category filter, access gate or provider flag is changed.

## Why execution is blocked

Source successor: `SIT_STAGING_SYNTHETIC_CATALOG_ENABLED` defines a default-off,
test/staging-only class for the sole existing guest listing/upload binding.
Production activation and invalid/multiple/non-Heilbronn bindings fail startup.
Activation additionally requires exact `PAYMENT_TRANSPORT=memory` and
`STRIPE_LIVEMODE=false`; absent values are rejected.
The isolated catalog branch requires a synthetic owner, active moderation,
approved category, Heilbronn/Germany display region, and an owner-matching,
scanned allowlisted upload. No publication declaration is manufactured.
Normal listing filters remain unchanged. Guest/authenticated projections carry
`catalogClass`, `bookingAllowed:false`, `paymentAllowed:false` and the notice.
Flutter cards/details/calendar entry show a nonbookable test view without real
owner, price, condition or availability claims. Quote/create/group/cart workflow
guards precede writes; bounded exact-route checks also block legacy sync.
Both supply-enrichment POST routes are immutable for the fixture and return
`409 synthetic_catalog_booking_forbidden` after the existing Staging access
gate and before DB work. Anonymous requests retain the normal authentication
rejection, without revealing fixture classification.
No new unauthenticated relation queries or extra authentication passes exist.

Activation requires a fresh proof of zero existing booking/group/cart/message/
payment/evidence dependencies. The adapter prepares DB state only; runtime flag
activation and credential provisioning remain separate, unopened gates.

The existing `/v1/listings` route in `src/app.js` requires a private listing
declaration and an allowed region before returning an active listing. Its
normal booking path must not substitute for the separately gated synthetic
class. Setting the missing declaration/region on the observed
guest fixture would therefore fabricate normal publication evidence, not merely
enable a harmless test illustration. A label alone is not a booking safeguard.

The local `synthetic_clone_booking_lane.js` is a separate loopback-only run
contract. It must not be enabled on public Staging as a shortcut.

The new preflight always returns `executable: false` and the explicit blocker
`synthetic_catalog_activation_not_prepared`, even when every input passes.
`execute: true`, extra CLI arguments, `SIT_WEB_FIXTURE_EXECUTE` and
`SIT_WEB_FIXTURE_CONFIRM` are rejected before a database query. There are no
credential-generation, SQL mutation, upload, HTTP login or cleanup branches.

## Private input and read-only invocation

Only after a separate authorization to prepare external inputs, supply a fresh
(maximum one hour old) 0600 manifest and 0600 JPEG in a 0700 directory owned by
the executing UID, outside this repository. Symlinks and in-repository inputs
are rejected; private bytes use the existing stable-descriptor reader.
Do not copy credentials, user identifiers or raw snapshots into this document.

In the exact approved backend runtime, with Node >=22 and its locked `pg`
dependency available, invoke:

```sh
node backend/ops/staging_web_fixture_preflight.mjs /absolute/private/manifest.json <manifest-sha256>
```

This is a runtime-context command, **not a host deployment command**. Runtime
identity, the scoped security-environment digest and the Green database hostname,
database and database-user tuple must match the manifest. Do not change the
environment to make it pass. In particular, SMTP/FCM/webhook/Stripe transports
fail this preparation boundary. A read-only failure does not authorize disabling
an existing service. Immutable Docker/image/mount/Production witnesses would
still be mandatory for a future execution orchestrator; this SQL preflight is
not a substitute for those witnesses.

Manifest contract is implemented in `validateFixtureManifest`:

- kind `sit-staging-web-two-role-preflight`, schema 1, exact Staging API target,
  unique `web-fixture-…` run ID, creation time and full runtime commit;
- exact scoped environment and complete snapshot SHA-256 digests; never log raw snapshots;
- exactly two different, already allowlisted synthetic `owner`/`renter` user
  identifiers and matching existing synthetic markers, ordered by role;
- both roles must have normalized lowercase `@example.invalid` email and
  `phone_e164=null`; provider identities and push devices remain forbidden.
  Password hashes may exist but are neither selected, logged nor changed;
- exactly the already guest-bound listing and upload, region `heilbronn`;
- `fixtureClass=synthetic_noncontractual_catalog_only`, `realOffer=false`,
  `ownerDeclaration=false`, `bookingAllowed=false`, `paymentAllowed=false`;
- notice exactly: “Synthetische Katalogfixture – kein reales Angebot, kein
  Vertrag, keine Zahlung”;
- photo file, SHA-256, JPEG MIME, `currentProductEvidence=false`, and exactly
  one provenance variant: `authentic_non_ai` requires HTTPS `sourceUrl`,
  `creator`, `license`, `capturedAt`; `synthetic_ai_illustration` instead requires
  `syntheticAi:true`, `generatedAt`, versioned `toolIdentity`, `promptHash`
  (not a raw prompt), `usageLicenseStatement`, and an optional actual HTTPS
  `sourceUrl`. Mixed/unknown fields and missing provenance fail closed;
- exact availability rules/blocks digest. This binds observed availability; it
  does not attest that a real item is available or change any calendar.

`fixtureDigest` canonicalizes object keys and PostgreSQL Date values. Snapshot
arrays retain query order. `readFixtureSnapshot` gathers explicit user identity/
eligibility/profile fields (never password material), exact listing/upload,
availability, bookings/requests, sessions,
provider identities and push-device dependencies in one REPEATABLE READ,
READ ONLY transaction with a five-second statement timeout, ending ROLLBACK.
Positive preparation requires no bookings/requests/provider identities/push
devices and no active sessions. It requires the observed listing still be
excluded by missing declaration and region binding. A fresh digest never
overrides synthetic ownership, moderation, media scan or access checks.

`fixtureEnvironmentDigest` binds the explicit versioned `fixtureEnvironmentKeys`
inventory: all preflight/access-gate/effect checks, `NODE_ENV` including its
fallback, both forbidden execution switches, database URL and `pg` environment
fallbacks. Each key has an explicit presence marker and exact string value;
absent, empty, `false` and `0` are not interchangeable. Irrelevant `PWD`, `SHLVL`,
`PATH`, `TERM` and shell `_` do not invalidate preparation. Environment order
does not matter. Never use `fixtureDigest(process.env)` to create this field.
The URL explicitly supplies database/host/user, so a shell `USER` is not its
connection identity. Full-row snapshot binding remains unchanged. SQL column
bindings follow the actual foundation/auth/availability schema and migrations
012 (private declarations) and 026 (region/moderation), not an invented fixture
table or a new production schema.

## Photo input: illustration is not product evidence

The supplied research identifies Wikimedia Commons
[Cordless electric (screw) drill.jpg](https://commons.wikimedia.org/wiki/File:Cordless_electric_(screw)_drill.jpg),
Fructibus, 2017-05-26, CC0/Public Domain Dedication, 2448×3264 JPEG,
3,139,354 bytes, Commons SHA-1 `12699bce9a2330d1e34459644c370ebdaf1c29b8`.
These are supplied provenance inputs, not a download/hash verification by this
package. A later authorized preparation must verify the external original and
calculate its SHA-256; neither image nor attribution evidence is downloaded or
stored here. The JPEG signature/hash check is not independent proof of
authenticity, copyright permission, current condition or ownership.

An explicitly synthetic/AI-generated illustration may also be used for this
noncontractual fixture, with the discriminated provenance fields above, exact
SHA, scan and owner binding. Neither image class is current ownership/condition
evidence. Real listings still require authentic current product photographs.
The historical photo may illustrate a visibly synthetic, nonbookable fixture
only. It is not a current photo of the owner's real offered object. The existing
guest listing category is `cat3/Sonstiges`; using a drill picture does not
authorize silently changing that listing's category or product facts. A real
pilot listing still needs a current authentic photo of the actual item and
truthful owner/publication/region/availability declarations.

## Authorized semantic cleanup contract

Cleanup means **semantic safety restoration**, never byte-for-byte database
restoration. It must compare-and-set only exact run-owned state:

1. Refuse if booking, payment, message, evidence or other dependent objects
   appeared. Do not delete these objects or bypass lifecycle/retention rules.
2. Make the fixture noncatalogued and nonbinding; restore the proven excluded
   guest prestate or remove only the exact temporary guest grants.
3. Invalidate temporary credentials and revoke all run-role sessions/refresh
   tokens using the existing auth lifecycle. Never reactivate old sessions or
   restore previous password hashes. Retained principal ownership stays intact.
4. Preserve append-only login/revocation/listing audits and new `updated_at`
   values. Prove these expected aftereffects separately from safety restoration.
5. Restore only owned listing/upload/availability state semantically; compare
   media bytes and exact object identity, never overwrite foreign/newer state.
6. Every forward phase and partial credential/artifact write requires injected
   failure/recovery evidence, owner-only exclusive artifacts, session readback,
   exact guest-catalog exclusion and no provider/payment/notification effects.
   Cleanup failure overrides success; no false PASS or automatic retry.

Existing `provision_synthetic_sandbox_user.mjs` cannot be called unchanged: it
targets one fixed user and changes declarations. Existing
`tool/provision_staging_test_accounts.mjs` uses public registration/email and is
also ineligible. Reuse their private-file and lifecycle primitives, not their
whole flows. `tool/clean_staging_store_feed.mjs` protects active bookings and
pauses synthetic listings, but is not complete credential/upload cleanup.

## Source-only DB adapter — separate from runtime activation

`backend/ops/staging_web_fixture_adapter.mjs` uses a NEW owner-only external
manifest (`kind=sit-staging-web-fixture-adapter`, schema 1). Its `preflight`
member is the canonical preflight manifest. Bind `operation=activate|cleanup`,
exact clean `sourceCommit`, all `adapterSources` file hashes, schema count 98,
ordered migration name/checksum `ledgerDigest`, and the exact `uploadDirectory`
from `UPLOAD_DIR` (default `/data/uploads`). Both private manifest/photo files
must be 0600 in a 0700 owner directory outside Git. Existing stored media must
be owned by the runtime UID, non-symlink/non-writable-by-others, identical to the
private photo, and bound by the scanned upload row. The adapter never installs
or replaces a photo, changes category, supplies missing owner eligibility, or
creates credentials. Those missing prerequisites fail closed.

Default invocation is read-only; do not execute this preparation command on live
systems without the separate source/runtime gate:

```sh
node backend/ops/staging_web_fixture_adapter.mjs /absolute/private/adapter.json <exact-file-sha256>
```

The only mutation form appends `--execute <exact-source-commit> <exact-run-id>`.
Both confirmations and the manifest are required. Environment execution switches
are forbidden. Source must be clean; test/staging, memory payment, Stripe=false,
registration=false/empty and synthetic catalog flag absent/false are mandatory.
Cleanup therefore requires the separately verified runtime flag-off transition
first. It does not pretend to switch Green or alter an env file itself.

One DB connection owns an advisory lock for the exact listing. Preparation
repeats the canonical READ ONLY preflight on it, then repeats snapshot/schema/
dependency checks under SERIALIZABLE and root row locks. Active sessions and
refresh tokens are rejected both initially and before writes/replay handoff.
Dependency discovery covers the schema's direct foreign keys to both principals,
the listing and upload; only exact known fixture/session/audit/availability roots
are exempt, with separate foreign-listing/upload checks. Normal FK enforcement
is never disabled. A two-second lock and five-second statement timeout are
failures, never retried or relaxed.

The single conditional listing update advances `catalog_revision` (preserving
the existing catalog-write trigger), sets visibly synthetic text and truthful
Heilbronn/Germany display fields, binds the sole photo and run marker, and writes
the before-image/hashes to append-only `audit_log` in the same transaction.
Private declaration, authoritative region code, category, monetary fields,
availability, upload and user profile remain unchanged. An independent committed
snapshot/audit readback precedes success. Output is sanitized and explicitly
`runtimeActivated:false`; its handoff always says `activationAllowed:false` and
requires a separately reviewed exact-source Green/flag activation.
The sanitized result includes `manifestDigest` and `activationDigest` explicitly,
without raw principals, file paths, input bodies or secrets. Preserve the latter
for the cleanup manifest; cleanup echoes the same original activation digest.

Cleanup requires a NEW fresh manifest: keep the exact same `runId`, two roles,
listing/upload/photo/availability scope, but freshly capture `createdAt`, runtime,
environment and current `snapshotDigest`. `activationDigest` is the SHA-256 of
`JSON.stringify` of the original activation manifest (separate from its exact
file-byte CLI hash). It must match the retained activation audit. Never rewrite
the activation input or merely substitute its old snapshot as current truth.
Cleanup additionally binds `activation.afterHash`/hidden hash, reconstructs the
original before-image hash, and rejects foreign edits, scope drift or stale input.

Cleanup first commits a paused/inactive listing plus session/refresh revocation
and a `hidden` audit checkpoint. Then it rechecks dependencies and restores only
the owned display/payload before-image while keeping the listing inactive and
paused. New booking/group/cart/message/payment/evidence dependencies stop this
second phase; the hidden checkpoint remains. No dependent record is deleted,
old session or credential restored, audit removed, or timestamp rolled backward.
This adapter issues no temporary credential and does not rotate existing ones;
a future credential issuer must supply its own invalidation contract. Replay
requires exact current state/audit and revoked sessions/tokens. Ambiguous COMMIT,
rollback/unlock/readback failure is never PASS and never automatically retried.

Tests use a stateful injected DB model with real row changes, both commits,
activation/cleanup/replay and every forward-query fault. They are not a real
PostgreSQL/trigger/concurrency or live-runtime acceptance. Before execution:
separate review, clean committed source, isolated PostgreSQL rehearsal, fresh
private media/provenance/runtime/schema inputs and protected Green witnesses.

## Verification / next gate

```sh
node --test backend/test/staging_web_fixture_preflight.test.js backend/test/staging_web_fixture_adapter.test.js backend/test/local_postgres_integration_runner.test.js
SIT_POSTGRES_FOCUSED_WEB_FIXTURE=1 node tool/run_local_postgres_integration.mjs
cd backend
pnpm test
```

Focused tests cover read-only positive preparation, environment/principal/
photo/availability drift, excluded prestate, dependencies, every query failure,
rollback failure and mutation rejection. The existing isolated PG16 runner now
includes the fixture rehearsal by default and via the focused command above:
all 98 real migrations/checksums, catalog and append-only triggers, FK dependency
inventory, two-client advisory contention, activation/cleanup replay, revocation,
durable hidden checkpoint and a real SQL failure/rollback. It stops and removes
its complete ephemeral cluster on success or failure; retained audit history is
never deleted individually. Only loopback traffic to that owned cluster occurs.

The programmatic-only `isolatedFixtureRehearsal` Symbol binds exactly
`127.0.0.1` / `sit_integration` / `sit_runner`, an explicit port, no URL password,
query or fragment, `DEPLOYMENT_ENVIRONMENT=test` and `NODE_ENV=test` or absent/empty.
Neither CLI accepts or passes this capability from argv, environment or JSON;
normal Ops database, source, schema, photo and safety gates are unchanged. The
test hashes current source bytes without claiming a dirty checkout is deployable.
Synthetic bytes in this rehearsal are not image/scan authenticity or login proof.
Next is exact-source/runtime review; media/credential provisioning remains
separate. No live cleanup, field or runtime flag change follows from this test.

This is a Web-only source successor, not an Android artifact approval. The old
Android handoff's immutable app-source pin remains unchanged. Consumer closure
requires its exact `Android compatibility file bytes changed: backend/src/app.js.`
rejection; an unexpected PASS or different error fails that negative gate.
A separately built and reviewed Android candidate is required for a successor
Android claim.
