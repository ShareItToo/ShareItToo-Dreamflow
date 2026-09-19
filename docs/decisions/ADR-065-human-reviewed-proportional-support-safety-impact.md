# ADR-065: Human-reviewed proportionate support safety impact

Status: accepted for non-live technical implementation on 22.08.2026.

## Context

Drive scenarios `SUP-106` through `SUP-112` require prohibited/dangerous-item
and accident cases to account for the linked listing and affected bookings,
while preserving proportionality, genuine safety intake, blocked-user safety,
private logs and immutable audit. SIT has no authorization in this package for
real measures, authority contact, external delivery or production operation.

## Decision

SIT records a separate immutable impact review before it accepts a decision for
the two exact safety case types. An elevated Administrator reviews one bounded,
hash-bound snapshot of the linked listing and all current/historical bookings.
The snapshot excludes address, amount and participant identity fields.

A later decision must bind the newest review, current case version, exact
recommendation identifier and unchanged entity scope. It names every affected
action-relevant entity and explicit unaffected areas. Recommendations are
restricted to temporary safety review, moderation review or no measure.

The review and decision remain records only. Schema and application code force
human review, proportionality, no automated action, no executed action and no
external delivery. No listing, booking or account mutation, notification,
provider call or authority report is added.

Safety intake uses a separate bounded limiter so ordinary support abuse cannot
exhaust it. A user block continues to prevent direct messaging but never blocks
the canonical authenticated safety-support route. Operational errors are logged
only as bounded safe codes.

## Consequences

- A safety decision cannot silently omit an affected active booking or rely on
  a stale listing/booking snapshot.
- Review evidence is tamper-resistant and privacy-minimized, while Retention
  remains unresolved and fail-closed.
- Blocking remains effective for peer contact without suppressing safety
  reporting.
- Recording a recommendation provides no action authority; execution requires a
  future separately approved workflow and all applicable gates.
- Professional legal/safety judgment and authority duties are not inferred from
  technical checks.

## Rejected alternatives

- Automatic listing/account suspension from a support classification: rejected
  because it bypasses human proportionality and the current authorization.
- Reviewing only the reported booking: rejected because the same listing may
  affect additional current bookings.
- Copying all case content into logs or exports: rejected because it expands PII
  exposure without supporting the bounded decision.
- Letting ordinary support rate exhaustion block safety intake: rejected because
  a genuine urgent report must retain an authenticated route.
- Allowing blocked peers to message each other for safety: rejected because the
  canonical support route resolves reporting without defeating the block.
