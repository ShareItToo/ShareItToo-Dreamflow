# ADR-043: P0B Marketplace-PSP Sandbox Gate

Status: accepted as a non-contacting preflight and evidence gate on 2026-08-21;
the contracted-provider sandbox E2E remains blocked.

## Context

V5.2 forbids real payment before a licensed marketplace PSP is contractually
and technically resolved and fully accepted in test mode. The repository has a
Stripe-Connect-shaped server adapter, webhook verification, ledgers and broad
synthetic tests. Drive contains the governing V5.2, legal and Support Packet
requirements, but no independently identifiable executed PSP contract or
provider-sandbox acceptance evidence was found.

Code capability cannot identify SIT's contractual provider, exact product,
operator account, DPA, processing regions, transfer mechanism or approved
money-flow model. Calling the external sandbox before those facts exist would
violate the authorized gate's own prerequisite.

## Decision

- Keep the runtime in `memory` and `livemode=false`.
- Treat provider selection and contract facts as unverified until authenticated
  sanitized evidence exists; do not infer them from class or variable names.
- Inspect credentials only as presence and test/live class. Never record values.
- Require eight named provider-sandbox E2E scenarios covering onboarding,
  authorization/capture, webhooks, refunds, payouts, chargebacks,
  reconciliation and idempotent recovery.
- Reject a scenario pass unless the contracted-provider environment is ready,
  the run is non-live and a sanitized evidence reference is present.
- Keep `realMoneyReady=false` even after a future green sandbox E2E; later gates
  remain independent.

## Consequences

The technical contract and fail-closed evaluator are testable, while the
current external result is honest: zero of eight provider scenarios ran, no
provider request or object was created, and no secret was exposed. Gate 4 stays
on hold until a real contract, product facts, privacy facts, sandbox account,
test credentials and professional approval exist.

Rollback is a normal source revert. There is no migration or external provider
state to undo.
