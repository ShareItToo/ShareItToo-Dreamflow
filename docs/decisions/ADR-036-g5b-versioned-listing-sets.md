# ADR-036: Versioned same-owner listing sets

- Status: accepted for disabled technical implementation
- Date: 2026-08-21
- Package: G5B
- Technical version: `G5B-2026-08-21.1`

## Context

V2.4 requires optional SIT Sets and 1-Stop Sets made from existing listings of
one owner. Individual listings must remain independently bookable. A set may be
shown for a selected period only when every required member is eligible and
available, while price, evidence, damage, `needsReview` and refunds must remain
item-specific. Fewer handovers is an approved ranking signal; Business status
and hidden price manipulation are not.

## Decision

Store a stable `listing_sets` owner aggregate with immutable, sequential
`listing_set_versions` and normalized membership snapshots in
`listing_set_version_members`. Each version has two to twelve members and at
least two required members. The database and workflow both validate same-owner,
Germany, currency, category and handover facts. Concurrent revisions serialize
on the stable set row and require the caller's exact expected revision.

`one_stop_set` means all active-version members share the exact internal
handover-location hash. The hash is never returned in renter-facing output.
Paused or ended versions remain possible when an underlying listing has drifted,
so an owner can safely retire an obsolete set.

Resolution uses the existing non-persisted server booking-quote preview for
each member. Required-member failure hides the whole set; unavailable optional
members are omitted. Totals are exact sums of item allocations and no set
discount is introduced. A resolution contains explicit per-item references to
the established V5.2/G3 price, evidence, damage, `needsReview`, refund and audit
boundaries.

Discovery starts from a current source listing, omits every non-current set and
sorts only by handover count and a deterministic identifier tie-break. It does
not query or use Business status, and price is not a ranking input.

## Consequences

- Creating or revising a set never updates an underlying listing.
- No reservation, booking, quote persistence, contract, payment or refund is
  created by set management, discovery or resolution.
- Individual listing checkout remains available and unchanged.
- Account export includes set aggregates, versions and members. Confirmed
  account erasure deletes this user-intent dataset before anonymizing listings.
- Retention exposes count-only set datasets under `userIntent`; legal periods
  and destructive category purging remain open and disabled.
- Migration `031` is additive. Empty rollback is supported; rollback refuses
  after set intent exists.
- Backend and Flutter gates default off, reject production/release activation,
  and expose no external-provider or external-analytics path.

## Rejected alternatives

Embedding mutable arrays in listing payloads was rejected because it cannot
provide normalized same-owner constraints, deterministic concurrency or
immutable revision evidence. Creating a synthetic bundle listing was rejected
because it would compromise individual bookability and risk duplicate price,
availability, contract and damage truth. Applying a set-level discount was
rejected because V2.4 authorizes neither a new price rule nor hidden ranking
manipulation.

## Release gate

This ADR authorizes only disabled technical implementation. It does not approve
public/live activation, a set contract, real payment, Store submission, provider
traffic or a production migration rollout.
