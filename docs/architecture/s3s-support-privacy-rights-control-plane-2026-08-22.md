# S3S privacy-rights control plane - architecture

Status: locally verified non-live candidate on 22.08.2026. Exact implementation
commit and GitHub Actions evidence remain to be recorded after the guarded push.
No disclosure, erasure, external delivery, production or public operation is
enabled.

## Source basis

- Drive Support Packet `13_SIT_SUPPORT_TEST_MATRIX_V1.md`, technical core of
  scenarios `SUP-123` through `SUP-127`.
- Drive `09_SIT_SUPPORT_SOURCE_OF_TRUTH_V1.md` and the current Support Packet:
  secure identity handling, deadlines from receipt, no silent deadline shift,
  data minimization, scoped Legal Hold and auditable human review.
- Articles 12 and 15 through 21 of Regulation (EU) 2016/679 as primary legal
  source for field and gate design, not as an implementation-side legal
  conclusion: https://eur-lex.europa.eu/eli/reg/2016/679/oj/
- Regulation (EEC, Euratom) No 1182/71 as the primary source reviewed for
  calendar-period computation: https://eur-lex.europa.eu/eli/reg/1971/1182/oj/eng

## Exact request semantics

The Flutter intake no longer combines two rights into one ambiguous choice.
It sends one versioned request kind: `access`, `portability`, `rectification`,
`erasure`, `objection` or `restriction`. The backend rejects a missing,
unknown, extra or subtype-incompatible value before the case is persisted.

The existing canonical support case remains the routing and user receipt.
Migration `047` adds a one-to-one privacy-rights record rather than hiding the
right in free text. PostgreSQL independently checks the exact Privacy subtype,
reporter/subject identity, red decision boundary, non-live operating mode and
deadline proximity.

## Deadline model

The initial response deadline is computed from receipt, not from later
identity verification. The policy uses the matching Europe/Berlin calendar
date one month later, or the last day of a shorter target month, and ends that
day at 23:59:59.999 local time. This deliberately does not add a weekend or
holiday extension, so the technical alarm cannot become later through an
unverified external calendar.

An internal reminder becomes due 72 hours before the current response
deadline. The existing watchdog writes an idempotent internal event for the
exact near or overdue condition and exposes count-based degraded health. It
sends no email, push, webhook or other external notification.

One Administrator may record one reasoned extension before the first deadline,
behind the exact active session and Staff Step-up. The extended deadline is
three calendar months from receipt, representing the initial month plus at
most two additional months. The reason and old/new dates are user-visible;
the event explicitly records that no external notification was sent.

## Identity and authorization boundary

Identity confirmation requires the authenticated subject to re-enter the
current account password. Password comparison happens at the HTTP boundary;
neither the domain workflow, event, audit nor privacy-rights table receives
the password. The append-only verification record binds the subject, active
session, request and idempotency key. PostgreSQL rechecks the active user and
session before accepting the record.

Successful identity verification moves the request only from
`identity_pending` to `under_review`. It does not disclose data, start an
export delivery, execute erasure or shift any deadline. User responses and
the Administrator queue carry explicit false values for all three abilities.

## Data, Legal Hold and audit boundary

The Administrator queue is private, no-store, Step-up protected and bounded.
It exposes the active Legal Hold count for human scope review but does not
treat a hold as permission to retain every dataset. This package does not
implement deletion, so it cannot bypass or over-apply a hold.

Privacy export includes the subject's request, minimum verification method and
user-facing extension record. It omits session identifiers and staff
identifiers. The retention inventory counts the three datasets separately as
`privacyRights`; its new `privacyRightsPeriod` decision remains open, with no
invented duration, cutoff, eligible-row calculation or purge route.

Migration `047` makes identity and extension evidence append-only, restricts
request changes to guarded monotonic transitions and refuses rollback after
any privacy-rights truth exists.

## Residual scope

This package supplies the technical core of `SUP-123` through `SUP-127`; it
does not claim complete legal or operational fulfillment. In particular, the
actual access package, rectification, restriction, objection, portability and
erasure execution paths remain closed. Dataset-level Legal Hold resolution,
approved retention periods, response composition, secure delivery, reviewer
staffing and professional legal confirmation remain separate gates.

Drive scenarios `SUP-128` through `SUP-131` remain the next independent
privacy-safety package: wrong-recipient containment, breach-awareness time,
72-hour authority deadline control, cross-account export prevention and exact
address minimization. No production, VPS, Cloud, DNS, payment, payout, Store,
signed-candidate or public-pilot change is part of S3S.

## Local verification

- Focused domain, workflow, migration and wiring: 56 of 56 passed.
- Deadline-watchdog unit coverage: 5 of 5 passed.
- Privacy/Retention validators and their protection tests: 63 of 63 passed.
- Focused Flutter support intake: 15 of 15 passed on pinned Flutter 3.41.7.
- Backend unit run: 470 passed, zero failed and one database-only skip; the
  skipped path then passed separately against an isolated PostgreSQL 16.15
  instance with every migration through `047`.
- A CI-equivalent Backend run then passed all 471 tests without skips against
  isolated PostgreSQL 16.15.
- Backend source and shell syntax checks passed. The complete technical
  regression passed all 359 Flutter tests with one documented skip, the
  separate Google-only test, Web smoke/build and Android debug build.
- GitHub regression `32551835411` is green for head
  `60b8017c00a63d18dd3d6887cfab3baee1f0fafb`; Actions tested PR merge
  snapshot `57e987471a770e222b91d47ea8e1e141bf3ceb23`. It passed all 471 Backend
  tests, audit/secret checks, Compose validation, the commit-labelled API
  image, all 359 Flutter tests with one documented skip, the separate
  Google-only test, Web smoke/build and Android debug build. Signed-candidate
  construction and API-image publication remained skipped.
