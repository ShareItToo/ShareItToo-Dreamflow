# ADR-028: G3B BookingGroup Foundation

Status: accepted for disabled technical implementation on 2026-08-20.

## Context

Walid selected G3A Variant A. The current V5.2 model is single-item and its
quotes, contracts, evidence and ledger records are immutable booking-scoped
truth. G3B must add a multi-item foundation without rewriting that history or
activating a new legal/payment flow.

## Decision

- `booking_groups` is an immutable compatibility envelope for exactly one
  owner, renter, private-C2C market context, Germany, currency, period,
  location key, handover policy, legal set, cancellation policy and payment
  configuration.
- `booking_group_positions` is normalized and append-only. One row represents
  one listing in one group and may bind its immutable single-item quote plus a
  future existing `booking_id`.
- `booking_id` is the bridge to the existing item-specific evidence, damage,
  payment and ledger records. G3B does not duplicate or aggregate those records.
- Position insertion is guarded against owner, country, currency, period,
  quote, allocation and booking mismatches. Unique constraints make duplicate
  concurrent insertion fail closed.
- The group and position foundation has no route. `BOOKING_GROUPS_ENABLED`
  defaults to false in every checked deployment surface and is rejected in
  production until a later release gate changes that explicit rule.
- The rollback removes only new G3B objects and refuses to run after group data
  exists. No existing V5.2 table or row is mutated.

## Consequences

G3C can add append-only quote revisions and state events without making the
group row mutable. Counter-offers will create new revision evidence rather
than editing membership silently. Historical single-item contracts remain
unchanged. Legal wording, public activation, real money and provider actions
remain separate gates.
