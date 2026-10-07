# Apple Web W4-B: remaining ownership seam

Date: 2026-10-03. **FIX: the coordinated ownership contract is not implemented.**
This supersedes neither W4-A's defect evidence nor its proposed state machine.
Shared privacy/retention manifest work was authorized for W4-B; lack of that
authority is no longer a blocker. No production source, schema, configuration or
manifest changes remain from this attempt. No activation, provider request,
deployment, commit or push was performed by this worker.

## Additional decisive evidence

`backend/test/apple_exchange_durability_gap.test.js` now has ten passing
source-bound, synthetic tests. The additional baseline case submits a verified
existing Apple identity with `appleAuthorizationCode: null`. The current route
performs zero exchange calls and commits one synthetic session while retaining
the previous ciphertext through SQL `COALESCE` semantics. This is the current
optional-material contract, not a claim that all code-free Apple login is itself
a vulnerability. It proves that a parallel ownership endpoint alone would not
govern every Apple sign-in or the old exchange/overwrite path.

A disposable loopback PostgreSQL 16.15 cluster applied the current schema and all
105 migrations. Run-unique synthetic rows and generated encryption keys proved:

- Real SQL rollback restores the previous identity ciphertext.
- A second outbox material row for the same Firebase UID fails uniqueness with
  SQLSTATE `23505`; the current queue cannot represent separate grant owners.
- Setting the current Apple cleanup status to `unknown` fails its CHECK with
  SQLSTATE `23514`; ambiguous exchange ownership is not expressible there.
- Hard-deleting the synthetic user cascades its auth identity while the already
  queued provider-deletion row survives.

No provider adapter or remote endpoint was used in that PostgreSQL diagnostic.
The disposable server was stopped and its exact temporary directory removed.
This is baseline SQL constraint/rollback evidence, **not** a tested successor
ledger, restart recovery, concurrent owner claim or full public deletion flow.
The probe was an ad-hoc local command; no reusable PG test runner was delivered.

## Exact remaining seam

An unmounted receipt-only service was considered, and isolated owner-bound
encryption/fingerprint/default-OFF tests were tried. That prototype was removed:
green primitives would not satisfy this package's complete consumer contract.

The smallest safe successor must close these pieces together:

1. **Versioned ownership inside the actual Apple route.** When the successor
   ownership mode is enabled, the existing Apple branch must not independently
   exchange, overwrite a material slot, or treat an unbound missing code as a
   replacement for an attempt receipt. Define its exact request/receipt/status
   version and its fresh-token path for committed-response loss. Do not retain
   or replay bearer sessions. The default-OFF branch must preserve current
   behavior, including existing native clients, until separately reviewed
   integration; enabling the successor cannot silently break native requests
   lacking the new attempt contract.
2. **Attach before account erasure destroys the lookup.** `eraseAccount` calls
   `enqueueFirebaseIdentityDeletions`, reads cleanup status, deletes
   `auth_identities`, then anonymizes the user. Every acquired or exchanging
   attempt must transfer to independent cleanup ownership before that lookup
   disappears. Handle both anonymization and hard-delete cascades, plus a late
   provider response after either. Keep an active exchange reservation distinct
   from cleanup-safe material; do not drain it as if the write had finished.
3. **Replace the single-material completion projection.** Both
   `getAppleRevocationCleanupStatus` and the cleanup worker currently reason from
   one outbox row/ciphertext per Firebase UID. Their successor must account for
   all material owners and unresolved `unknown` attempts. Finishing Firebase
   deletion or revoking one token cannot clear sibling obligations or report
   total Apple cleanup complete. A lost revoke response must not silently become
   a new unbounded automatic effect retry.
4. **Close the remaining readers atomically.** The append-only migration, public
   export redaction, retention inventory, source-bound manifests and migration/
   recovery inventories must land with populated PG16 fixture coverage. Neither
   unknown rows nor pending encrypted material may vanish on account deletion,
   expiry, down migration or response loss. Current source-only gates must not
   raise a live image-bound schema boundary.

The W4-A proposal remains the implementation starting point: immutable digest
binding to verified principal/subject/configuration/expiry, keyed one-way code
fingerprints, owner-authenticated encryption, one exchange CAS and no code replay.
The missing deliverable is the complete versioned route-to-ledger-to-cleanup
implementation and its real fault matrix, not another detached crypto helper.

## Verification and next gate

Focused diagnostic run: 10/10. The existing migration inventory remains 105 up
files and 78 down files, with no added or changed migration. PostgreSQL 16.15 is
available, so tool availability is not the blocker. Production files are unchanged.

Next: agree the exact versioned request/receipt/status and native coexistence
contract above, then implement and test that route branch with the ledger and
multi-material cleanup as one package. Keep Web acquisition unintegrated and all
provider flags OFF. This handoff does not claim W4-B acceptance or live readiness.

Authoritative local sources inspected: `backend/src/app.js` (social route and
account erasure), `backend/src/firebase_identity_cleanup.js`,
`backend/src/apple_revocation.js`, `backend/src/firebase_social_auth.js`,
`backend/src/privacy_export.js`, `backend/src/retention_inventory.js`, migrations
`021_firebase_identity_deletion_outbox.up.sql`, `093_apple_identity_revocation.up.sql`
and `094_apple_refresh_material_only.up.sql`, and repository `AGENTS.md`.
