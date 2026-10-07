# ADR-067: Explicit non-urgent feedback as P4

Status: accepted for non-live technical implementation on 22.08.2026.

## Context

Drive scenario `SUP-030` and the Support Master/Playbook classify ordinary
feedback, improvement suggestions and non-urgent explanations as P4. The
existing intake had no distinct P4 domain value or durable product-area context,
so a generic route could overstate urgency or accidentally inherit booking or
money references.

## Decision

SIT uses one canonical `general_help/feedback_or_improvement` route. The user
must explicitly choose a controlled feedback kind/product area and confirm that
the request is non-urgent. Client, service and PostgreSQL enforce an exact
versioned four-field context and the route's fixed P4/low-risk configuration.

Urgent/risk signals reject the feedback route. Transaction and object links are
also prohibited so feedback cannot masquerade as a booking, listing or money
case. The creation receipt remains neutral: it confirms capture and routing but
does not promise escalation, resolution or a product decision.

The context is immutable, auditable and included in the reporter's privacy
export. Existing support Retention scope applies without inventing a period;
rollback refuses retained feedback evidence. No external product-system or
action adapter is part of this decision.

## Consequences

- Non-urgent feedback is consistently sortable behind P0-P3 work.
- Product-area context is structured without adding free-text audit metadata.
- Genuine risk cannot be suppressed by selecting the feedback category.
- Transaction, payment and operational decisions remain in their dedicated
  case types.
- A later Business/Global product-feedback pipeline can consume an explicit
  versioned contract without changing the present non-live safety boundary.
- Response commitments, product prioritization and live integrations remain
  future operational decisions.

## Rejected alternatives

- Reusing P3 general help: rejected because it would contradict the explicit
  source priority and create artificial escalation.
- Deriving urgency from wording alone: rejected because explicit risk signals
  must use authoritative dedicated routes.
- Attaching booking/payment references for convenience: rejected because that
  blurs support and transaction truth.
- Sending feedback directly to an external roadmap tool: rejected because no
  approved live connector, data policy or operator gate exists in this package.
