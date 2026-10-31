# ADR-041: P0B Operations Role, Delegate and Absence Gate

Status: accepted as a technical and evidence-intake gate on 2026-08-21; human
staffing/RBAC/absence readiness remains open.

## Context

FI0 and FI1 define six functional roles, four critical processes, runbooks,
audit sources and role-level delegate routes. P0B found zero actual assignees,
zero delegates and zero passed absence tests. The authorized next token asks
for those facts and tests, but repository/Drive evidence contains only the
target organization and test requirements, not real staffing or IAM grants.

Conflating a role-level design test with a real 72-hour human absence test would
invent evidence and create an unsafe launch signal.

## Decision

- Keep identities and permission grants in an approved company system, never
  as names/emails/credentials in Git.
- Accept a role assignment only with opaque primary/delegate references,
  distinct principals, RBAC evidence, MFA evidence and owner approval.
- Require all six roles and all four FI1 process tests; partial evidence stays
  on hold.
- Separate synthetic technical rehearsal from a real minimum 72-hour human
  absence test in data, code, tests and cockpit reporting.
- Bind the current Founder Independence and Support Packet Drive sources,
  including their operational blocker probes.
- Fail closed when any owner, delegate, audit reference, time window or
  non-live boundary is missing.

## Consequences

All four deterministic role/fallback configurations are testable and green,
while the real organizational result remains honestly red: no assigned people,
no company RBAC evidence and no human absence test. This gate does not activate
or authorize a pilot.

Rollback removes the evaluator, manifest, runbook, tests and cockpit fields.
No database, account or external service is changed.
