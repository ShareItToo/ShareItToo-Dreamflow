# ADR-074: Server-authoritative booking address reveal

Status: accepted for non-live technical implementation on 22.08.2026.

## Context

Drive scenarios `SUP-046` through `SUP-048` require the exact address to stay
hidden until six hours before a mutually confirmed appointment, to reveal
immediately after a later effective confirmation, and to block and audit
unauthorized access. The existing client used its own clock and booking status,
and some ongoing views exposed the exact address unconditionally. Neither path
could enforce participant, confirmation, safety or audit truth.

## Decision

SIT uses one authenticated server decision for exact address visibility, with
separate pickup and return segments. The server checks participants, distinct
counterparty confirmation, booking-local date, six-hour boundary, workflow
state, address presence and current safety holds. A participant receives the
address only when every condition holds; an outsider receives the same `404`
as a missing booking.

Every attempt produces a minimized append-only audit action. Migration `061`
validates successful reveal truth independently and refuses destructive
rollback while evidence exists. Backend-enabled clients fail closed and never
fall back to their own clock. The local demo/QA simulation remains explicitly
labelled and deterministic.

## Consequences

- Late confirmation opens the address immediately without a scheduled job.
- Pickup and return do not accidentally reuse each other's time authority.
- Safety review can stop automatic disclosure without changing the booking.
- Unauthorized access does not reveal booking existence or participant data.
- Exact addresses never enter access-audit metadata.
- Business/Global variants can extend jurisdiction and location policy behind
  the same server contract without teaching every client a new rule.

## Rejected alternatives

- Client clock plus accepted status: rejected because it cannot prove
  counterparty confirmation, safety state or server time and is manipulable.
- Reveal all ongoing bookings: rejected because it bypasses the separate
  return appointment and safety gate.
- Support manually sends the address: rejected because the Drive playbook
  expressly forbids disclosure before the rule is met and would fragment the
  audit trail.
- Return `403` only for outsiders: rejected because it distinguishes an
  existing private booking from a missing identifier.
- Heuristically block every address-like free-text message: rejected because
  incomplete pattern matching and false positives would create an unreliable
  hidden prerequisite. Structured system location sharing is guarded instead.
- Add a delayed background job: rejected because evaluating the current server
  clock on access is simpler, immediate for late confirmation and avoids timer
  or scheduling correctness as a release dependency.
