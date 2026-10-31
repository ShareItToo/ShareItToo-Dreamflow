# SIT payment and payout gap — 2026-10-03

**Result: local source checks PASS; provider payment/payout acceptance OPEN.**
This bounded audit uses source HEAD
`678b84b3527829eae0ceb7c013e7cfc3094d024f` on
`codex/master-workflow-20260808`. Payment/backend sources did not change from
the audit's initial HEAD `fd90df58bf1450ac2268b5740e545b6b301b2184`.
No concrete source defect was established in this scope. No provider request,
credential inspection, deployment, charge, refund, transfer or account change
was performed. Existing evidence is not a fresh provider/runtime readback.

## Authority and distinct lanes

The [Mission masterplan](../product/SIT_MISSION_MASTERPLAN_2026-09-30.md),
[Web contract](STAGING_WEB_PILOT.md), and
[Web/native matrix](SIT_WEB_NATIVE_CAPABILITY_MATRIX_2026-10-02.md) retain the
non-binding, no-real-money boundary. They do not activate payments.

| Lane | Current source truth | What remains unproved |
| --- | --- | --- |
| Local clone payment simulation | [Adapter](../../backend/src/synthetic_clone_payment_test.js), [contract](../../backend/docs/synthetic-clone-payment-test.md): default off; only local QA, loopback, test environment, memory transport and clone booking. Fixed synthetic 60 EUR + 10% fee; challenge/capture/decline/refund/replay are ephemeral state. `monetaryEffectMinor=0`, `payout=null`; no DB/provider import. | Physical UI acceptance for an exact candidate; never Stripe or payout evidence. |
| Technical Stripe sandbox | [Configuration](../../backend/src/technical_sandbox_config.js), [workflow](../../backend/src/technical_sandbox_workflow.js), [UI](../../lib/screens/payment_methods_screen.dart): default off; fixed 100 cents EUR, at most three runs/user/24h, named synthetic users, exact test account, restricted test key plus separate webhook secret in private files, maximum 24h authorization and kill switch. | Fresh configuration/account/authorization and actual provider receipt readback. This lane explicitly has no booking, payment ledger, Connect or payout, even if its test succeeds. |
| Marketplace payment/refund/payout | [Workflow](../../backend/src/payment_workflow.js), [adapter](../../backend/src/stripe_provider.js): Accounts v2 Express recipients, separate charges/transfers, payment only after owner acceptance, simulation booking rejection, immutable replay/refund/recovery bindings. Payout requires settled payment, eligible terminal booking, applicable hold/contract clock, resolved refund obligations, no blocking dispute/moderation and ready owner account. | Current provider configuration, approved preflight, exact-source execution authorization and all eight official sandbox scenarios, including actual transfer/recovery readbacks. A connected-account transfer is not proof of a bank settlement. |
| Real monetary effects | [Config](../../backend/src/config.js) rejects Stripe live outside production and requires approved immutable financial-document issuance for live transport. | No current permission or evidence. Neither technical test nor marketplace sandbox PASS grants real-money readiness. |

The payout rule remains after return with the existing holds and refund/dispute
guards. Source also preserves its separate cancelled-booking settlement path.
This audit does not reinterpret cancellation, withdrawal, fee or legal rules.

## Exact remaining gates

1. **Retained runtime is provider-off; fresh runtime unknown.**
   [Phase-0 closure](STAGING_WEB_PHASE0_CLOSURE_2026-10-01.md) records API
   `6c0ef70db2656df3e378add858d5f5157388127e`, payment `memory`, Stripe live
   false and technical sandbox/provider traffic off. The synthetic catalog
   cannot book or pay. That October 1 record is provenance, not an October 3
   observation. [Staging Compose](../../backend/compose.staging.yml) also
   defaults to `memory`/false; defaults are not live state.
2. **Marketplace readiness is explicitly HOLD.**
   [WP146 evidence](../evidence/release-readiness/wp146-stripe-payout-and-activation-guard-20260914.json)
   retains `hold-provider-contract-credentials-webhooks-connect-and-sandbox-e2e`.
   Its September 14 observation of zero connected accounts/destinations and
   false preflight flags is historical, not proof they are absent today.
   Fresh evidence must establish operator/product/contract, approved Connect
   configuration, DPA/regions/transfers, professional checkout/refund review,
   protected test credentials and two distinct signed webhook destinations.
3. **Credentials alone cannot satisfy the current deployment gate.**
   The [execution validator](../../backend/ops/validate_stripe_staging_execution_gate.mjs)
   requires approved readiness bound to the deployment source, 3–12 isolated
   pilot users, an external private authorization file, maximum 24h execution
   and a reviewed abort route. A direct read-only binding check of retained
   WP146 implementation `03021ef1206dcbcdb00bfd25b0f4b08f9e7be96f` against the
   audited HEAD returns `stripe_staging_readiness_backend_drift`. This is the
   expected fail-closed result. Preserve historical WP146 bytes; prepare an
   explicitly versioned current evidence/reader successor after current
   prerequisites are established, rather than rewriting historical proof.
4. **Sandbox acceptance remains separate from source acceptance.**
   The [PSP runbook](P0B_PSP_SANDBOX_E2E_RUNBOOK.md) requires onboarding,
   authorize/capture/decline, signed webhook replay/order, rent/fee refunds,
   partial payout, chargeback, ledger/document reconciliation and ambiguous
   outcome/idempotent recovery. Keep genuine time boundaries: do not mutate
   booking or contract clocks to claim an elapsed payout hold. Isolated old-time
   fixtures prove post-window code only.

## Decisive verification

Executed from `backend/`, using the standard `test_setup.js`; these are local
fixtures/mocks and loopback HTTP, with no real provider traffic or PostgreSQL
acceptance claim:

```sh
node --import ./test_setup.js --test \
  test/payment_execution_guard.test.js test/stripe_staging_execution_gate.test.js \
  test/stripe_staging_secret_gate.test.js test/stripe_config.test.js \
  test/stripe_connect_v2.test.js test/payment_domain.test.js \
  test/payment_refund_obligations.test.js test/synthetic_clone_payment_test.test.js \
  test/booking_payment_projection_truth.test.js
# 85 passed, 0 failed, 0 skipped

node --import ./test_setup.js --test \
  test/technical_sandbox_config.test.js test/technical_sandbox_provider.test.js \
  test/technical_sandbox_workflow.test.js test/technical_sandbox_http.test.js \
  test/technical_sandbox_runtime.test.js
# 32 passed, 0 failed, 0 skipped
```

No implementation changed, so no full regression or release gate was repeated.

## Smallest next modules

1. Read back the exact Staging runtime and coarse payment/technical-sandbox
   capability state without exposing secrets; bind that observation to current
   runtime/source. Keep the local simulation and both Stripe lanes distinct.
2. For the intended provider lane, establish fresh read-only account/config
   evidence and resolve the named missing preflight facts. The narrow technical
   1 EUR test cannot close the marketplace/payout requirement.
3. Only within separately established activation authority, prepare and review
   the current evidence/validator successor, secret-presence checks and exact
   execution/abort plan; then perform the eight bound sandbox scenarios. Real
   money and public release remain separate gates.
