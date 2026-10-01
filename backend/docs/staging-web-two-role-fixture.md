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
(maximum one hour old) 0600 manifest and 0600 typed image in a 0700 directory owned by
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
- photo file, SHA-256, exact typed MIME, `currentProductEvidence=false`, and exactly
  one provenance variant: `authentic_non_ai` requires HTTPS `sourceUrl`,
  `creator`, `license`, `capturedAt`; `synthetic_ai_illustration` instead requires
  `syntheticAi:true`, `generatedAt`, versioned `toolIdentity`, `promptHash`
  (not a raw prompt), `usageLicenseStatement`, and an optional actual HTTPS
  `sourceUrl`. Both remain JPEG-only. A third exact variant
  `synthetic_programmatic_placeholder` is WebP-only: `syntheticAi:false`,
  `byteSize`, integer `width`/`height` (1–2048), uppercase `rgbHex`, `opaque:true`,
  and `testOnlyStatement` exactly equal to the exported `placeholderStatement`.
  It explicitly states that the original generator/date/license are unknown and
  use is internal, synthetic and noncontractual. No invented origin/rights fields
  are accepted. Mixed/unknown fields and missing provenance fail closed;
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

### Dedicated bootstrap — protected host runner, live gate still open

`backend/ops/staging_web_fixture_bootstrap.mjs` is a programmatic domain core,
**not a standalone CLI or authorization to connect to Green**. The existing
`staging_web_fixture_runner.mjs` provides its protected host boundary. It creates only
the two fixed-purpose `synthetic_web_catalog_{owner,renter}_v1@example.invalid`
principals, `synthetic_web_catalog_listing_v1`, and the dedicated
`synthetic_web_catalog_placeholder_v1.webp` upload. Existing synthetic-marked
Gmail/other routable accounts, credentials and listings are never reused or
changed. No migration, public registration, provider or runtime flag is enabled.

The one-hour private manifest binds actual clean Ops source hashes/98-ledger,
current runtime/security-environment/database, run ID, independently verified
typed WebP bytes/provenance and two distinct strong private password inputs.
It reuses the existing stable `0600` password reader and runtime password hasher;
no credential rotation path exists. Default is read-only; writes require both
exact source and run confirmation. The domain emits only status and
`runtimeActivated:false`, never identities, passwords, password hashes or env.
Accounts carry explicit synthetic purpose/notice, null phone, verified technical
acknowledgements and clear review state, but no provider identity/session/push.
Acknowledgements are test-account state, not consent by a real person. The
listing has no real owner declaration or authoritative pilot-region field.

Seed writes are insert-only in a locked serializable transaction. Every existing
row/email/file collision fails unless the exact private ownership receipt,
append-only seed audit, immutable scope, snapshot and supplied credentials prove
an exact replay. Files are created exclusively, never overwritten; a private
receipt binds file inode/device/SHA to the run. Known rollback removes only a
newly owned exact file. Unknown COMMIT or post-commit readback retains the file
and receipt and reports failure: fresh readback/replay, not blind rollback.
Foreign bytes/inodes and unreceipted orphan files are never adopted or deleted.
A receipt-only interrupted removal is recoverable only for this exact scope;
no broad directory cleanup exists. A retired run cannot reseed itself.

Cleanup requires catalog flag off and the same exact scope. Ownership/contact/
profile drift rejects before writes rather than risking another principal's data.
For a proven dedicated scope it first commits
listing-hidden, passwords-invalid and sessions/refresh-revoked state with audit.
Only an exact never-used seed may then be deleted after root row locks and the
complete FK dependency inventory. Login/session/token/activity, booking, cart,
message, payment, evidence, listing edits or other dependencies cause failure
with the hidden checkpoint retained. Used data and all audits remain. Old
passwords/sessions are never restored. File removal after DB cleanup also
requires the exact receipt and bytes; interrupted cleanup is replayable.

`fixtureBootstrapHandoff` is a **private proposal only**: put the two dedicated
IDs first (needed by deterministic renter selection), preserve every old ID in
its previous relative order, and bind the public listing/upload to the dedicated
pair while keeping synthetic catalog activation false. It never writes env.
Only after separately reviewed runtime/gate changes may the existing fresh
draft + adapter preflight consume that exact fixture. DB seed success is not
catalog visibility, account login verification or runtime activation.

### Controlled Green env handoff — source successor, not executed here

`backend/ops/promote_staging_web_fixture_env.mjs` is the separate, fail-closed
successor for that private proposal. It does not seed data, generate or rotate
credentials, enable the synthetic catalog, change Google/Firebase accounts, or
touch Production, Play, payment or provider configuration. Its only permitted
forward delta is:

- prepend `synthetic_web_catalog_owner_v1,synthetic_web_catalog_renter_v1` to
  `SIT_STAGING_ALLOWED_USER_IDS`, deduplicating only those two fixed IDs while
  retaining every prior ID in its prior relative order;
- set `SIT_STAGING_PUBLIC_LISTING_IDS=synthetic_web_catalog_listing_v1`;
- set
  `SIT_STAGING_PUBLIC_UPLOAD_NAMES=synthetic_web_catalog_placeholder_v1.webp`;
- keep `SIT_STAGING_SYNTHETIC_CATALOG_ENABLED=false`.

Do not hand-author `fixtureBinding`. The protected prepare mode derives it from
fresh read-only Docker/env/database inventory plus the exact private bootstrap
manifest. That input is the runner-created
`/docker/shareittoo/evidence/NEW_RUN/input/adapter.json`: it must remain exactly
`0600`, UID `100`, GID `101`, and is read in place by the root host process—do
not copy or chown it. The builder binds the clean Ops HEAD, immutable current
API fingerprint, protected env digest, bootstrap file/source/run digests,
seeded audit scope and snapshot digests, old allowed-ID digest/count, exact
handoff digest and the new unused backup target. It never prints IDs, passwords,
password hashes, env values, database URLs or raw Docker inspection. The only
persistent prepare effect is one exclusive root-owned `0600` runtime manifest
in an existing root-owned `0700` directory; the root-owned `0600` old-env backup
target must still be absent.

From the exact clean reviewed checkout, use a new backup path and output path:

```sh
node backend/ops/promote_staging_web_fixture_env.mjs --prepare \
  "$PRIVATE_BOOTSTRAP_MANIFEST" "$EXACT_BOOTSTRAP_MANIFEST_SHA256" \
  /docker/shareittoo/backups/staging-web-fixture-env/NEW_RUN.green.env \
  /docker/shareittoo/evidence/NEW_RUN.fixture-env-runtime.json
```

Record the returned runtime-manifest SHA-256 privately. Default invocation is a
read-only preflight. It reopens the root-owned runtime manifest and the unchanged
runner-owned `0600` UID100:GID101 `adapter.json` through stable descriptors,
requires their exact SHA-256 values, rechecks all live inventory,
schema 98/ledger, seeded audit digests, current runtime health/version and a
real config import with the proposed four values. It creates no lock, backup,
evidence, container or env change:

```sh
STAGING_WEB_FIXTURE_ENV_RUNTIME_MANIFEST=/docker/shareittoo/evidence/NEW_RUN.fixture-env-runtime.json \
STAGING_WEB_FIXTURE_ENV_RUNTIME_MANIFEST_SHA256="$EXACT_RUNTIME_MANIFEST_SHA256" \
STAGING_WEB_FIXTURE_ENV_BOOTSTRAP_MANIFEST="$PRIVATE_BOOTSTRAP_MANIFEST" \
STAGING_WEB_FIXTURE_ENV_BOOTSTRAP_MANIFEST_SHA256="$EXACT_BOOTSTRAP_MANIFEST_SHA256" \
node backend/ops/promote_staging_web_fixture_env.mjs
```

Only after that exact preflight and a separate live authorization, repeat with
all five execution confirmations. The CLI source confirmation is the clean Ops
HEAD, while the run confirmation is the private bootstrap run ID; neither is
printed by the executor:

```sh
STAGING_WEB_FIXTURE_ENV_RUNTIME_MANIFEST=/docker/shareittoo/evidence/NEW_RUN.fixture-env-runtime.json \
STAGING_WEB_FIXTURE_ENV_RUNTIME_MANIFEST_SHA256="$EXACT_RUNTIME_MANIFEST_SHA256" \
STAGING_WEB_FIXTURE_ENV_BOOTSTRAP_MANIFEST="$PRIVATE_BOOTSTRAP_MANIFEST" \
STAGING_WEB_FIXTURE_ENV_BOOTSTRAP_MANIFEST_SHA256="$EXACT_BOOTSTRAP_MANIFEST_SHA256" \
STAGING_WEB_FIXTURE_ENV_EVIDENCE_FILE=/docker/shareittoo/evidence/NEW_RUN.fixture-env-result.json \
STAGING_WEB_FIXTURE_ENV_EXECUTE=1 \
STAGING_WEB_FIXTURE_ENV_CONFIRM_SOURCE="$EXACT_OPS_SHA" \
STAGING_WEB_FIXTURE_ENV_CONFIRM_RUN="$EXACT_BOOTSTRAP_RUN_ID" \
node backend/ops/promote_staging_web_fixture_env.mjs --execute \
  "$EXACT_OPS_SHA" "$EXACT_BOOTSTRAP_RUN_ID"
```

Execution shares the existing controlled env-writer lock, atomically and
exclusively publishes the exact old env bytes once to the new `0600` backup,
atomically replaces `green.env`, stops and seals only the captured immutable
Green API ID, and recreates the same
image, mounts, security/resource settings and two networks. Success requires
live/ready/version, exact four-value config readback, registration still closed,
catalog flag still false, schema/ledger and unchanged seed evidence. Sanitized
success evidence contains counts and digests only. The full captured API
fingerprint is rechecked immediately before mutation. Later stop/rename/create
identity checks compare the exact container IDs and images, a canonical exact
environment key/value set, normalized config/host/mount drift, and the exact
fresh-preflight NetworkIDs; mutable Docker aliases, IP fields, name and running
state are accepted only where that lifecycle phase necessarily changes them.

Every forward error uses an identity-checked rollback: restore the env only if
it is still either the executor's exact after-image or exact old bytes; remove
only an exact owned replacement; rename/start the immutable original; then
re-read runtime health/version. A late foreign evidence-file collision is
preserved and can trigger that verified rollback, but is never overwritten or
used as authority for a blind mutation. Unknown/foreign state returns
`rollback.restored=false`. The retained successful backup and stopped original
are rollback material only; reversing a successful handoff remains a separate
reviewed operation, not an automatic command in this package.

The host runner binds immutable image/APP_COMMIT, clean Ops source (separate
from runtime revision), all mounted source hashes and the 98-file ledger, actual
API/DB fingerprints, internal Green network, uploads and protected env bytes.
Preparation is read-only Docker inventory only. It generates two independent
cryptographic passwords and a fresh run ID, never accepts old account inputs.
The five exclusive files are `adapter.json`, `photo.webp`, `owner.password`,
`renter.password`, `credentials.json`: each `0600` UID100:GID101 inside a new
`0700` UID100:GID101 directory, beneath a root-owned `0700` evidence parent.
`credentials.json` is the retrievable private login evidence; never print, copy
to Git/chat, or include it in ordinary evidence. Partial preparation fails with
protected files retained; never overwrite or automatically retry that directory.

After separately authorized preparation, use the exact clean Ops checkout and
private Node >=22. All paths below are private absolute paths, with new unused
destinations beneath `/docker/shareittoo/evidence/`; the descriptor and WebP
must already be verified protected inputs, with their exact SHA-256 values.

```sh
node backend/ops/staging_web_fixture_runner.mjs --prepare-bootstrap "$PHOTO_DESCRIPTOR" "$DESCRIPTOR_SHA256" "$PHOTO_FILE" "$PHOTO_SHA256" "$NEW_INPUT_DIRECTORY"
node backend/ops/staging_web_fixture_runner.mjs --prepare-binding "$NEW_INPUT_DIRECTORY" "$NEW_BINDING_FILE"
node backend/ops/staging_web_fixture_runner.mjs "$NEW_BINDING_FILE" "$EXACT_BINDING_SHA256"
```

Read the new root-owned `0600` binding hash privately. Both manifest and binding
expire after one hour. Default container execution has DB transactions read-only
and uploads RO, UID100:101, root RO, all capabilities dropped, no-new-privileges,
no ports, only the internal network, and logging disabled. Actual stopped-container
inspection precedes start. Every source/input mount stays RO. After independent
preflight acceptance and explicit authorization, the only RW mount is uploads:

```sh
node backend/ops/staging_web_fixture_runner.mjs "$NEW_BINDING_FILE" "$EXACT_BINDING_SHA256" --execute "$EXACT_OPS_SHA" "$EXACT_BOOTSTRAP_RUN_ID"
```

To refresh a stale manifest or prepare cleanup, preserve the original private
input directory and create a new one with the same source/run/passwords/scope:

```sh
node backend/ops/staging_web_fixture_runner.mjs --refresh-bootstrap "$ORIGINAL_INPUT_DIRECTORY" cleanup "$FRESH_INPUT_DIRECTORY"
```

Use `seed` instead of `cleanup` for a reviewed seed replay. Then build a fresh
binding and repeat default preflight before separately confirmed execution.
No automatic retry follows child, create, cleanup or unknown-COMMIT failures.
Host cleanup removes only the owned runner container; it never compensates DB
or media state. Preserve private inputs/receipts and reconcile via exact replay.
Output is sanitized status only, never IDs, emails, passwords/hashes or raw env.

Remaining live gate: independently prove actual UID100:101 source/input imports,
mount inspection and `--log-driver none` with `start --attach` result delivery in
the exact image before authorized execution. Local runner tests are deterministic
rehearsals, not that live Docker proof. Domain proofs use isolated PG16 plus all
98 migrations and temporary files, including used-cleanup rehearsal via
`SIT_FIXTURE_BOOTSTRAP_REHEARSAL_CASE=used`. Never manually bypass the runner.

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
SHA, scan and owner binding. No fixture image class is current ownership/condition
evidence. Real listings still require authentic current product photographs.
The programmatic placeholder variant asserts only objectively verified content:
RIFF/WEBP magic and exact container length, SHA, DB MIME/size/hash, scan/owner,
plus an actual bounded single-frame decoder read proving every pixel has the
declared RGB value and full opacity. It rejects animation, transparency,
nonuniform pixels and corrupt content. There is no general WebP photo support.
The supplied live read-only evidence identifies 960×640 opaque `#2A588F`,
1172 bytes, SHA-256
`d5b762e354eff48a5a8b744ce144ab9edafdc1c8a85be96ec6bf40a135ad04bf`.
These observed values are manifest inputs, not claims about who created it or
when; this source-only package did not fetch or independently read live bytes.
Local tests generate different rehearsal bytes and do not replace that evidence.
The historical photo may illustrate a visibly synthetic, nonbookable fixture
only. It is not a current photo of the owner's real offered object. The existing
guest listing category is `cat3/Sonstiges`; using a drill picture does not
authorize silently changing that listing's category or product facts. A real
pilot listing still needs a current authentic photo of the actual item and
truthful owner/publication/region/availability declarations.

### Protected two-role login proof — historical schema-1 contract

The following section preserves the historical schema-1 workflow. The current
post-promotion flow is the
[schema-2 login-proof successor](../../docs/operations/STAGING_WEB_LOGIN_PROOF_SUCCESSOR_2026-10-01.md).
Its order is mandatory: review and gate the schema-2 runner commit, obtain a
fresh immutable live proof on the exact current runtime, then create a separate
catalog consumer-binding commit pinning that actual proof digest and Ops commit.
Only after that second commit passes its gates may fresh catalog preparation,
read-only preflight and activation proceed. Historical bootstrap/proof bytes
remain unchanged; schema 2 records cumulative retained history separately from
the new marker's two sessions. The historical commands below are not a shortcut
past the current source and evidence gates.

`backend/ops/staging_web_fixture_login_verifier.mjs` is the separate verifier
for the already seeded dedicated owner/renter credentials. This source package
does not run it against Green. Preparation and execution require root with Node
22 or newer from the exact clean reviewed checkout. The input directory is the
existing runner-owned `0700` UID100:GID101 directory containing exact `0600`
`adapter.json` and `credentials.json`; never copy, chown, print or pass the
credential contents on the command line. Use new root-owned `0700` output
directories and unused root-owned `0600` binding/evidence targets:

```sh
node backend/ops/staging_web_fixture_login_verifier.mjs --prepare \
  "$PRIVATE_BOOTSTRAP_INPUT_DIRECTORY" "$NEW_LOGIN_PROOF_BINDING" "$NEW_LOGIN_PROOF_EVIDENCE"
node backend/ops/staging_web_fixture_login_verifier.mjs \
  "$NEW_LOGIN_PROOF_BINDING" "$EXACT_LOGIN_PROOF_BINDING_SHA256"
```

Prepare binds the exact clean Ops source, immutable API/DB/network fingerprints,
protected env and private-input hashes, runtime image, schema-98 ledger, fixture
roles/run and a new one-hour proof marker. The second command is the default
read-only preflight: its database transactions are explicitly read only and it
makes no auth request. Before either mode can reach an auth route, the same
bound database must attest both exact IDs, emails, active user role/state,
synthetic-only profiles, zero failed attempts, no login lock or MFA, and verify
both private passwords against their stored canonical scrypt hashes. Any drift
fails before HTTP and cannot increment failed attempts. Both modes use one
inspected UID100:101, root-read-only,
capability-free, no-log, no-port container on only the internal Green network.

Only after the default result and a separate live authorization may the exact
same binding be executed once, with both source and private run confirmations:

```sh
node backend/ops/staging_web_fixture_login_verifier.mjs \
  "$NEW_LOGIN_PROOF_BINDING" "$EXACT_LOGIN_PROOF_BINDING_SHA256" \
  --execute "$EXACT_OPS_SHA" "$EXACT_BOOTSTRAP_RUN_ID"
```

Execution calls only `/v1/auth/login`, `/v1/auth/me` and `/v1/auth/logout`,
sequentially owner then renter. A run-specific neutral user-agent marks only
the sessions created by this proof. Whether an API response succeeds, fails or
is lost, reconciliation can revoke only rows for the exact two IDs, exact
marker and exact captured session IDs; foreign/duplicate marker state is an
error and is never broadly deleted. Auth requests are never retried. Reconcile
also row-locks the exact two principals, so an already-running login transaction
must settle or the bounded lock/statement timeout fails closed. After any
success, failure or uncertain response, bounded five-second reconciliation and
readback rounds must prove two consecutive stable zero-active windows. A session
that commits after the first reconciliation is revoked in a later round; if
quiescence cannot be proven, the result is FAIL and requires manual readback,
never PASS. Success requires both access tokens to be
rejected after logout, zero active sessions and refresh tokens, unchanged
identity/effect digests, retained login/session audit counts, registration and
catalog still closed, memory payment, Stripe false and every external provider
boundary still off. Evidence is exclusive root-owned `0600` and contains only
status, counts, booleans and digests—never email, password or token material.
There is no auth-request retry; preserve a failure and prepare a new binding only
after exact readback and review.

### Separate synthetic catalog activation — historical schema-1 consumer

The digest/Ops pins and commands below describe the unchanged historical
consumer. It rejects schema-2 login evidence and cannot activate the promoted
runtime using the old proof. Follow the linked schema-2 successor's two-commit
ordering before preparing a new activation manifest; never replace these pins
with a placeholder or reinterpret the old proof as current-runtime evidence.

`backend/ops/activate_staging_web_fixture_catalog.mjs` is the final, separate
one-key Green transition. This source package does not run it. It reuses the
same atomic env replacement, immutable container seal, exact-ID rollback and
shared transition lock as the proven fixture env handoff. Its only permitted
forward difference is
`SIT_STAGING_SYNTHETIC_CATALOG_ENABLED=false -> true`; every other env key/value
must remain semantically exact even if Docker reorders `Config.Env`. Runtime
identity remains image-owned: `APP_COMMIT`, `APP_VERSION` and `APP_BUILD_TIME`
are forbidden in `green.env` and fail before any Docker command.

Prepare requires the unchanged runner-owned bootstrap `adapter.json`, the exact
DB preparation readback SHA-256
`109e29f5e0f13db97b0423cc6e00dbc1501f8a8daed85209d76f1565071acc32`, and
the exact login-proof SHA-256
`f1b8310c88d0bc1937d4ef5d6f0efb41af09f261b6c75deae2a77938765e5419`.
The bootstrap manifest and login proof remain historically bound to their
original protected runs; neither is rewritten for catalog activation. The
login proof remains bound to Ops commit
`ef5eae4472f6349f6da0cec6249dc8ca88f96fa3`; it must not be rewritten to the
new activation commit. Both protected inputs use the canonical-row ledger digest
`4fff35fbe15c64a38f0ca423222b32298b5595da8dab81e306a7ad5a48e80f08`;
that historical algorithm is deliberately distinct from the current DB
text-ledger digest `796f0e19572f4883435d5825baae9004b1f5ec2e706a4114d7731cf2a21cf196`.
All three inputs are reopened with their exact protected
ownership/mode and digest. The backup, result evidence and runtime manifest are
new, pairwise-distinct root-owned `0600` targets in root-owned `0700` parents;
none may alias an input or `green.env`.

```sh
node backend/ops/activate_staging_web_fixture_catalog.mjs --prepare \
  "$PRIVATE_BOOTSTRAP_ADAPTER" "$EXACT_BOOTSTRAP_SHA256" \
  "$DB_PREPARATION_EVIDENCE" 109e29f5e0f13db97b0423cc6e00dbc1501f8a8daed85209d76f1565071acc32 \
  "$LOGIN_PROOF_EVIDENCE" f1b8310c88d0bc1937d4ef5d6f0efb41af09f261b6c75deae2a77938765e5419 \
  /docker/shareittoo/backups/staging-web-fixture-catalog/NEW_RUN.green.env \
  /docker/shareittoo/evidence/NEW_RUN.catalog-activation-result.json \
  /docker/shareittoo/evidence/NEW_RUN.catalog-activation-runtime.json
```

Prepare and the default invocation are read-only. They bind and recheck clean
source; current API/image/mount/network IDs; exact protected env; schema 98 and
ledger; dedicated owner/renter/listing/upload plus seed and activation audits;
the retained revoked login-proof records; zero MFA factors and zero active sessions/refresh tokens;
zero booking/request/identity/push/payment/provider/notification effects; closed
registration; memory payment; Stripe false; provider boundaries off; catalog
flag false; and public catalog count zero. Candidate config is imported with
only the proposed flag true before any mutation.

The bootstrap run remains the private double-confirmation value and must match
the exact seed audit. The separately generated database-preparation activation
run is discovered read-only from the listing payload and the single exact
`staging_web_fixture.activated` audit. Those two values must be valid and equal;
only their SHA-256 digest is retained in the runtime manifest and result
evidence. It is never equated with or printed alongside the private bootstrap
run. These checks remain a Phase-0 prerequisite and are not final Mission
completion evidence.

```sh
STAGING_WEB_FIXTURE_CATALOG_RUNTIME_MANIFEST=/docker/shareittoo/evidence/NEW_RUN.catalog-activation-runtime.json \
STAGING_WEB_FIXTURE_CATALOG_RUNTIME_MANIFEST_SHA256="$EXACT_RUNTIME_MANIFEST_SHA256" \
STAGING_WEB_FIXTURE_CATALOG_BOOTSTRAP_MANIFEST="$PRIVATE_BOOTSTRAP_ADAPTER" \
STAGING_WEB_FIXTURE_CATALOG_BOOTSTRAP_MANIFEST_SHA256="$EXACT_BOOTSTRAP_SHA256" \
STAGING_WEB_FIXTURE_CATALOG_DATABASE_EVIDENCE="$DB_PREPARATION_EVIDENCE" \
STAGING_WEB_FIXTURE_CATALOG_LOGIN_EVIDENCE="$LOGIN_PROOF_EVIDENCE" \
node backend/ops/activate_staging_web_fixture_catalog.mjs
```

Only after separate live authorization may the exact same binding execute once.
Both argv and environment must confirm the clean activation Ops SHA and the
private bootstrap run ID; the run value is never printed:

```sh
STAGING_WEB_FIXTURE_CATALOG_RUNTIME_MANIFEST=/docker/shareittoo/evidence/NEW_RUN.catalog-activation-runtime.json \
STAGING_WEB_FIXTURE_CATALOG_RUNTIME_MANIFEST_SHA256="$EXACT_RUNTIME_MANIFEST_SHA256" \
STAGING_WEB_FIXTURE_CATALOG_BOOTSTRAP_MANIFEST="$PRIVATE_BOOTSTRAP_ADAPTER" \
STAGING_WEB_FIXTURE_CATALOG_BOOTSTRAP_MANIFEST_SHA256="$EXACT_BOOTSTRAP_SHA256" \
STAGING_WEB_FIXTURE_CATALOG_DATABASE_EVIDENCE="$DB_PREPARATION_EVIDENCE" \
STAGING_WEB_FIXTURE_CATALOG_LOGIN_EVIDENCE="$LOGIN_PROOF_EVIDENCE" \
STAGING_WEB_FIXTURE_CATALOG_EXECUTE=1 \
STAGING_WEB_FIXTURE_CATALOG_CONFIRM_SOURCE="$EXACT_ACTIVATION_OPS_SHA" \
STAGING_WEB_FIXTURE_CATALOG_CONFIRM_RUN="$EXACT_PRIVATE_BOOTSTRAP_RUN_ID" \
node backend/ops/activate_staging_web_fixture_catalog.mjs --execute \
  "$EXACT_ACTIVATION_OPS_SHA" "$EXACT_PRIVATE_BOOTSTRAP_RUN_ID"
```

Success additionally requires live/ready/version, flag true, and public catalog
count exactly one: the exact synthetic fixture, visibly labelled as a test,
`synthetic_noncontractual_catalog_only`, `realOffer:false`,
`ownerDeclaration:false`, `bookingAllowed:false` and `paymentAllowed:false`.
It must also expose exactly one server-generated canonical public photo URL for
the exact configured synthetic upload; persisted or client-supplied photo URLs
cannot substitute for that database-bound upload evidence.
The bound DB/effect/session/provider digests must remain unchanged. No login,
booking, request, payment, identity, notification or provider action is issued.
Every replacement, DB or public-readback failure—including a late foreign
evidence collision—performs the shared identity-checked exact rollback and can
never report PASS on uncertain state. The sanitized root-owned `0600` result
contains counts, booleans and digests only.

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

### Green container runner (Ops successor; not runtime activation)

`backend/ops/staging_web_fixture_runner.mjs` closes the host-Git/runtime-network
gap. Run it on the Docker host from a clean, reviewed **Ops** checkout with
Node >=22 and the locked dependencies. The Ops SHA is separate from the API
runtime SHA. The original adapter CLI still requires real Git; neither an env
value nor a manifest can replace that check. The host verifies clean Git and
actual source hashes, then the immutable Docker image/digest, image revision and
APP_COMMIT, current exact Green API/DB IDs and fingerprints, internal Green
network ID, uploads volume, and exact protected `green.env` bytes/current values.

The short-lived runner uses only that network, no provider network or host port,
UID/GID `100:101`, read-only root/mounts, dropped capabilities and no new
privileges. No Firebase/MFA/provider credential file is mounted. It rehashes the
actual mounted adapter/runner sources, the **complete** runtime `src` tree
(including transitive imports) against the source tree, and all 98 image
migration checksums before opening a DB connection. Node resolves `pg` from the
immutable image; Git never needs to exist there. A changed app-source tree needs
a separately built compatible runtime image, not a claimed compatibility flag.

Before starting, every bound source file must be readable by the runtime UID:
nonsecret file modes `0644`, traversable source directories `0755`, no symlinks
or group/other writes. The checkout's outer private directory may stay `0700`:
Docker bind-mounts only the exact source files and source subtree. The runner
fails before create on root-only `0600` source files. This is distinct from the
private inputs, which must remain `0600`, never `0644`.

Fresh activation draft after separate authorization (read-only DB operation):

Provide only the already verified private typed image and its exact provenance JSON
(the discriminated `photo` schema above), root-owned `0600` in a private `0700`
directory. No download, new rights assertion or real-product evidence is implied.
Create a new root-owned `0700` run parent under `/docker/shareittoo/evidence/`.
From the exact clean Ops checkout and verified private Node binary:

```sh
node backend/ops/staging_web_fixture_runner.mjs --draft \
  /absolute/private/photo-provenance.json EXACT_DESCRIPTOR_SHA256 \
  /absolute/private/photo.jpg EXACT_PHOTO_SHA256 \
  /docker/shareittoo/evidence/NEW_RUN/draft.json
```

This derives an ephemeral one-hour runtime binding from fresh Docker/env reads,
then uses the same isolated immutable-image runner to read the actual DB. It
requires exactly one guest-bound listing/upload. Its actual owner must be an
eligible `syntheticOnly`, `@example.invalid`, phone-null allowed account. The
renter is the first eligible non-owner in the administrator-configured, verified
allowlist sequence, never SQL row order. At least one must exist. Additional
eligible accounts are not selected, snapshotted or dependency-scanned; the full
unchanged adapter/FK preflight applies only to the chosen pair. If that pair
fails, no alternate renter is tried. No caller-supplied IDs/snapshots are accepted.
Actual 98-migration ledger, complete snapshot/availability and protected security
environment are bound. The stored upload bytes must match the separate photo.
Every draft transaction rolls back; the unchanged adapter default preflight
rechecks all dependencies/session/refresh-token boundaries before acceptance.

The only persistent output is a new exclusive root-owned `0600` draft. Standard
output contains only `draft-created-read-only` and its SHA-256, never the draft,
identities or environment. Docker logging is disabled (`--log-driver none`);
private child output travels through captured `start --attach` only. An actual
Docker attach/UID/mount probe remains a separate required operational gate.
Any failure/cleanup drift returns no success; do not print child output for debug.
There are no DB writes, credentials, downloads, provider/payment calls or flags.
The draft is not approval for activation, and never means runtime activation.

Reproducible input preparation after separate authorization (no DB operation):

1. Use the fresh activation draft above and matching private typed image, both
   root-owned `0600`; review its exact source/runtime/provenance binding privately.
   Reuse this run's protected parent, never another historical run's inputs.
   Subsequent preparation does not refresh or invent snapshot/environment facts.
2. From the clean checkout, using the verified private Node binary, run:

   ```sh
   node backend/ops/staging_web_fixture_runner.mjs --prepare-inputs \
     /absolute/private/draft.json EXACT_DRAFT_SHA256 \
     /absolute/private/photo.jpg EXACT_PHOTO_SHA256 \
     /docker/shareittoo/evidence/NEW_RUN/inputs
   ```

   This exclusively creates `inputs` (`0700`, owner `100:101`), `adapter.json`
   and format-bound `photo.jpg` (JPEG) or `photo.webp` (typed placeholder),
   both `0600`, `100:101`; no credential or SQL operation occurs.
   The source fields come from actual clean Git/file/ledger reads. Creation
   fails if the directory exists. Output contains hashes only. Partial file
   preparation is a failure, not a reusable input; inspect it before any
   separately authorized cleanup. The runner mounts this directory read-only
   at `/run/sit-fixture-input`, so the manifest's canonical photo path stays
   identical across activation and cleanup despite fresh host directories.
   For a placeholder, use `photo.webp` in the two image argument examples above;
   canonical private paths, binding and exact two-file inventory enforce that
   extension. Cross-extension cleanup or extra image files fail closed.
3. Bind the fresh live Docker readbacks and the prepared inputs:

   ```sh
   node backend/ops/staging_web_fixture_runner.mjs --prepare-binding \
     /docker/shareittoo/evidence/NEW_RUN/inputs \
     /docker/shareittoo/evidence/NEW_RUN/binding.json
   ```

   This creates only a new root-owned `0600` binding and returns its SHA-256.
   The exact binding schema is `validateFixtureRunnerBinding`; it expires after
   one hour. No image pull, container creation, DB or provider call occurs in
   this preparation mode. Do not hand-edit fingerprints, source fields or time.
4. Separately authorized default runner preflight (creates/removes its own
   transient container, but the adapter performs no DB writes):

   ```sh
   node backend/ops/staging_web_fixture_runner.mjs \
     /docker/shareittoo/evidence/NEW_RUN/binding.json EXACT_BINDING_SHA256
   ```

   A DB-write operation is separate and adds
   `--execute EXACT_OPS_SOURCE_COMMIT EXACT_FIXTURE_RUN_ID`. Both confirmations
   and all source/runtime/media/schema checks remain mandatory. No runtime flag,
   Green container, env file, upload or provider is changed. The runner inspects
   the stopped transient container's command, security settings, mounts and
   environment before start. Cleanup removes only its captured ID with matching
   nonce/name and verifies absence, including a lost create-response case.
   Cleanup failure overrides success; there is no automatic retry.

   A read-only replay reports the already committed truth instead of failing:
   activation may return `already-prepared-runtime-still-blocked`, while cleanup
   may return `already-cleaned`. The runner accepts those only for their matching
   operation; write-mode and cross-operation status combinations remain rejected.

For cleanup, retain the original activation digest and unchanged semantic scope
(including canonical photo path), but supply a fresh cleanup snapshot/draft and
new host input/binding directories. The builder refuses to remap a historical
cleanup photo path. Existing pre-runner activation scopes require their original
execution path or an explicitly reviewed migration; they are not silently rebound.
Runtime flag-off and session/semantic cleanup rules above remain unchanged.

Local evidence for this successor is deterministic orchestration and actual-file
hash/permission testing, plus the existing adapter/PG contracts. A real Docker
UID/import/mount probe is a separate gate where Docker is available; a mocked
Docker response is not that proof. No such live probe is authorized by this
source package.

```sh
node --test backend/test/staging_web_fixture_preflight.test.js backend/test/staging_web_fixture_adapter.test.js backend/test/staging_web_fixture_runner.test.js backend/test/local_postgres_integration_runner.test.js
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
