# WP146 — Stripe payout and activation guard

Status: **TECHNICAL FOUNDATION COMPLETE; PROVIDER SANDBOX ACTIVATION HOLD**.

## Outcome

The Stripe-compatible payment path now has a fail-closed, short-lived sandbox
execution authorization. It is bound to the exact repository evidence and
implementation commit, expires after at most 24 hours, accepts only a bounded
pilot allowlist and requires three distinct owner-only Stripe test-secret
files. Read-only payment truth remains available after expiry, while every
provider mutation is checked both before preparation and immediately before
the provider call. Checkout expiry cannot outlive the authorization.

The provider adapter uses Accounts v2 Express recipients with separate charges
and transfers. Exact metadata and idempotency binding recover a lost transfer
response without duplicating a transfer. Refunds reverse immutable payout
shares newest-first, and durable shared payment/booking locks prevent payout,
refund or dispute processing from overtaking one another. Completed retries
return only after exact operation, payment, actor and request binding.

The definite provider-rejection allowlist is deliberately narrow:
`amount_too_large`, `parameter_invalid_integer`, `parameter_missing`,
`resource_missing` and `transfer_reversal_amount_too_large`. HTTP `408`,
intermediary errors, unstructured 4xx responses and all other ambiguous
failures remain uncertain and require reconciliation; they are never reported
as a definite rejection.

Withdrawal, cancellation and actual-loss refund obligations block payout and
account deletion until resolved. The withdrawal window uses the database clock,
the booking timezone, the exact V5.2 contract version and 14 calendar days.
Platform snapshot and Connect thin-event webhooks have separate destinations
and signing secrets.

## Actual provider observation and remaining HOLD

The official connection is authenticated to exactly one account named
`ShareItToo Sandbox`; it reports sandbox mode and `livemode=false`. Read-only
inspection found zero connected accounts and zero webhook destinations. No
Stripe account, product, Connect recipient, webhook, credential, payment,
refund, transfer or test-money object was created or changed.

Authentication proves access only. It does not prove the licensed marketplace
product, operator control, executed contract, approved Connect configuration,
DPA, processing regions, transfer mechanism, professional V5.2/payment review,
three protected test credentials or the two required webhook destinations.
Therefore the committed machine-readable evidence intentionally cannot satisfy
the deployment gate. The Staging runtime remains on the memory payment
transport and the eight official sandbox end-to-end scenarios remain pending.

## Verification

- Payment/security focus: 84 of 84 passed.
- Provider-truthfulness wiring: 18 of 18 passed.
- Backend: 904 total, 902 passed, 2 intentionally skipped, 0 failed.
- Fresh PostgreSQL 16 integration and cleanup: 2 of 2 passed.
- Complete local technical regression passed, including Flutter tests,
  analyzer, Web/Wasm, loopback smoke and Android debug build/surface.
- Implementation/correction HEAD
  `03021ef1206dcbcdb00bfd25b0f4b08f9e7be96f` passed CodeQL run
  `34795091053`; Regression run `34795091069` and its independent clean-checkout
  job are its exact-head implementation gates. The final documentation head
  must independently pass the same GitHub gates before closure is reported.

The first implementation-head Regression `34794835466` exposed one CI-only
composition defect: the new mandatory sandbox authorization interpolation
variables were absent from the workflow's Compose validation environment. The
fix supplies three clearly synthetic pilot IDs and a deliberately expired,
non-authorizing validation identity. Tests bind those exact values. The next
GitHub Backend job passed all production/Staging Compose plans and the
commit-labelled image build. This is deterministic validation data, not a
runtime prerequisite, timing workaround or reusable authorization.

## Ratchet review

The stored privacy/retention and Support/P0B source hashes changed only because
WP146 legitimately changed the application wiring, payment configuration,
booking workflow and withdrawal workflow. Their exact current hashes were
rebound after review: `app.js` is
`161af8e4119ea9e1d1d245d9288ec56338ea76cc6253b4e8022b65f6e73be304`,
`config.js` is
`ea884e57751fa61fccfedf65ae7553d5e9f960ed00696205e4703fae8834c70f`,
`booking_workflow.js` is
`86a57a3897b0cd3921887d0c9b140b46ce3b5f9133be99b83f6f4de02c8d3d9b`
and `v51_withdrawal_workflow.js` is
`c3b009123accd1264d2423478cdc524521b58b9eeb9dc6757f1cd8c66e823195`.
All focused ratchet tests and the complete regression pass; no disclosure,
retention, Support, legal or external-readiness meaning was weakened.

## Portfolio and boundaries

The 32-area portfolio is now **22 PASS / 5 PARTIAL / 5 OPEN**. The Stripe area
moves from OPEN to PARTIAL because its code, persistence, recovery and
activation guard are complete, but actual Connect/webhook configuration,
professional approval and official sandbox E2E proof are not. The remaining
OPEN areas are Facebook sign-in, Apple sign-in, binding V5.2 contract/return/
damage, manual TalkBack traversal and durable least-privilege private-registry
pull.

No deployment, Production, Store, Firebase Console, VPS, DNS, credential,
Stripe configuration, provider mutation, test money, real money, device action
or PR merge occurred. Machine-readable HOLD evidence is in
`docs/evidence/release-readiness/wp146-stripe-payout-and-activation-guard-20260914.json`.
