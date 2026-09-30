# Staging Web two-role fixture: preparation only

Source boundary: `a16822038a4da747adb94713ec6f3b1e887adc89`.
This package adds a **read-only preflight**, not a provisioner, live correction,
catalog activation, authenticated browser acceptance or cleanup executor.
No application, category filter, access gate or provider flag is changed.

## Why execution is blocked

The existing `/v1/listings` route in `src/app.js` requires a private listing
declaration and an allowed region before returning an active listing. Its
normal booking path does not provide a server-enforced, noncontractual
synthetic-catalog class. Setting the missing declaration/region on the observed
guest fixture would therefore fabricate normal publication evidence, not merely
enable a harmless test illustration. A label alone is not a booking safeguard.

The local `synthetic_clone_booking_lane.js` is a separate loopback-only run
contract. It must not be enabled on public Staging as a shortcut.

The new preflight always returns `executable: false` and the explicit blocker
`synthetic_catalog_domain_boundary_missing`, even when every input passes.
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
- exactly the already guest-bound listing and upload, region `heilbronn`;
- `fixtureClass=synthetic_noncontractual_catalog_only`, `realOffer=false`,
  `ownerDeclaration=false`, `bookingAllowed=false`, `paymentAllowed=false`;
- notice exactly: “Synthetische Katalogfixture – kein reales Angebot, kein
  Vertrag, keine Zahlung”;
- photo file, SHA-256, JPEG MIME, HTTPS source URL, creator, license, capture
  date, `classification=authentic_non_ai`, `currentProductEvidence=false`;
- exact availability rules/blocks digest. This binds observed availability; it
  does not attest that a real item is available or change any calendar.

`fixtureDigest` canonicalizes object keys and PostgreSQL Date values. Snapshot
arrays retain query order. `readFixtureSnapshot` gathers the two complete user
rows, exact listing/upload, availability, bookings/requests, sessions,
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

The historical photo may illustrate a visibly synthetic, nonbookable fixture
only. It is not a current photo of the owner's real offered object. The existing
guest listing category is `cat3/Sonstiges`; using a drill picture does not
authorize silently changing that listing's category or product facts. A real
pilot listing still needs a current authentic photo of the actual item and
truthful owner/publication/region/availability declarations.

## Authorized cleanup contract for a future, separately reviewed adapter

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

## Verification / next gate

```sh
node --test backend/test/staging_web_fixture_preflight.test.js
cd backend
pnpm test
```

Focused tests cover read-only positive preparation, environment/principal/
photo/availability drift, excluded prestate, dependencies, every query failure,
rollback failure and mutation rejection. No real PG, login, image replacement
or live cleanup pass is claimed. Next package must introduce and test a real
server-enforced synthetic noncontractual catalog boundary plus UI notice and
booking denial before any mutating adapter is built or enabled.
