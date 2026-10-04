# N25 Stripe test-mode Accounts v2 handover

Follow-up 2026-09-04: WP04 reproduced that N25's one-secret fixture did not
verify separate real snapshot/thin destinations. The correction and remaining
activation requirements are in `WP04_STRIPE_WEBHOOK_DESTINATIONS_2026-09-04.md`.
The N25 results below remain historical, not a WP04 or provider E2E pass.

Status: **TECHNICAL FOUNDATION CLOSED / PROVIDER E2E HELD / LIVE GATES CLOSED**
on 03.09.2026.

Implementation commit
`4ece64d59bd0b682e860c6149bae9defdb66136f` replaces the hand-built Stripe
transport with the exact locked official Node SDK, establishes Accounts v2
recipient onboarding, and makes v2 capability and responsibility state the
only connected-owner readiness truth. Migration `071` preserves old rows as
v1 and blocks unsafe rollback after a v2 row exists.

The selected marketplace flow remains separate charges and transfers:

1. the renter pays the ShareItToo platform Checkout Session;
2. the verified charge is the source transaction for the later owner transfer;
3. platform-charge refunds and transfer reversals are separate, explicit and
   idempotent operations;
4. no destination-charge-only refund flag is used.

Local verification passed 20 focused N25 tests, 796 Backend tests with the two
expected no-database skips, real PostgreSQL fresh/recovery proofs, dependency
audit, secret scan, 2,102 implementation-head repository tool tests and 2,106
closure-head repository tool tests, 652 Flutter tests, analyzer zero,
Web/Wasm, loopback smoke and Android debug build. The complete local run
used the repository's CI-metadata Store mode because the historical active Play
candidate `2026090204` is not present in this Mac mini's private archive. That
known historical artifact gap was not reconstructed, substituted or treated
as N25 payment evidence.

Exact GitHub implementation-head Regression run `33746308734` and CodeQL run
`33746308700` passed, including Backend, PostgreSQL 16, Flutter and independent
clean-checkout jobs. Open code-scanning alerts remained zero. PR #7 remains
Draft and unmerged.

One test-mode account was visible through the official read-only Stripe
connector during preparation. That observation does not establish the correct
platform identity, account capabilities, server credential, webhook endpoint
or any completed transaction. No account identifier or owner identity is
recorded.

## Exact remaining Staging owner action

The deployment secret mechanism still needs a verified test-mode server key
and webhook signing secret. At activation time, verify the intended Stripe test
platform, configure `PAYMENT_TRANSPORT=stripe`, keep
`STRIPE_LIVEMODE=false`, subscribe the Staging endpoint to the required payment,
refund and Accounts v2 events, and explicitly migrate or retire any legacy v1
connected-account rows. Then deploy only to Staging and execute the existing
P0B eight-scenario sandbox matrix.

Until those actions happen, Staging remains on the existing non-provider
payment mode and P0B stays `0/8 HOLD`. A memory-provider result must never be
presented as Stripe test-money evidence.

No Stripe object, payment, refund, transfer or reversal was created by N25. No
credential, KYC data, email address, browser cookie or token was extracted or
committed. No Production, live-payment, real-money, Play, Firebase,
Cloud/VPS/DNS, OnePlus, public-registration or merge state changed.

Machine-readable evidence:
`docs/evidence/release-readiness/n25-stripe-test-mode-accounts-v2-20260903.json`.
