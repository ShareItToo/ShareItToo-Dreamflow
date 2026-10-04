# Post-promotion Web fixture login proof

The first source package prepared a fresh proof after Green promotion. Its
separately executed live proof and the second consumer-binding source package
are recorded below. The current consumer package performs no live login,
catalog activation, API restart or database mutation. The immutable
bootstrap remains fixture/credential/schema provenance. A fresh binding and the
verified current image bind the runtime being tested; the child must receive
that exact runtime commit and `/version` must agree.

Schema-2 binding/evidence separates per-marker records (zero before, exactly two
after execution) from cumulative retained sessions, refresh records and login
audits. `authHistory` records exact before/after counts plus equal SHA-256 digests
of prior sessions, refresh records and login audits. Prior rows are preserved;
each family must grow by exactly two. Default preflight has zero growth and no
authentication or reconciliation writes. Existing identity/catalog/forbidden-
effect checks, token rejection and bounded cleanup remain required.

## Two source packages

1. Review, commit and gate the repeat-safe login runner and focused tests. Deploy
   that exact clean source read-only into a fresh protected directory. Verify
   current Staging runtime/image, runtime UID/GID and tool/import availability.
   The known starting runtime is `34194c42e5e477144b5db5a8eeb6c2d476c7aeef`,
   image `sha256:0403a5f60b94a8aa91d7cbf29ae503aea989d85aeb72fcf4cf6dc14a801670b9`;
   take fresh readbacks rather than assuming this remains current. Host Node20
   cannot run the controller: use the exact verified Node22 image, root
   controller and identical absolute source paths for host Docker bind mounts.
   Prepare a new one-hour binding and run its default preflight. Then separately
   execute the authorized two-role proof and verify protected evidence plus
   cleanup. Preserve historical bootstrap/credentials/evidence bytes unchanged.
2. Only after successful live proof, read its exact bytes using the protected
   descriptor contract. In a separate reviewed commit, pin its SHA-256 and Ops
   commit in the catalog consumer, validate schema 2 and exact current
   runtime/image, and bind cumulative DB counts to `authHistory.after` (now
   6/6/6 after two prior successful proofs, but only actual evidence is authority).
   Require the same history, identity and catalog digests. Refresh relevant
   tests/bindings and gates before any new activation preparation.

The catalog consumer's historical digest/Ops constants stayed unchanged in
package 1. Package 2 now binds only the actual immutable proof below; it still
requires source review and exact-HEAD gates before new activation preparation.
No placeholder hash, compatibility exception or historical proof reuse bridges
the two packages. Historical files are unchanged.

## Previous immutable proof and superseded consumer binding

The proof executed once from Ops `dfea6fa9680da437500f35ae84aa0236979fba8d`.
Independent read-only closure verified the root:root 0600 artifact
`/docker/shareittoo/evidence/web-login-proof-dfea6fa9-20261001T015321Z/evidence.json`,
SHA-256 `e6dd9fc8e96fcd59fa0145e601ae04d4cc31e14c1c9146055ed69872cab2ae95`,
created `2026-10-01T02:15:40.378Z`, schema 2. It binds the exact runtime and image
listed above. The bootstrap remains SHA-256
`e0e46ddc056c72df7a1199881f4713f275d5cf11dd5f9e2c8f056c50b81a8737`;
its historical provenance is not rewritten.

Both roles passed login/me/logout and post-logout token rejection. Three
quiescence readbacks established zero active sessions/refresh tokens. Cumulative
sessions/refresh/login-audits are exactly 4/4/4, with exactly 2/2/2 for this proof
marker and both distinct principals. The marker SHA-256 is
`29f70925b0933705d338cb1ce7a56b147990032af34dc5ba845c2d55a26803a0`.
Prior-history before/after SHA-256 is unchanged:
`a2c37da0c6f79460b221e179a430d0e415b0bba8b210567e4235638f07fe056f`.
Identity/catalog readbacks match their proof digests; all forbidden-effect
counts are zero. Catalog and registration remain false, external providers off,
public catalog empty, exact health/version healthy, and transient resources
absent. Login-proof completion is not browser or catalog-activation acceptance.

The previous consumer validated the complete exact schema-2 field set, nested history
field sets and these immutable digest/Ops/runtime/image bindings. Its fresh
runtime manifest carries the proof's cumulative totals, history digest and
marker digest. Live SQL must attest totals 4/4/4, marker counts 2/2/2, both marker
principals, zero active sessions/refresh tokens, and the same prior-history,
identity and catalog digests. Marker selection uses the SHA-256 of the stored
user-agent; no raw run identifier or credential is exposed. History hashing is
identical to the producer and excludes only this proof's marker rows/audits.
Aggregate counts alone are insufficient: every marked refresh record must join
its marked session by `session_id` and the same `user_id`; every marked login
audit must join its session resource ID and the same actor/session principal.
Both exact principals must appear in each relationship, while global marker
counts remain exactly two so additional or foreign rows cannot be hidden.
Real PG16 negative cases preserve cumulative 4/4/4 and marker 2/2/2 counts while
reassigning the renter refresh or audit actor to the owner; both are rejected.
The audit case uses savepoint replay because audit rows remain append-only;
no trigger is disabled and no retained audit is updated or deleted.
Schema 1, missing/extra fields, incorrect totals, historical-row changes and
binding drift fail before transition. The consumer also compares manifest
identity/catalog bindings directly with the immutable proof before commands.

## Current D3 proof and consumer binding

After the exact D3 promotion, a fresh proof executed once from Ops
`84408c04c0387a4412b8542ca1381d1be110ed1b`. Independent read-only closure
verified the root-owned `0600`, single-link artifact
`/docker/shareittoo/evidence/web-login-proof-84408c04-20261001T061535Z/evidence.json`,
SHA-256 `0d320a50b458e5cf296ee5a1662cba7401db4a6c337e8591cc78ae914bb7eee5`,
created `2026-10-01T06:20:59.472Z`. It binds runtime
`d3c2f5d7d7516d3bfaac4b61689c2c433924cc6e` and image digest
`sha256:31b8b015eb0635b9fbb7d6c5e54ef43fe089d5b953dba8fa446aae2122a5888a`.

Both roles again passed login, `/me`, logout and post-logout token rejection.
The cumulative session, refresh and login-audit histories advanced exactly from
`4/4/4` to `6/6/6`; this proof still owns exactly `2/2/2`, both principals and
the exact refresh-to-session and audit-to-session principal relationships.
Active sessions and refresh tokens are zero. The marker SHA-256 is
`bb5fe651bd42e33488a5834efedd4935f4db3556367807bab231ce001df025f7`;
the before/after prior-history digest is identically
`79f84f73ab9a2353b9fa0250031b8c1cb9b8acef3fe47b6f30db588d95044816`.
Identity, catalog and proof-ledger digests are respectively
`6d11fe55adf0e90bce7bb0db45c99951c20f5c8aa01c5918fccbf6896964331e`,
`806c52aff0f5d10400adbf7ba09296376d666b92a79c8385a6f9cb1bbad66797`
and `4fff35fbe15c64a38f0ca423222b32298b5595da8dab81e306a7ad5a48e80f08`.
All forbidden-effect counts remain zero; catalog and registration remain off,
the public catalog is empty, and payment/provider boundaries are unchanged.

The current consumer pins these exact bytes, Ops/runtime/image and digests. Its
live SQL requires cumulative `6/6/6`, current marker `2/2/2`, both principals,
both immutable relationships and zero active auth state. The previous proof and
its consumer values remain immutable history; they are not accepted as the
current-runtime prerequisite.

Next: review/gate/commit this consumer package, then prepare a completely new
protected catalog manifest and perform its default preflight. Any separately reviewed
one-key transition follows only that successful fresh preflight. Old activation
manifests and namespace attempts remain historical and cannot be reused.

## CLI contract after exact-source gate

All paths below denote fresh owner-only external files. The input directory and
its immutable `adapter.json` / `credentials.json` must retain the runtime-reader
ownership/modes required by `readProtectedFixtureLoginInput` (currently 100:101,
directory 0700, files 0600), verified against the image before use. Binding and
evidence are root:root 0600 beneath a root:root 0700 evidence directory.
Protected host evidence parents stay root-owned `0700`; they are not made
host-traversable by the worker UID. Before any non-root worker starts, the root
Docker daemon verifies exact source metadata, hashes and non-symlink identity,
then the exact runtime namespace proves UID100:GID101 target-parent traversal,
target reads, Node syntax and import. Root-only readability is insufficient.

```text
node <exact-source>/backend/ops/staging_web_fixture_login_verifier.mjs --prepare <protected-input-directory> <new-binding.json> <new-evidence.json>
node <exact-source>/backend/ops/staging_web_fixture_login_verifier.mjs <new-binding.json> <binding-sha256>
node <exact-source>/backend/ops/staging_web_fixture_login_verifier.mjs <new-binding.json> <binding-sha256> --execute <exact-login-ops-commit> <immutable-bootstrap-run-id>
```

Do not change the current runtime while its binding is in use. An expired
binding, differing current image, nonzero active sessions, historical-row drift,
credential mismatch or unexpected side effect fails closed without automatic
retry. A new proof does not establish browser acceptance or Phase 0 completion.
