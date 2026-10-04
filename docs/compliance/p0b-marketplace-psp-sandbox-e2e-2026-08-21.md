# P0B Marketplace-PSP Sandbox E2E Gate

Date: 2026-08-21

Authorization: `P0B_NEXT_PSP_SANDBOX_E2E_ONLY`

Result: **preflight and executable fail-closed gate complete; external
provider-sandbox E2E not run because its mandatory prerequisites are absent.**

## Evidence checked

The gate binds the current payment provider adapter, payment domain/workflow,
focused unit and PostgreSQL integration sources, the P0B dossier and the new
runbook/evaluator. Live Drive checks bind:

- Core Specification V5.2;
- Rechtsmappe Privatlaunch V5.2;
- Geld, Storno, Widerruf und Streitfälle V1;
- Support Testkatalog und Pilot-Gates V1; and
- Support Source of Truth V1.

Searches for `PSP Vertrag`, `Stripe Connect`, `Zahlungsdienstleister Sandbox`
and `Marketplace PSP` returned governing or reference material, but no
standalone executed PSP contract or provider-sandbox acceptance artifact.

## Local presence-only preflight

Only example environment files are present in the backend tree. The active
process has no configured payment transport, livemode flag, Stripe secret key,
webhook secret or legal PSP facts. No Stripe CLI or provider-equivalent command
was found. Values, credentials and private paths were not recorded.

The code contains a Stripe-Connect-shaped adapter, but this proves only a
technical implementation target. It does not prove provider selection,
contract, account ownership, licensed product, DPA or production suitability.

## Technical result

Thirty-five focused local tests passed: thirty-one existing payment,
financial-document, operator and lifecycle tests plus four new readiness-gate
tests. The existing subset includes eight payment-domain tests for immutable
amounts, balanced ledgers, webhook authentication/state mapping, stable request
hashes and server-only idempotent provider parameters.

The new evaluator requires all provider facts and exactly eight sandbox
scenarios. Its synthetic ready-path unit test tests the gate logic only; it is
not provider evidence.

Current machine result:

- contracted provider/product facts ready: false;
- sandbox environment ready: false;
- provider scenarios passed: 0/8;
- external provider requests: 0;
- provider objects created: 0;
- sandbox E2E passed: false; and
- real money ready: false.

The bound Support probes are `SUP-070` through `SUP-091` and `SUP-162`, covering
server quote truth, idempotency, webhook replay/signatures, state wording,
separate refunds, partial payout holds, cancellation/no-show, provider/DB
mismatch, documents, test-only UI and fail-closed missing PSP configuration.

## Required external inputs

Before a provider call, obtain authenticated sanitized evidence for the exact
licensed marketplace product, executed contract, product configuration,
sandbox operator account, DPA, processing regions, transfer mechanism and the
bounded professional PSP/checkout review. Test-class server and webhook
credentials must then be placed in an approved secret store without entering
Git or chat.

Only then may the eight scenarios in
`docs/operations/P0B_PSP_SANDBOX_E2E_RUNBOOK.md` run. A sandbox pass still does
not authorize real money, production, Store, public activation or pilot users.

## Boundary

No provider endpoint, dashboard or object was touched. No production, Cloud,
payment-provider, Store, public or real-money state changed. The correct state
is `hold-provider-contract-credentials-and-sandbox-e2e`.
