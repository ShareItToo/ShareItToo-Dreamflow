# FI1 Project Planner Operations Runbook

Status: technical runbook complete; execution readiness remains `hold` until
both role assignments and an absence test have external evidence.

## Owner and delegate

- Owner role: `operations_general_manager`.
- Delegate role: `technical_owner_on_call`.
- Safety/content escalation role: `trust_safety_support`.
- No user ID, email address, device or named person is an authorization rule.

## Normal operations

1. Keep the deterministic core and inventory integration behind their disabled
   controls; production external generative AI remains prohibited.
2. Treat no candidate, unavailable inventory, quote drift and candidate-snapshot
   drift as normal fail-closed results. Never invent inventory or price.
3. Re-resolve the exact answer-bound item type and authoritative server quote
   before project-cart synchronization.
4. Preserve manual cart lines and replace only deterministic planner-owned
   lines for the named project.
5. The cart remains non-reserving and cannot create a request, contract,
   booking, hold, payment or provider call.

## Audit evidence

- Use the data-minimized internal planner funnel only for bounded stage counts.
- Use authoritative `rental_cart_projects` and `rental_cart_items` rows for cart
  state; do not place answers, dates, locations, listing IDs or prices in the
  funnel event.
- Preserve the exact candidate-set hash used for a synchronized plan.

## Escalation thresholds

- Three failures of the same determinism, candidate-hash or synchronization
  class within 15 minutes route to `technical_owner_on_call`.
- One unresolved allowed-category or safety-rule conflict routes to
  `trust_safety_support`; the affected template stays disabled.
- No-result and ordinary availability changes do not escalate.
- Normal operations never route automatically to a founder.

## Fallback and recovery

- Disable the technical planner path and retain manual search plus the existing
  cart and single-item flow.
- Do not mutate manual cart content or substitute a different listing silently.
- Re-run deterministic template, inventory and project-cart regression before
  reopening the technical path.

## Absence test gate

The delegate must execute one synthetic template through current inventory,
exercise one candidate-drift failure and verify that manual cart lines survive,
without oral founder assistance. Until evidence exists, readiness is `hold`.
