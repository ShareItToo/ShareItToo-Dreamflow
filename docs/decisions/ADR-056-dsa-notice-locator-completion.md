# ADR-056: Retain incomplete DSA notices and complete the locator append-only

Status: accepted as a non-live technical control on 22.08.2026. It does not
constitute a legal determination, legal approval, content measure, public
notice-channel activation or authorization for production, external delivery,
payment, Store submission or live support.

## Context

Drive scenarios `SUP-113` and `SUP-114` require an exact locator to connect a
DSA notice to the reported content, but also require an insufficient locator
to receive a targeted follow-up instead of being silently discarded. The Trust
& Safety source requires electronic receipt before the completeness and locator
review. The existing S3N route rejected a missing locator before creating the
canonical Notice ID, so it could not preserve that distinction.

## Decision

- A sufficiently reasoned, good-faith DSA notice receives its opaque Notice ID
  and immutable original evidence even when the locator is missing or only
  descriptive.
- The server deterministically classifies the locator as `complete` or
  `needs_clarification`. This is a completeness signal only and never a finding
  of illegality or an instruction to restrict content.
- `needs_clarification` keeps the case in `received`, records
  `waiting_on=reporter` and exposes a targeted reporter-only prompt. It does not
  invent a statutory response deadline or change the case to the generic
  `waiting_for_user` lifecycle.
- The authenticated reporter may append one exact, content-type-bound locator
  with the expected case version. The original notice evidence is never
  overwritten.
- PostgreSQL stores the completion as an append-only amendment and permits the
  derived status transition only when the exact amendment exists. Idempotent
  replay and optimistic concurrency prevent duplicate or stale changes.
- User projections, events and audit metadata carry only locator status and
  locator kind. The raw locator and full amendment are available only through
  the reporter's privacy export.

## Consequences

Legitimate but initially incomplete notices retain their receipt and Notice ID,
while the review queue receives an explicit completeness state. The route
cannot remove content, notify an affected party, issue a Statement of Reasons,
decide an appeal or call an external provider.

Migration `043` conservatively marks legacy S3N notices as
`needs_clarification`. Its rollback refuses to erase incomplete or amendment
evidence after use. Public or guest accessibility, final legal wording,
operator staffing, statutory timing and every live moderation action remain
separate legal and operational gates.
