# WP141 — Stripe test-mode Connect refund recovery

Status: **COMPLETE LOCALLY AND ON GITHUB; PROVIDER SANDBOX END-TO-END REMAINS OPEN**.

## Why this package came next

After WP140, the conservative portfolio still contained seven OPEN areas. The
Stripe sandbox payment/refund/payout journey is the most consequential
technical prerequisite for the remaining binding rental lifecycle. A source
audit found a concrete P0 accounting risk before any provider activation: a
refund selected only the newest paid payout and could not safely reverse an
owner share spread across multiple partial payouts. The same path lacked a
durable way to distinguish a lost provider response from a rejected refund.

WP141 therefore closed the local integrity foundation before any Stripe API,
Dashboard, account, test-money or deployment action.

## Provider and account model

The implementation retains Stripe Accounts v2 with a recipient configuration,
Express Dashboard, and the application responsible for fees and negative
balances. Payments use separate charges and transfers. Checkout does not set
`transfer_data`, `application_fee_amount` or `on_behalf_of`; owner transfers
remain separately delivery-gated and use the captured charge as
`source_transaction`.

This matches Stripe's official
[Accounts v2 connected-account configuration](https://docs.stripe.com/connect/accounts-v2/connected-account-configuration)
and
[separate charges and transfers](https://docs.stripe.com/connect/marketplace/tasks/accept-payment/separate-charges-and-transfers?locale=en-GB)
guidance. It is a local architecture decision, not evidence that the owner's
Stripe account, profile, terms or production entitlement is ready.

## Refund and recovery invariants

Every refund-side owner-transfer reversal is now an immutable row bound to one
refund, payment, payout, provider transfer, amount, currency, live mode and
stable provider idempotency key. Composite foreign keys prevent a refund or
payout from being attached to another payment. A refund that spans several
partial payouts allocates newest-first and fails closed unless the complete
transferred owner exposure can be represented.

Before a provider reversal, and again before the local ledger mutation, the
workflow locks and rechecks payment, refund and payout status, transfer ID,
currency, live mode and remaining amounts. The refund path and dispute
transfer-recovery path serialize on the same payment row. An already uncertain
dispute recovery plus an active refund becomes manual review rather than a
second provider action.

If a transfer reversal succeeds but its response is lost, the durable row
stays uncertain. Recovery searches provider inventory by its exact metadata,
then records the original immutable amount without recalculation. If the actual
refund succeeds but its response is lost, retry searches the charge's refunds
for the exact local refund ID, revalidates charge, amount, currency, live mode
and booking/payment/refund metadata, and finalizes locally without issuing a
second refund. More than one matching provider object is an integrity conflict.
Local finalization locks payment, refund and command together so two retries
cannot duplicate the ledger, workflow transition or notifications.

Only these structured Stripe invalid-request codes with a matching
`StripeInvalidRequestError` and 4xx provider status count as definite
rejections: `amount_too_large`, `parameter_invalid_integer`,
`parameter_missing`, `resource_missing` and
`transfer_reversal_amount_too_large`. A bound provider refund object whose
status is `failed` or `canceled` is also definite. Provider status `408`,
`425`, `429`, 5xx, transport status zero, local status `503`, unstructured 4xx
and intermediary errors remain uncertain. They never become a successful
refund and never permit a different in-progress refund to bypass recovery.

## Data lifecycle and recovery proof

Open or review-required refunds and transfer reversals block account deletion.
The account export includes minimized recovery status, amount, category and
timestamps, while provider IDs and idempotency keys stay excluded. The central
retention inventory now includes the recovery table.

Migration `075_refund_transfer_reversal_recovery.up.sql` is additive. Its down
migration refuses to erase any stored recovery row. The isolated PostgreSQL 16
R9 run applied all 75 migrations to a clean database, upgraded the legacy
27-migration database, reproduced the exact schema after backup/restore,
refused every destructive rollback fixture and removed all temporary data and
processes. Its schema fingerprint is
`f3e81c9d7493e12e853f7c5ef3e36134205d3c07e6d6797c5a41153e141e9269`.

## Verification and remaining gates

Focused payment/provider/recovery checks pass 35 of 35. The backend suite
passes 878 with two deliberate environment skips and zero failures. The real
PostgreSQL integration passes both tests and cleanup, including two partial
payouts, a lost transfer-reversal response, a lost provider-refund response,
exact provider lookup and duplicate-refund prevention. Full local technical
regression passes in the repository's combined CI-metadata and candidate-
rollover mode. Payment implementation commit
`45e40a06ab420ac46e15a04f7d2ac0dfa8ddecaf` first exposed a legitimate
ratchet failure: `app.js`, `privacy_export.js` and `retention_inventory.js`
had changed, but the privacy and retention source inventories still contained
their predecessor hashes. This made the two honest baselines fail first and
caused 55 dependent negative tests to fail before reaching their intended
assertions. Commit `d2f88f704484efbd564038bd98d6f6a28e4d1c76`
recomputed exactly those six inventory entries. It changed no disclosure,
retention decision, runtime behavior or gate. Both baseline validators and all
68 focused ratchet tests then passed, followed by the complete local gate.

Exact closure-head Regression `34770241597`, including its independent clean
checkout, and CodeQL `34770241626` pass with zero open code-scanning alerts.

The existing portfolio remains **21 PASS, 4 PARTIAL and 7 OPEN**. No item is
promoted on local simulation alone. Stripe sandbox runtime configuration,
authenticated account/profile/terms readback, and a real test-money
payment/refund/simulated-payout journey remain OPEN. Production provider
selection remains a later separate decision.

No Stripe API, Dashboard, credential, account, test money, real money,
Staging runtime, Production, VPS, Cloud, Firebase, Google Play, app candidate,
Pixel, OnePlus or PR-merge state changed.

Machine-readable evidence:
`docs/evidence/release-readiness/wp141-stripe-test-mode-connect-refund-recovery-20260913.json`.
