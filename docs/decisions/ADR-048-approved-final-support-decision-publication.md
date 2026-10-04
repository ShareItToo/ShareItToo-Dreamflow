# ADR-048: Approved final support-decision publication

Status: accepted as a non-live technical control on 2026-08-21. It does not
authorize live support, an outbound message, a refund, payout, account measure,
provider action or pilot activation.

## Context

ADR-046 binds a support proposal to an immutable hash, independent approval and
separate implementation evidence. It intentionally did not communicate the
result to the affected user. The Drive Support Packet now requires scenario
`SUP-145`: a final case detail must make the decision, concrete effect, reason,
implementation and review route clear. Its relevant final-decision templates
are RED and must never be sent automatically.

Internal decision codes, measure types, implementation references, hashes and
staff identifiers are not suitable for the user surface. A resolved state also
must not imply that a draft, an unimplemented result or an unapproved wording
was communicated.

## Decision

- `userFacingDecision`, `userFacingEffect` and
  `userFacingImplementationResult` become mandatory inputs for every new
  non-green decision proposal. Together with `userFacingReason` and
  `redressRoute`, they are part of the canonical payload hash and therefore the
  existing four-eyes approval.
- Migration `035` stores those three fields, the communicating administrator
  and the exact communicated payload hash. Legacy rows remain readable but
  cannot be silently completed or communicated; missing wording fails closed.
- Communication is a separate administrator-only, stepped-up, idempotent
  action. It is permitted only after exact-hash approval and verified
  implementation success, while the case is `decided` or
  `implementation_pending` and its operating mode is `simulation` or
  `internal_testing`.
- The communication action records database, event and audit truth only. Its
  structured evidence explicitly records `externalMessageSent=false`; no
  notification, email, payment, account or provider adapter is called.
- A decision-backed case cannot enter `resolved` until PostgreSQL and the
  application both verify approval, implementation and communication against
  the same payload hash.
- The authenticated final detail projects only the five approved user-facing
  statements and server-rendered implementation time. Internal codes,
  references, hashes, evidence and staff identities are excluded.
- Flutter requires a complete final-decision object whenever the server marks
  one available. Missing, contradictory, malformed or time-inconsistent data
  fails closed instead of rendering a partial decision.
- Communicated user fields are included in the personal-data export. Privacy
  and retention manifests remain draft and bind the exact changed sources.

## Consequences

`SUP-145` has an end-to-end technical implementation path for internal
simulation: immutable proposal, four-eyes approval, verified implementation,
explicit publication, guarded resolution and user-safe display. The system
cannot manufacture generic decision wording or expose an internal reference as
the outcome.

This package does not implement appeal submission or adjudication, reopen
execution, message-template rendering, push/email delivery, live operator
staffing or any real-world measure. Those remain separate packages and gates.
Rollback uses migration `035` down only while no publication data exists;
otherwise it refuses to discard decision evidence.
