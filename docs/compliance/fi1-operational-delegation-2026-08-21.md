# FI1 - Operational Delegation Layer

Stand: 21.08.2026

Branch: `codex/master-workflow-20260808`

Status: implementation in validation. This package does not claim real role,
delegate, account-permission or absence-test readiness.

## Source and scope

The exact FI1 source is `02_CODEX_WORK_PACKAGES_SIT_V2.4.md`:

- owner roles, delegates and runbooks for booking groups, project planner,
  evidence and support;
- audit and escalation thresholds;
- no named-person dependency;
- separate cockpit reporting for normal operations, founder escalations and
  founder hours.

FI1 extends the existing FI0/U0 foundation. It does not reopen production,
payment, Store, provider, public-release, legal-approval or account-RBAC gates.

## Machine-readable operational contract

`docs/operations/fi1-operational-delegation.json` binds four processes to the
existing FI0 functional-role registry:

1. booking groups, shared appointments and listing sets;
2. deterministic planner, inventory resolution and project cart;
3. item evidence, damage and `needsReview`;
4. normal support and specialist escalation.

Each process has a distinct owner and delegate role, at least two authoritative
audit sources, exactly two bounded thresholds, a runbook, `readiness=hold`,
`assignmentEvidenceAvailable=false` and `absenceTestPassed=false`.

No named person, user ID, email, device or local computer is an authorization
rule. Every external role assignment, delegate assignment, company-account
permission and absence test remains open.

## Runbooks and escalation

The four runbooks cover normal handling, authoritative evidence, thresholds,
fallback/recovery and an absence-test gate. They preserve these boundaries:

- ordinary quote drift, no inventory, expired consent and declined requests are
  normal fail-closed outcomes, not founder escalations;
- repeated invariant/determinism failures route to the technical role;
- evidence, account-risk and safety boundaries route to trust-and-safety and the
  relevant specialist role;
- finance, privacy and legal gates route to `finance_compliance`;
- missing normal routing routes to the operations role, never automatically to
  a founder;
- strategy, existential risk and explicit owner authorization remain separate
  non-operational gates.

Runbooks never authorize silent price changes, group-wide damage holds, manual
evidence rewriting, real payments, provider calls or public activation.

## Audit and privacy

FI1 reuses existing sources rather than creating a shadow case system:

- append-only `booking_group_state_events` and `audit_log` actions;
- authoritative project-cart rows plus the existing data-minimized planner
  funnel;
- item-level `booking_cases` and immutable group-to-booking bindings;
- moderation request/event records and audited staff evidence access.

Audit/runbook metadata excludes secrets, exact addresses, evidence media,
credentials and unrelated message content. The package adds no personal
activity tracking, automatic founder monitoring, user-identifying telemetry or
external analytics.

## Cockpit separation

`backend/src/operational_delegation.js` returns a fail-closed, role-only summary
for the existing admin cockpit. It states that all four processes are on hold,
assignment evidence is absent and absence tests have not passed.

The summary explicitly maps normal operations to `projectFunnel`, founder hours
to `founderIndependence.hoursByCategory` and founder escalations to
`founderIndependence.escalations`, with `blended=false`. Existing missing or
invalid monthly aggregates remain `unavailable`; FI1 does not introduce a
silent zero or alter profitability arithmetic.

The HTTP endpoint remains GET-only, admin-only, staff-step-up-protected,
read-only, aggregate-only and `private, no-store`.

## Validation contract

- `tool/validate_operational_delegation.mjs` checks the exact process, role,
  runbook, audit, threshold, external-gate, runtime and cockpit bindings.
- Negative tests reject claimed assignments/absence readiness, owner/delegate
  collapse, founder routing for normal thresholds, blended reporting and a
  named-person runbook dependency.
- Backend tests verify immutable response copies, all four hold processes and
  the explicit reporting separation.
- PostgreSQL integration checks the cockpit response without adding a migration
  or write path.
- The complete backend and technical regression remain required at the exact
  FI1 package head before closeout.

## Data lifecycle, migration and rollback

FI1 adds no database table, user data category, provider, cookie, SDK, payment
flow, retention period or deletion path. Existing privacy and retention
inventories remain semantically unchanged.

Normal rollback is a source revert of the exact FI1 implementation commit. It
removes only the static operational summary, manifest, validator, runbooks and
tests. FI0/U0, historical audit/evidence and disabled G3-G5 state stay intact.

## Remaining hard gates

- real functional-role and delegate assignments in an approved company system;
- company-owned account RBAC and any required four-eyes permission model;
- sanitized absence/delegate tests for all four FI1 processes;
- founder-replacement compensation decision for normalized economics;
- all existing legal, payment, provider, device, Store and public/live gates.
