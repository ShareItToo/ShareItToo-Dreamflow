# ADR-030: G3D Shared Handover with Item-Specific V5.2 Evidence

Status: accepted for disabled technical implementation on 2026-08-20.

## Context

G3A Variant A permits one operational handover and return for compatible
same-owner items, but contract, evidence, damage and payment truth must remain
item-specific. G3C intentionally stops before creating bookings or contracts.
The G3D overlay therefore must not pretend that an accepted group quote is a
V5.2 item contract or replace the existing V5.2 evidence workflow.

## Decision

- A group position can be bound only to an already existing item booking whose
  immutable V5.2 platform contract, two declarations and exact underlying
  single-item quote match the final accepted group quote position.
- Because the original G3B position row is append-only and may have been
  created before an item booking exists, migration 030 adds the append-only
  `booking_group_position_booking_bindings` bridge instead of updating the
  historical position.
- One idempotent command creates exactly two append-only group appointments:
  pickup at the group's `starts_at` and return at `ends_at`. Both retain only
  the compatibility location hash internally; neither that hash nor an exact
  address is exposed by the group overlay response.
- Photos remain in the V5.2 booking thread. Every item independently requires
  the four `overview`, `detail`, `accessories` and `critical` presenter slots,
  its counterparty confirmation and its evidence identifiers.
- Chat threads, confirmation challenges, return timers, cases, contested
  amounts and `needsReview` remain keyed by item `booking_id`. G3D does not
  create a group chat, group timer, group damage case or group `needsReview`.
- A disputed item reports `needs_review` only for that position. The group is
  held only when an explicit active account-scope suspension exists for the
  owner or renter; item review state is not a system-risk rule.
- The materializer binding is an internal workflow seam and has no HTTP route.
  Shared appointment write/read routes stay behind the existing disabled
  `BOOKING_GROUPS_ENABLED` gate, which production cannot enable.
- Group records, item bindings, appointments and command/state evidence are
  included in account export and the read-only retention inventory.

## Consequences

Operational coordination can be shared without changing V5.2 legal evidence
or coupling independent item disputes. A later materializer must first create
valid item bookings and V5.2 contracts, then call the internal binding seam.
G3D itself cannot create a booking, contract, payment, refund, damage charge or
exact-address disclosure. Multi-item activation still requires G3L and a
professional legal release gate.

## Rollback

Migration 030 removes only empty G3D binding, appointment and command tables.
It refuses rollback after any G3D evidence exists. Migrations 028/029 and every
historical V5.2 booking, quote, contract, message and evidence row remain
unchanged.
