# ADR-071: Provisional or independently approved account measures

Status: accepted for non-live technical implementation on 22.08.2026.

## Context

Drive scenarios `SUP-095` and `SUP-096` require an immediate protective
account restriction to remain explicitly provisional and require independent
approval before a permanent restriction takes effect. The prior suspension
route accepted an optional end time and could not prove that an unbounded
account effect matched an independently reviewed immutable payload.

## Decision

SIT permits the direct account-wide route only for a finite provisional
measure. The server supplies a canonical no-guilt notice, and the database
binds the provisional status and structured decision context.

Permanent or unbounded account restriction uses a separate proposal/review
state machine. The database hashes and freezes one exact proposal payload,
requires a different verified Administrator for review and rechecks current
target truth. Approval atomically records the review, moderation decision,
account suspension and state, target session/refresh revocation and audit.
Rejection creates no account effect. Exact idempotent replay is allowed;
payload, actor, version or state drift fails closed.

## Consequences

- An urgent protective step cannot be presented as a completed finding.
- One person cannot both propose and approve a permanent restriction.
- Review evidence cannot be reused for a changed payload or changed account
  state.
- A partial approval failure cannot leave only some account effects applied.
- The user export exposes final outcome facts without internal notes or staff
  identity.
- Support obtains no generic session-revocation or automated-sanction power.
- Later Business/Global operation must preserve exact-payload review,
  four-eyes separation, atomic effects, appealability and audit truth.

## Rejected alternatives

- Allow an omitted end time on the direct suspension route: rejected because
  it makes a permanent effect possible without independent approval.
- Record an approval only in audit metadata: rejected because metadata alone
  cannot bind the exact payload or enforce four-eyes review.
- Approve first and apply account effects in later transactions: rejected
  because partial failure would make evidence and actual state diverge.
- Let a reviewer edit the proposal while approving it: rejected because the
  proposer never authorized the changed payload.
- Treat a provisional restriction as guilt or final violation evidence:
  rejected as disproportionate and inconsistent with the source scenario.
