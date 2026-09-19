# ADR-057: Bind significant moderation measures to one immutable Statement of Reasons

Status: accepted as a non-live technical control on 22.08.2026. It is not a
legal determination, professional legal approval, production activation or
authorization for external delivery, payment, Store submission, public pilot
operation or any live moderation measure.

## Context

Drive scenarios `SUP-115` through `SUP-119` require a concrete reason for
content and account restrictions, an accurate disclosure of automated means,
a free electronic review path and a review that is not resolved exclusively by
automation. The existing moderation decision stored facts, basis, reasoning
and detection method, but it did not bind scope, duration, decision origin or
the precise role of automation into one independently protected recipient
record. The authenticated app also had no user surface for that record.

Article 17 of Regulation (EU) 2022/2065 is the primary legal source used for
the technical field design. Article 20 is the source for the internal complaint
access and human-resolution boundary. Final wording and applicability remain
subject to independent professional review.

## Decision

- Every newly issued significant moderation measure must have exactly one
  versioned `moderation_statements_of_reasons` row in the same transaction.
  The protected measure set is account or scope suspension, listing
  restriction, private-marketplace restriction and measure reversal.
- The existing decision remains the source of concrete facts, rule or legal
  basis, reasoning and detection method. The one-to-one Statement adds ground,
  origin, territorial and functional scope, effective duration, automation
  role, human-review evidence and the authenticated in-app channel.
- A deferred database constraint prevents a significant decision from being
  committed without its Statement. The Statement is append-only, and its
  recorded human reviewer must be the issuing Administrator.
- Fully automated issuance of a significant measure is rejected. A hybrid
  decision must describe the automated means and classify them as a signal or
  decision support; a human-only decision must record `none`.
- Duration is bound to the actual action: an indefinite restriction is
  `until_reversed`, a dated suspension is `fixed`, and a reversal is
  `not_applicable`. The client cannot choose a contradictory duration.
- The affected authenticated user sees only confirmed fields. A legacy or
  malformed record produces no synthesized reason, but an otherwise eligible
  user may still use the existing free electronic review route.
- Historical decisions are not backfilled. Inventing facts, grounds, scope or
  automation evidence would be less accurate than an explicit missing-record
  state.

## Consequences

New significant measures cannot exist without an exact, user-bound and
immutable explanation, and the privacy export and retention inventory include
the new record. Existing review resolution remains a separate Administrator
action and cannot occur automatically, but this package does not yet implement
independent reviewer assignment, automatic correction of an erroneous measure
or external DSA transparency-database reporting.

The migration rollback refuses to delete a used Statement table. No statement
is emailed, pushed or sent to an external provider; no production or public
operation is activated.
