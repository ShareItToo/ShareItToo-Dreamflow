# ADR-068: Reviewed and atomic support progress-update publication

Status: accepted for non-live technical implementation on 22.08.2026.

## Context

Drive scenarios `SUP-042` and `SUP-043` require a concrete update when no final
result exists, and an explicit apology plus a new real time after a missed
checkpoint. Generic template publication could select the wrong due state,
send a reviewed message after its case changed, or publish text without moving
the authoritative case checkpoint.

## Decision

SIT uses one dedicated progress proposal/publication workflow. It snapshots the
exact case version and prior checkpoint, derives `T-008` or `T-010` on the
server, requires every substantive update fact and creates a yellow message for
independent Administrator review. Generic draft and publication paths reject
both progress templates.

After approval, the dedicated path rechecks the exact proposal/message versions
and content hash, unchanged case state, active recipient and future checkpoint.
It atomically updates the case, records the authenticated in-app message,
finalizes the append-only proposal and writes event/audit evidence. It has no
external delivery adapter.

Published reporter metadata is privacy-exported without internal action or
staff identity. Retention remains open and non-destructive; rollback refuses
stored evidence.

## Consequences

- A missed checkpoint cannot be hidden behind the ordinary due template.
- A reviewed message cannot be published against a changed case or stale time.
- Case queue truth and user-visible progress remain one transaction.
- Replays converge without duplicate messages or checkpoints.
- No progress text can imply a final decision, money outcome or live action.
- Later Business/Global support tooling can consume the versioned record while
  retaining the same review and atomicity boundaries.

## Rejected alternatives

- Generic template draft/publication: rejected because it cannot atomically
  bind the new authoritative case checkpoint.
- Client-selected `T-008` or `T-010`: rejected because lateness is server truth.
- Publishing first and updating the case afterward: rejected because partial
  failure would create contradictory user and queue state.
- Automatic external notification: rejected because no live channel, operator
  or data-policy gate is approved in this package.
