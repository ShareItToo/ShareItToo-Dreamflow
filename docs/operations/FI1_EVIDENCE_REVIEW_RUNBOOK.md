# FI1 Evidence and needsReview Operations Runbook

Status: technical runbook complete; execution readiness remains `hold` until
both role assignments and an absence test have external evidence.

## Owner and delegate

- Owner role: `trust_safety_support`.
- Delegate role: `operations_general_manager`.
- Evidence-access/security escalation role: `technical_owner_on_call`.
- No user ID, email address, device or named person is an authorization rule.

## Normal operations

1. Work from the item booking, contract, required evidence slots and immutable
   evidence identifiers. A group or set is only a navigation context.
2. Keep pickup, return, accessories, confirmations, timers, damage and
   `needsReview` independent for each item.
3. Do not infer physical damage, liability, a charge or a refund from media
   alone. Apply the established V5.2 review and actual-loss boundaries.
4. Access private evidence only through staff step-up and the audited no-store
   endpoint. Never copy evidence into tickets, runbooks or audit metadata.

## Audit evidence

- Use `booking_cases` for case state and item booking linkage.
- Use `booking_group_position_booking_bindings` only as the immutable bridge to
  item truth.
- Record staff evidence access as `moderation.evidence_viewed` without media,
  exact address, message content or credentials in metadata.

## Escalation thresholds

- One missing or mismatched required item-evidence reference blocks a
  case-affecting decision and routes to `trust_safety_support`.
- One authorization failure, suspected account compromise or physical-safety
  signal routes to `technical_owner_on_call` and the support owner role.
- One disputed item does not escalate or hold unrelated items automatically.
- Normal operations never route automatically to a founder.

## Fallback and recovery

- Keep the affected item in its existing `needsReview` or safe state; do not
  create a charge, payout or refund as a workaround.
- Preserve media and append-only evidence; correct only through an authorized
  workflow that adds new evidence or case events.
- Reverify staff step-up, no-store delivery and audit coverage before access is
  restored after an authorization incident.

## Absence test gate

The delegate must process a synthetic item-specific review, verify private
evidence access auditing and prove an unrelated group item remains independent,
without oral founder assistance. Until evidence exists, readiness is `hold`.
