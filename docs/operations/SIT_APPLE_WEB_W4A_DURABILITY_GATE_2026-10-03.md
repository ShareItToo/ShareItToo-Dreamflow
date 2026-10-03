# Apple Web W4-A: exchange durability gate

Date: 2026-10-03. Decision: **FIX — gaps reproduced; durable implementation not accepted.**

Scope: synthetic, source-bound backend fault reproduction and the smallest safe
successor design. No provider request, configuration change, migration, deployment,
Flutter integration or activation. This does not approve Google/Facebook, new
registration, or widen the existing private-pilot allowlist. W3's direct-flow and
live configuration gates remain open.

## Decisive reproduction

`backend/test/apple_exchange_durability_gap.test.js` extracts and executes the
exact `/v1/auth/social` route body from `backend/src/app.js` in a VM. All
verification, database, session and provider collaborators are synthetic. The
existing encryption primitive is real; its key is generated per fixture and its
input is clearly synthetic. No actual account, code, token or private key is
read or written. The provider model enforces single-use codes and records an
issuance before an injected response loss. Tests inspect counts and ciphertext,
never print material.

Nine passing tests reproduce the **current defects**, not repaired behavior:

| Fault / delivery | Observed synthetic result |
| --- | --- |
| Existing identity has another Firebase UID | Exchange consumes code, transaction rejects identity; no new durable material or revoke |
| Transaction rolls back after material/session work | Exchange consumes code; old ciphertext restored; no durable new material |
| Failure at post-exchange pre-transaction hook | Exchange consumes code; no durable claim/material |
| Provider performs exchange but response is lost | Code consumed; server has no refresh material; retry calls exchange again |
| Response is lost after application commit | Material/session committed, but duplicate cannot recover a stable outcome; it re-exchanges consumed code |
| Concurrent same-code delivery | Both call exchange; one succeeds and one fails as consumed |
| Two successful distinct codes | Second ciphertext overwrites first; no prior-grant cleanup ownership |

The remaining tests bind the exchange-before-transaction source order and the
existing single-slot cleanup contract. Failure cases assert their exact error,
not merely that an arbitrary exception occurred. This is **not** a killed-process,
real PostgreSQL isolation, live HTTP, Apple grant-lifetime or provider-revocation
test. In particular, it does not claim that every distinct Apple response always
represents a distinct grant; it proves the local code cannot preserve both if it
does. Real provider semantics remain NOT VERIFIED.

## Why no partial state-machine migration is supplied

The current ownership unit is one `auth_identities` ciphertext. Account deletion
copies it into `firebase_identity_deletion_outbox`, with conflict resolution on
`firebase_user_id` and another single material slot. Consequently, adding only an
attempt table or moving the exchange into the account transaction does not close
ownership: failure, later sign-in, account deletion and cleanup must preserve
every unresolved acquired material item independently.

Migration `094_apple_refresh_material_only` explicitly excludes durable
authorization-code material. It must not be rewritten or bypassed by storing codes
in a new retry table. An external effect cannot be rolled back with SQL; placing
it inside a transaction still leaves an ambiguous issued-but-unrecorded window.

A complete new persisted ownership contract also needs the account-deletion,
export/redaction, retention inventory and source-bound manifest consumers, plus
real PostgreSQL crash/concurrency checks. Those shared manifests are outside this
worker's authority. A standalone unused state machine would not prove route
safety. No migration or production source is changed in this package.

## Smallest safe successor: coordinated, versioned ownership package

This is a proposed contract, **not implemented or approved**:

1. Issue an unpredictable server-owned attempt handle only after fresh Firebase
   verification and all reversible existing-account/allowlist checks. No Apple
   new-registration or automatic email-linking boundary is added. Bind its
   versioned canonical digest to the exact Firebase project/principal, verified
   `apple.com` provider subject, configured Services ID, exact configured HTTPS
   redirect and server generation/expiry. Derive all identity bindings from
   verification/configuration, never a client-selected owner. Public receipts
   expose only opaque handles, bounded state/error and expiry.
2. Add an append-only numbered migration for one row per attempt/material owner.
   Enforce immutable binding and a unique keyed code fingerprint to stop a code
   moving between attempt handles or principals. Store no raw code, Apple ID
   token, Firebase ID token, refresh token, profile or providerData. The raw code
   exists only for the one in-flight exchange. Store acquired material only in a
   versioned authenticated-encryption envelope bound to its immutable owner
   tuple. Evidence/logs contain neither raw identifiers nor token fingerprints.
   Keys/key IDs, pseudonymous binding retention and privacy classification need
   explicit successor review; the existing encryption envelope must not silently
   change format.
3. Commit `claimed -> exchanging` using compare-and-set before invoking Apple.
   Only that winner may invoke the synthetic/real adapter once. Never reset
   `exchanging` on timeout or lease expiry. On successful response, durably commit
   encrypted refresh material in a separate transaction as `material_ready`
   before entering account/session mutation. A DB write failure after provider
   success is an ambiguous external outcome, not a safe exchange retry.
4. Atomically attach `material_ready -> committed` to the same verified existing
   identity and account outcome. Do not overwrite earlier material ownership.
   Conflict, cancellation, stale generation or rejected account mutation after
   acquisition moves owned material to `cleanup_pending`; rollback must not erase
   it. Account deletion transfers/detaches ownership without cascading away any
   pending material. Cleanup must process every material owner, not the current
   one-ciphertext-per-Firebase-UID projection.
5. Map expired `exchanging`, transport ambiguity and unreconciled post-provider
   write failure to `unknown`. Never replay the authorization code, manufacture
   refresh material, declare revoke success, or silently expire this obligation.
   A late response may attach material only through an exact-owner CAS, then
   cleanup if the attempt was abandoned. Truly lost material needs a separately
   verified provider/user-remediation policy; software cannot reconstruct it.
6. Duplicate submissions return the same bounded attempt state and perform no
   exchange. Mismatched binding/fingerprint fails closed. For committed response
   loss, provide a verified-principal receipt/status flow and a separately
   specified fresh session acquisition; do not persist raw session bearer tokens
   in the ledger or invent an idempotent response the current endpoint lacks.
   All retry/session semantics require negative tests before routing activation.

Minimum states: `claimed`, `exchanging`, `material_ready`, `committed`,
`unknown`, `cleanup_pending`, plus a terminal cleanup outcome. `unknown` is an
explicit unresolved obligation, not a grant-recovery guarantee. A fresh attempt
must not erase an earlier unknown one.

## Required acceptance before a production implementation can pass

- Exact-route tests flip from gap reproduction to preserved ownership; synthetic
  exchange adapter is injected explicitly, not selected by live configuration.
- Real disposable PostgreSQL tests cover concurrent duplicates, CAS loss,
  rollback, process death before/after each durable boundary, response loss,
  foreign-principal/subject/Services-ID/redirect mismatch, deletion during an
  in-flight exchange, multiple materials and key/decryption failure.
- Versioned migration/ledger inventory, non-empty export redaction, retention
  inventory and multi-material deletion/cleanup tests close together. No code
  persistence, automatic code replay or one-slot overwrite remains.
- Default-OFF, existing allowlists and Google-only enrollment negative contracts
  remain green. Real consoles, exact callback registration, Apple/Firebase
  interoperability and lost-material remediation remain separate live gates.

## Reproduce and source binding

Focused verification: 29/29 backend tests (this diagnostic, Apple revocation,
Apple transport, Web payload and Firebase social verification); 5/5 R9 recovery
contract tests; Node syntax and whitespace checks clean; scoped repository secret
rules returned zero findings. Migration inventory and bytes are unchanged from
the package start: 105 up files and 78 down files. The historical first 27 up
migrations have no paired down files; this package does not alter that baseline.
No real PostgreSQL migration or crash test was run because no migration or
production implementation was supplied. Passing diagnostic tests are not a
durability acceptance claim.

From `backend/`:

```sh
node --import ./test_setup.js --test test/apple_exchange_durability_gap.test.js
```

Source SHA-256 inspected on 2026-10-03 (package start HEAD
`10d5d878f4aee1f056c0a935308ab201fbc8f0b3`; concurrent unrelated commits do not
change these source bindings):

| Source | SHA-256 |
| --- | --- |
| `backend/src/app.js` | `ed66b274d8d26ab142bf51d2b04440eb7c6d78e43a08e90f8215b301d18d0647` |
| `backend/src/apple_revocation.js` | `e3e83a54ed7bb3818231ffadf39d2482193be19d20a880598fefffab46a7aae5` |
| `backend/src/firebase_identity_cleanup.js` | `f4f4f77c57cca13b3e63e96fd50add1200bc2c59a99b50125902032d1df93fa5` |
| `backend/sql/migrations/094_apple_refresh_material_only.up.sql` | `012f206baad0943084d4e22073078aaf53a3ea71f55072a779f11e19fc39b941` |

Next module: coordinator scopes the ownership schema, multi-material cleanup and
privacy/retention consumer closure as one backend package; retain the dormant Web
client and default-OFF configuration until that package and W3's live gates pass.
