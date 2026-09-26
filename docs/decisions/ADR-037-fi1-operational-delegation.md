# ADR-037: FI1 role-based operational delegation

Status: accepted for the disabled technical runway on 21.08.2026.

## Context

FI0 created neutral functional roles, append-only audit bindings and manual
founder-hour/escalation aggregates, but deliberately left every real assignee,
delegate, company account permission and absence test open. G3-G5 added disabled
booking-group, planner, supply and set workflows. Those flows need an explicit
operational owner/delegate model without turning a named founder into the
default support or authorization path.

The V2.4 FI1 package also requires the admin cockpit to keep normal operations,
founder hours and founder escalations separate. Missing manual evidence must
remain unavailable rather than becoming zero.

## Decision

Create one machine-validated FI1 contract with exactly four processes:

| Process | Owner role | Delegate role | Primary evidence |
| --- | --- | --- | --- |
| Booking groups and sets | `operations_general_manager` | `trust_safety_support` | immutable group events and critical audit actions |
| Deterministic planner and project cart | `operations_general_manager` | `technical_owner_on_call` | minimized funnel plus authoritative cart rows |
| Evidence and `needsReview` | `trust_safety_support` | `operations_general_manager` | item cases, immutable bindings and evidence-access audit |
| Normal support escalation | `trust_safety_support` | `operations_general_manager` | moderation records and append-only audit |

Each process has a separate executable runbook, two bounded escalation
thresholds, an explicit safe fallback and an absence-test gate. The role names
are routing contracts only. Real people, accounts and permissions remain
unassigned, so every process reports `hold`.

Normal operational thresholds route to FI0 functional roles. They never route
automatically to a founder. Founder gates remain limited to strategy,
existential risk or a separate owner-authorization decision; missing routing is
an operations defect, not a founder escalation.

The cockpit exposes a fail-closed operational-delegation summary and an
explicit reporting map:

- normal operations: `projectFunnel`;
- founder hours: `founderIndependence.hoursByCategory`;
- founder escalations: `founderIndependence.escalations`;
- blending: `false`.

The endpoint remains admin-only, staff-step-up-protected, read-only,
aggregate-only and `private, no-store`.

## Rejected alternatives

1. Assign a named person or personal account now. There is no authoritative
   company-system assignment evidence, and doing so would contradict FI0.
2. Add new application roles immediately. FI1 defines operational routing, not
   production RBAC; real permissions are an external gated change.
3. Blend founder time into ordinary funnel counts. This would obscure both
   operational load and founder dependence and could turn missing evidence into
   a misleading zero.
4. Add automatic activity monitoring. The FI0 privacy boundary permits only
   manual monthly aggregates and forbids invasive tracking.

## Consequences

- The newly built flows have explicit role ownership, delegation, audit sources,
  escalation thresholds, fallbacks and testable runbooks.
- Technical readiness can be tested without claiming staffing or account
  readiness.
- The cockpit clearly exposes the remaining external assignment and absence
  gates and cannot present them as complete.
- No migration, payment/provider traffic, account permission, production flag,
  public navigation, personal activity tracking or sensitive data collection is
  added.

## Rollback

Revert the FI1 implementation commit. The rollback removes the static cockpit
summary, FI1 manifest, validator and runbooks only. FI0, U0, all historical
audit/evidence records and the disabled G3-G5 features remain unchanged.
