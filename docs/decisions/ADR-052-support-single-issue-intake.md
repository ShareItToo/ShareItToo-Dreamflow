# ADR-052: One independently reviewable issue per support case

Status: accepted as a non-live technical control on 22.08.2026. It does not
authorize live support operations, external delivery, automatic case
classification, a payment action, a Store release or production activation.

## Context

Drive scenario `SUP-026` requires two independent problems in one intake to be
separated or turned into linked separate cases. The canonical support flow
already had safety-first triage, category routing and immutable case/audit
truth, but it did not establish whether one intake contained exactly one
independently reviewable issue.

Automatic text classification would be unreliable, difficult to explain and
capable of inventing a split. Creating two cases automatically would also need
an exact issue boundary, user consent and linking semantics that the current
source package does not define.

## Decision

- Safety triage remains the first question and is never delayed by issue
  scoping.
- Before categories appear, the user must confirm that the current case covers
  exactly one problem.
- If multiple problems are selected, the flow shows separation guidance and
  keeps categories unavailable until the user chooses one problem for the
  current case. A later independent problem is submitted as a separate intake.
- The client submits versioned evidence containing only the exact confirmation
  and whether separation guidance was shown.
- The server rejects missing, stale, malformed or unconfirmed evidence. It does
  not infer the answer from free text.
- Migration `040` permits legacy rows to remain explicitly without evidence,
  requires valid evidence for every new row and rejects any later change to a
  recorded confirmation.
- The append-only creation event contains the exact versioned evidence. The
  general audit record contains only its version and the guidance flag; user
  case projections expose neither internal evidence object.

## Consequences

SIT can satisfy the deterministic technical part of `SUP-026` without AI,
provider traffic or invented case links. Ownership, deadlines, decisions and
appeals remain attached to one independently reviewable issue.

This control does not detect dishonest confirmation, extract issues from text,
create a linked second case automatically or merge duplicates. Those remain
separate product and operations concerns. Rollback is allowed only before any
post-migration intake evidence exists.
