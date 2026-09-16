# ADR-045: Canonical non-live support case foundation

Status: accepted as a non-live technical foundation on 2026-08-21. No support
automation, external message, irreversible measure, payment action or public
activation is authorized by this decision.

## Context

The updated Drive Support Packet defines one independent problem per case, a
canonical taxonomy, exactly one current owner, `waitingOn`, `nextAction` and
`nextUpdateAt`, append-only events, separate user and internal views, and
explicit approval boundaries. Existing booking-return, damage and moderation
objects cover narrow product workflows but do not form a central support case
record.

The current P0B state is NO-GO for a live pilot. Professional legal approval,
real operator assignments, provider acceptance, retention periods and public
activation remain absent. The foundation therefore has to improve launch
readiness without pretending that an operating support organization exists.

## Decision

- Add one canonical `support_cases` aggregate with the exact thirteen case
  families and their allowed subtypes. Both application code and PostgreSQL
  reject unknown family/subtype combinations.
- Use the Support Packet lifecycle without a `paused` state. Every active case
  has a next action and future checkpoint; received P0, P1, P2 and P3 cases get
  conservative internal checkpoints of 15 minutes, 1 hour, 4 hours and 24
  hours. These checkpoints are internal safety defaults, not contractual
  response-time promises.
- Route money, privacy, authority, account-takeover and all P0 boundaries to
  `red_explicit_decision`; routine P3 help/listing-quality work is green and
  other cases are yellow. The server derives all routing and flags.
- Keep human-readable case numbers opaque and non-sequential. Require
  idempotency, optimistic versions, row locking and explicit transition
  reasons.
- Store policy snapshots and case events append-only. Keep decisions,
  evidence, messages and appeals normalized and linked to the case.
- Expose authenticated, no-store user create/list/detail routes. Expose the
  staff queue, full detail and status transition only behind active-account
  Staff Step-up. No route in this package sends a message or executes a
  measure.
- Keep the route operating mode fixed to `simulation`. Production/live modes
  are invalid at both domain and database boundaries.
- Include communicated/user-visible case data in account export while
  excluding draft outbound messages, uncommunicated decisions, staff
  transition reasons, restricted evidence, internal notes and internal event
  payloads. Inventory case
  communications, decisions/evidence and audit truth under the current open
  retention decision categories.
- Block confirmed account erasure when any support case record is attached to
  the account. This fail-closed block remains until an approved support-case
  retention and erasure rule exists; no period is invented.

## Consequences

The backend now has a coherent support intake and review foundation that can be
tested and extended without live traffic. A user cannot read another user's
case, and a client cannot choose priority, owner, approval level, production
mode or a status transition. Internal content is not returned by the user API
or general account export.

The package does not yet authorize or implement automatic acknowledgement,
external email/push/Telegram delivery, evidence upload, final decision entry,
appeal processing, payment/refund execution, account measures or operator
staffing. Those are separate packages with their own approval and external
fact requirements.

Migration `032` is additive. Its down migration succeeds only while every
support table is empty; after any case, policy or audit truth exists, rollback
fails closed. Normal source rollback before use is a revert plus restoration of
the exact Privacy/Retention source-hash inventories.
