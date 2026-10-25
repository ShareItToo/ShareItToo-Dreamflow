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

On the staging host, first collect the three protected read-only inputs from
the existing root:root mode-0600 authorization env and exact running Green
container. This collector makes exactly two fixed Stripe GET reads (`/v1/account`
and `/v1/balance`), with redirects disabled and bounded responses. It checks a
restricted test key, binds the returned account ID to the authorization env,
and requires `livemode=false`. These reads establish test-account/read access
only; they do not establish payment processing or marketplace capability.
Secrets are opened nofollow and are never printed. No Checkout, payment,
booking, or other state-changing provider request is made.

```sh
node backend/ops/collect_technical_sandbox_106_readonly_inputs.mjs --authorization-env /private/technical-sandbox-authorization.env --output-directory /private/activation-inputs
```

The collector atomically writes three new mode-0600 no-clobber JSON files:
`technical-sandbox-owner-authorization.json`,
`technical-sandbox-stripe-test-readback.json`, and
`technical-sandbox-rollback-proof.json`. Stdout contains only their paths and
raw hashes plus sanitized runtime/account identity. Use those exact paths and
hashes in the materializer below. Then create the sanitized evidence file with
read-only Docker access. The materializer makes no Stripe or network call. It
reads the promotion receipt timestamp for freshness, re-inspects the exact
canonical Docker ID and immutable image RepoDigest, hashes both protected
secret files without printing their bytes, and atomically creates a new
mode-0600 evidence file without overwriting one. It emits the evidence file's
raw SHA-256 for the activation CLI:

```sh
node backend/ops/materialize_technical_sandbox_106_evidence.mjs --promotion-receipt /private/green-promotion.json --promotion-receipt-sha256 PROMOTION_FILE_SHA256 --owner-authorization /private/activation-inputs/technical-sandbox-owner-authorization.json --owner-authorization-sha256 OWNER_AUTHORIZATION_RAW_SHA256 --stripe-readback /private/activation-inputs/technical-sandbox-stripe-test-readback.json --stripe-readback-sha256 STRIPE_READBACK_RAW_SHA256 --rollback-proof /private/activation-inputs/technical-sandbox-rollback-proof.json --rollback-proof-sha256 ROLLBACK_RAW_SHA256 --secret-key /run/secrets/technical-rk-test --webhook-secret /run/secrets/technical-webhook --output /private/technical-sandbox-evidence.json
```

The owner authorization input has exactly `id`, `issuedAt`, `expiresAt`,
`scope`, and two `synthetic_sandbox_user_*` `userIds`. The Stripe readback has
exactly `authenticated`, `accountId`, `accountMode`, `livemode`, and `readAt`;
the rollback proof has exactly `target`, `canonicalContainerId`, `imageDigest`,
`gatewayReadbackSha256`, `verifiedAt`, `mockPaymentTransport`,
`technicalSandboxDisabled`, and `secretMountsRemoved`. The gateway hash binds
the sanitized disabled/memory readback to the exact container and image. Raw file hashes
bind the original protected inputs. The materializer rejects stale/future
timestamps, mode/identity drift, live-mode evidence, mismatched runtime and
promotion receipt, or secret content whose SHA does not match the observed
file. Promotion freshness comes from the protected receipt's direct filesystem
mtime/ctime read, which must agree within five minutes.

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
