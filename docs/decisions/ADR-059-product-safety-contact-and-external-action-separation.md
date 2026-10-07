# ADR-059: Separate product-safety intake from external corrective action

Status: accepted as a non-live technical control on 22.08.2026. It is not legal
advice, professional approval, a product-safety finding, production activation
or authority to contact any external recipient.

## Context

Drive scenario `SUP-137` requires an electronic product-safety contact, an
internal process and rapid triage. The current support foundation already has
emergency-first routing and guarded Trust & Safety cases, but did not distinguish
a structured product-safety notice from an emergency, general safety report or
possible Article 18 matter.

Article 22 of Regulation (EU) 2023/988 informs the technical contact/process
boundary. It does not allow the application to infer operator duties,
dangerousness, authority competence, Safety Gate obligations or corrective
action.

## Decision

- Introduce one exact authenticated product-safety route with a versioned
  structured notice, explicit safety acknowledgement and opaque receipt.
- Keep acute danger on the existing separate emergency-first path. A normal
  product-safety notice is `p1`; it does not become an Article 18 candidate.
- Persist immutable evidence and a database-constrained internal checkpoint no
  later than 60 minutes after receipt. This is an SIT target, not a statutory
  claim.
- Keep report narratives outside routine audit/event metadata while preserving
  the reporter's authenticated export and the existing open retention gate.
- Require separately approved public contact, authority registration, Safety
  Gate registration and internal-process facts before public/Store readiness.
- Do not implement authority/Safety Gate transport, external messages,
  automatic listing action, account action or production configuration.
- Treat optional injury reports as health information in privacy and prepared
  Store declarations, without saving or submitting them externally.

## Consequences

SIT can receive and preserve a structured non-live safety report without
confusing intake with a legal conclusion or external corrective action. A
future live package must provide professional legal approval, exact operator
facts, named owners, verified authority and Safety Gate registrations, secure
recipient channels, reviewed templates, listing/account action policy,
retention/Legal Hold decisions and explicit deployment/Store authorization.

Migration rollback is blocked once product-safety evidence exists. No
production, payment, Store, Cloud/VPS/DNS, external notification, public pilot
or signed release is part of this decision.
