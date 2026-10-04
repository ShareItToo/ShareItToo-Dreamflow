# ADR-046: Non-live support decision and approval ledger

Status: accepted as a non-live technical control on 2026-08-21. It does not
authorize a real refund, payout, account measure, outbound communication or
live support operation.

## Context

ADR-045 and migration `032` established the canonical support case, but the
initial decision table could not represent a pending draft: `approved_by` was
mandatory at insertion. It also did not bind approval to the exact proposal
payload or distinguish approval from verified implementation. The current
Drive Support Packet test matrix treats a pending decision without a draft, a
red decision without approval, resolution without implementation evidence,
unscoped support reads and mutation after approval as pilot blockers.

The live-pilot state remains NO-GO. The required control must therefore be
testable without creating a provider action or claiming operator, legal or
policy approval that does not exist.

## Decision

- A proposal is a complete, immutable record of scope, confirmed facts,
  uncertainty, source policy snapshot, rule reference, bounded measure type,
  affected and unaffected areas, implementation plan, reasons and redress
  route.
- The server derives a canonical SHA-256 payload hash. Approval supplies the
  expected version and exact hash; PostgreSQL stores the same hash as approval
  evidence and rejects later proposal mutation.
- Only an active stepped-up administrator can approve or reject. The proposer
  cannot approve their own proposal. Approval never calls a payment, account,
  provider, notification or other implementation adapter.
- Only one non-final decision can exist for a case. Rejection permits a new
  proposal; approved work remains closed to replacement until a later explicit
  appeal or reversal package defines that behavior.
- Implementation evidence is recorded separately and only for cases whose
  database operating mode is `simulation` or `internal_testing`. The endpoint
  writes an internal event and audit record only; it performs no external
  action.
- A decision-backed case cannot resolve until the exact proposal is approved
  and implementation is recorded as succeeded with verifier and timestamp.
  Only a green automatic information case may resolve directly without a
  decision.
- PostgreSQL enforces optimistic versions, immutable proposal and final
  approval fields, monotonic implementation state and immutable evidence for
  an unchanged implementation state.
- A support-role account can list, read, transition or draft only cases
  explicitly assigned to its own user ID. Administrators retain the existing
  stepped-up oversight scope.

## Consequences

The decision lifecycle now has distinct, auditable proposal, review and
implementation truth. A stale or changed payload cannot be approved, a
proposer cannot self-approve, and a case cannot be reported resolved solely
because a decision row exists.

This package intentionally has no policy-snapshot creation route, user-facing
decision communication, evidence upload, appeal execution, real refund/payout
adapter, account restriction adapter or public UI. Those remain separate
bounded packages. Existing external legal, staffing, provider, privacy,
retention and activation gates remain false.
