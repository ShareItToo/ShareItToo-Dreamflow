# RW21 Stage-A non-binding simulation

Status: **CLOSED / STAGING ROLE-FLOW VERIFIED / PIXEL FOLLOW-UP RW22 CLOSED**
on 02.09.2026.

## Purpose

The closed Heilbronn Stage-A pilot can exercise two real Staging accounts,
listing discovery, a renter request, owner acceptance, shared chat and
transactional in-app/push notification creation without representing a legal
booking. The simulation creates no platform contract, reservation, payment,
payout, refund, dispute, receipt, handover, return, damage or review effect.

The mode is derived rather than independently switchable. It exists only when
the backend is in `staging` or `test`, the booking mode is `pilot`, and the
private pilot is enabled. Production cannot enable it through an additional
environment flag.

## Fail-closed controls

- The client requires an explicit simulation acknowledgement and labels the
  renter and owner surfaces as an unverbindliche Pilot-Simulation.
- The server stores `simulation_only` as first-class booking truth, excludes
  simulations from availability and permits only request acceptance,
  rejection or cancellation.
- Contract, payment and legal-declaration creation are skipped. Payment reads
  and checkout creation reject simulation bookings.
- PostgreSQL independently rejects simulation-booking rows in every financial,
  contract, refund, dispute, deposit and actual-loss table.
- Simulation notifications are visibly labelled and never enter the email
  channel. They may use only in-app delivery and the separately gated
  transactional push path.
- Accepted simulations expose chat but not handover, return, payment, receipt
  or review actions.

## Verification

- Node tool inventory: 2,027 passed, 0 failed.
- Backend unit suite: 756 passed, 0 failed, 2 documented skips; syntax checks
  passed.
- Local PostgreSQL integration: passed and cleaned, including migration 070
  and the independent database side-effect guard.
- Flutter suite: 635 passed, 0 failed, 3 documented skips.
- Flutter analyzer: 0 issues.
- Focused Stage-A checkout, server-boundary and remote-runner tests passed.

The implementation was committed and pushed through correction/final binding
HEAD `0102414c38cb97b11d6461e36e7c808d33458d16`. Complete local regression,
exact-head GitHub Regression and CodeQL passed. The exact Staging deployment
and sanitized two-role run then proved request/acceptance visibility, shared
chat, in-app notifications, unaffected availability and payment rejection
without a contract, reservation or money effect.

## Deployment, device and external boundaries

Staging was deployed and verified first on exact RW21 candidate source
`0102414c38cb97b11d6461e36e7c808d33458d16`. Candidate `2026090205` was then
built and installed only on the Pixel. That physical run exposed a separate
legacy public-profile cache problem; RW22 corrected it and replaced the Pixel
candidate with `2026090206`. OnePlus remained outside both packages.

Migration 070, exact deployment and the private synthetic runner all passed.
The runner read credentials only from the owner-only vault outside Git and
returned sanitized role/behavior facts without credential or identity output.

## Rollback and next gate

Code rollback is the normal forward Git revert. The migration down script
removes the simulation triggers, function, index and column; it must not be run
while simulation rows exist without an explicit data-preservation decision.

RW21 is complete. Pixel public-profile resilience is separately closed by
`docs/operations/RW22_PIXEL_PUBLIC_PROFILE_CACHE_RESILIENCE_2026-09-02.md`.
Real contracts, real money, public rollout and unreviewed V5.2 legal assets
remain closed.
