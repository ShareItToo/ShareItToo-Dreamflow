# FI1 Support and Escalation Operations Runbook

Status: technical runbook complete; execution readiness remains `hold` until
both role assignments and an absence test have external evidence.

## Owner and delegate

- Owner role: `trust_safety_support`.
- Delegate role: `operations_general_manager`.
- Specialist roles: `technical_owner_on_call` and `finance_compliance`.
- No user ID, email address, device or named person is an authorization rule.

## Normal operations

1. Route ordinary booking, planner, set, evidence and account questions to the
   owner role or approved delegate using the company system of record.
2. Preserve the established authorization, staff-step-up, case, moderation,
   payment and legal gates. Support cannot override immutable evidence.
3. Route security and runtime failures to `technical_owner_on_call`; route
   finance, privacy and legal gates to `finance_compliance`.
4. A founder gate is limited to strategy, existential risk or an explicit owner
   authorization decision. It is not the fallback for missing routing.

## Audit evidence

- Use existing moderation request/event records and append-only `audit_log`
  actions for critical staff decisions.
- Store only the minimum case reference, actor role, action, outcome and
  sanitized reason code. Do not copy credentials, private evidence, exact
  location or unrelated message content.
- Monthly founder-hour and founder-escalation aggregates remain manual,
  aggregate-only and separate from normal operational metrics.

## Escalation thresholds

- One security, privacy, legal, finance or physical-safety boundary routes to
  its specialist role before any case-affecting action.
- One normal case with no documented owner or delegate route goes to
  `operations_general_manager`; it does not go to a founder by default.
- A public/live, real-payment, provider or Store request stops at the existing
  approval gate.

## Fallback and recovery

- Keep the affected action pending or in its existing safe state and provide no
  unverified promise, payment outcome or legal conclusion.
- Preserve the existing user-facing single-item path when a disabled new flow
  cannot be supported.
- Reopen only after the receiving role records the bounded decision and audit
  reference in the company system of record.

## Absence test gate

The delegate must route one synthetic normal case and one specialist-boundary
case using only documented systems and runbooks, without oral founder
assistance. Until sanitized evidence exists, readiness is `hold`.
