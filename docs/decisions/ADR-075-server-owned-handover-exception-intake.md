# ADR-075: Server-owned handover exception intake

Status: accepted for non-live implementation on 22.08.2026.

## Context

Generic support taxonomy could describe an item mismatch or no-show, but it
could not prove the current booking, appointment, contact attempt or neutral
effect boundary. Allowing clients to choose a Trust route, priority or outcome
would create authority drift. The Support Matrix also requires direct do-not-pay
and safe-abort guidance without an automatic guilt, payment or cancellation
decision.

## Decision

Use one specialized booking endpoint for exactly three handover exceptions.
The server derives the P1 case route and owner, verifies booking participation
and state, and requires the acknowledgement appropriate to the selected kind.
No-show additionally requires a reached counterparty-confirmed appointment and
a server-visible actor message. Generic support intake reserves and rejects
the same routes.

Create only a neutral simulation-mode support case. Persist a separate exact,
minimized audit receipt whose automatic effect flags are all false. Enforce the
route, booking truth, no-show evidence and metadata shape again in PostgreSQL.
Route acute danger to the existing safety path.

## Consequences

- Clients cannot turn a report into a cancellation, handover completion,
  refund, payment result, guilt determination or account/listing action.
- Item mismatch and deposit reports give immediate safe guidance while keeping
  the later decision human and evidence based.
- No-show cannot rely on device time, an arbitrary delay or a bare checkbox.
- Report details remain governed by the existing support-case lifecycle; the
  durable audit receipt stays minimized.
- Future money, cancellation or moderation action needs its separate existing
  approval and evidence workflow.
- The shared-limiter integration debt remains explicit; test isolation may not
  weaken or rotate around the production limiter contract.
