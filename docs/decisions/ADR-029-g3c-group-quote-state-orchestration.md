# ADR-029: G3C Group Quote and State Orchestration

Status: accepted for disabled technical implementation on 2026-08-20.

## Context

G3A Variant A and ADR-028 keep every later booking, contract, payment,
handover, return and damage record item-specific. G3C needs a group-level
request and owner decision without silently turning a subset into a binding
booking or making client-provided prices authoritative.

## Decision

- A group request creates fresh server-authoritative V5.2 single-item quotes
  and one immutable group quote whose item allocations and totals are exact
  sums of those quotes.
- `booking_group_quotes` and `booking_group_quote_positions` are append-only.
  Quote revision 1 covers every group position. A counter-offer is a new
  revision linked to its predecessor and may retain a changed subset.
- `booking_group_state_events` is the append-only state source. It permits only
  request, accept-all, decline-all, owner counter-offer and explicit renter
  acceptance of that exact counter-offer.
- Accept-all and decline-all bind the exact current quote. A counter-offer must
  change the item set, is requoted from server truth and never edits the prior
  quote. Renter consent must bind the exact new quote ID and hash.
- Commands use actor-bound request hashes and idempotency keys. A repeated
  command returns its stored response; key reuse with different input fails
  closed. Every successful transition also writes an audit event.
- G3C creates no booking, contract, reservation, payment, refund, handover,
  return or damage object. Those item-specific steps remain for later packages.
- All HTTP routes fail with `booking_groups_not_enabled` while
  `BOOKING_GROUPS_ENABLED=false`; production startup rejects enabling the
  feature. There is no client UI or public release in G3C.

## Consequences

The owner can answer one same-owner request coherently without creating a
silent partial contract. A reduced counter-offer remains only an explicit
proposal until the renter accepts its exact immutable revision. G3D can build
item-specific contracts from an accepted group state while preserving V5.2
truth and per-item failure handling. G3L must complete export, deletion and
retention treatment before any activation.

## Rollback

Migration 029 removes only G3C quote, command and event objects while they are
empty. It refuses rollback after evidence exists. Migration 028 and all
historical V5.2 tables remain unchanged.
