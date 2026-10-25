# Technical Stripe Sandbox — Green 106 → 106 activation successor

This staging-only successor covers the existing **100 Euro-Cent (1 EUR)**
synthetic technical Checkout lane. It never enables the marketplace Stripe
transport. Green 106→106 promotion remains provider-off; `deploy_release.sh`
does not replace this exact-container activation transaction.

## Required evidence

The owner-provisioned, mode-0600 evidence JSON is a sanitized record, stored
outside Git. `backend/ops/technical_sandbox_106_activation.mjs` requires the
exact Green 106→106 promotion receipt hash, runtime commit and immutable image
digest; fresh owner authorization with scope and expiry; only metadata for two
distinct runtime-owned 100:101, mode-0600, regular, non-symlink, read-only
secret mounts; authenticated Stripe test-mode readback with `livemode=false`;
and a fresh rollback receipt proving memory transport, disabled technical
sandbox and removed secret mounts. Credential values are never part of the
evidence object.

The invariant boundary is fixed: Staging `heilbronn_wave0`, main payment
transport `memory`, Stripe live mode false, marketplace Stripe false, no
booking/ledger/Connect/payout/notification effects, 100 Euro-Cent (1 EUR), at most
three synthetic-user runs per 24 hours. Green promotion and activation evidence
must be less than 24 hours old; owner authorization must be live and no longer
than 24 hours; Stripe readback, rollback proof and evidence validation must be
less than one hour old.

## Phases

The runnable host CLI requires sanitized evidence, Green promotion receipt,
and a separately provisioned session-proof file outside Git. Each file must
be a single-link regular mode-0600 file under a mode-0700 private directory;
the session proof binds an exact synthetic principal and short expiry. Its bearer
token is never accepted in argv or written to output. The CLI checks protected
credential mount metadata and authenticated capability readback before execution.

```sh
node backend/ops/activate_technical_sandbox_106.mjs --mode preflight --evidence /private/evidence.json --evidence-sha256 EVIDENCE_FILE_SHA256 --promotion-receipt /private/green-promotion.json --promotion-receipt-sha256 PROMOTION_FILE_SHA256 --session-proof /private/session-proof.json --session-proof-sha256 SESSION_FILE_SHA256 --evidence-directory /private/activation-receipts
node backend/ops/activate_technical_sandbox_106.mjs --mode rehearse --evidence /private/evidence.json --evidence-sha256 EVIDENCE_FILE_SHA256 --promotion-receipt /private/green-promotion.json --promotion-receipt-sha256 PROMOTION_FILE_SHA256 --session-proof /private/session-proof.json --session-proof-sha256 SESSION_FILE_SHA256 --evidence-directory /private/activation-receipts --run-id RUN_UUID --confirm 'rehearse:CANONICAL_CONTAINER_ID:RUNTIME_COMMIT:IMAGE_DIGEST:EVIDENCE_DIGEST'
node backend/ops/activate_technical_sandbox_106.mjs --mode promote --evidence /private/evidence.json --evidence-sha256 EVIDENCE_FILE_SHA256 --promotion-receipt /private/green-promotion.json --promotion-receipt-sha256 PROMOTION_FILE_SHA256 --session-proof /private/session-proof.json --session-proof-sha256 SESSION_FILE_SHA256 --evidence-directory /private/activation-receipts --run-id SAME_RUN_UUID --rehearsal /private/activation-receipts/RUN_UUID.technical-sandbox.rehearsal.json --rehearsal-sha256 REHEARSAL_FILE_SHA256 --confirm 'promote:CANONICAL_CONTAINER_ID:RUNTIME_COMMIT:IMAGE_DIGEST:EVIDENCE_DIGEST:REHEARSAL_FILE_SHA256'
```

The CLI re-reads exact container/image/network state and rejects unsupported
mounts, resources or topology before candidate creation. Before changing the
canonical name, it stops the exact old container and verifies it stopped, so
the candidate is the sole active runtime. It then verifies `/api/version`,
authenticated technical-sandbox capability and exact canonical container ID
to immutable image RepoDigest binding. Rehearsal renames the candidate away,
restores and starts the captured old container, then proves the public
mock/disabled boundary. Promotion leaves the successor canonical and the old
exact-ID container stopped for recovery; the sealed receipt records that only
one runtime is active. No live credentials are invented; this runbook has not
executed a VPS or provider operation.

The executor's returned status maps to exit 0 on success, 2 for a rejected or
rolled-back activation with disabled/memory readback proved, and 3 when recovery
is uncertain (retain the run lock and receipts). No Production target is
accepted.
