# FI1 Booking Group Operations Runbook

Status: technical runbook complete; execution readiness remains `hold` until
both role assignments and an absence test have external evidence.

## Owner and delegate

- Owner role: `operations_general_manager`.
- Delegate role: `trust_safety_support`.
- Technical escalation role: `technical_owner_on_call`.
- No user ID, email address, device or named person is an authorization rule.

## Normal operations

1. Confirm the booking-group and listing-set controls remain disabled unless a
   separately approved technical test requires them.
2. Treat stale quotes, changed inventory, expired consent and incompatible
   group members as normal fail-closed outcomes. Do not override server truth.
3. Keep each listing independently bookable and each item booking, contract,
   price allocation, evidence record, damage case and refund reference intact.
4. Resolve only through idempotent commands and the current immutable quote.
5. Never create a manual group-wide hold from one item dispute. A whole-group
   hold requires the explicit account-scope system-risk rule.

## Audit evidence

- Use `booking_group_state_events` as the append-only group-state source.
- Use `audit_log` actions under `booking_group.*` and `listing_set.*` for
  critical mutations; never store exact addresses, secrets or evidence media.
- Bind request/idempotency reference, actor role, resource ID, outcome and the
  already-defined quote or version hash where applicable.

## Escalation thresholds

- Three failures of the same invariant or audit class within 15 minutes route
  to `technical_owner_on_call`; pause the affected technical path.
- One explicit account-scope suspension or authorization-boundary failure
  routes to `trust_safety_support` and, where technical, the on-call role.
- Normal quote drift, unavailability or a declined request does not escalate.
- Normal operations never route automatically to a founder.

## Fallback and recovery

- Leave the feature disabled and continue the established single-item flow.
- Do not rewrite append-only group, quote, event or V5.2 evidence records.
- Verify database constraints, exact source head and the focused workflow tests
  before reopening a technical test path.

## Absence test gate

The delegate must execute a synthetic same-owner flow, observe one fail-closed
quote-drift case and verify audit evidence without oral founder assistance.
Until sanitized evidence exists, this process remains `hold`.
