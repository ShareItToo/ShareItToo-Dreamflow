# ADR-034: G4B Real Inventory Resolution and Project Cart

Status: accepted for inactive technical implementation on 2026-08-21.

## Context

G4A produces deterministic item types and explicitly leaves listing, owner,
availability, quote and price unresolved. G4B must resolve those facts without
inventing inventory, weakening the private-pilot boundaries, reserving an item
or introducing external generative AI. The existing booking quote workflow is
already the server authority for active/moderated listings, account and pilot
eligibility, user blocks and suspensions, availability revisions, dates and
deterministic EUR quote calculation. The existing project cart is
non-reserving and already covered by export, deletion and retention controls.

## Decision

- Reuse `quoteBooking(..., persist: false)` as the only final candidate truth.
  The planner performs no parallel price or availability calculation.
- Query only active, moderated, image-backed listings whose exact
  category/subcategory key is one of the reviewed G4A item targets. Every
  candidate is then independently rechecked through the booking workflow;
  expected ineligible or unavailable candidates are omitted.
- Support a bounded selected-item list and explicit preferred listing per item
  type. Item types must come from the current answer-bound G4A plan. Removing a
  required type marks the result incomplete and blocks cart sync.
- Return exactly three deterministic factual variants:
  - `1-Stop` exists only when one real owner supplies a unique current listing
    for every selected item type.
  - `Preis-effizient` ranks current EUR quote totals, then real published owner
    ratings and listing ID. No currency conversion is attempted.
  - `Top-bewertet` exists only when every selected item has a unique candidate
    with a published renter-to-owner rating. Unrated candidates never receive a
    synthetic rating.
- Do not expose an owner identifier. Owner identity is used only inside the
  resolver to prove the one-owner condition.
- Bind the complete candidate set to a deterministic inventory snapshot hash.
  Cart sync re-resolves that snapshot inside one transaction and rejects drift
  before mutation. Every chosen item is then re-quoted again by the existing
  cart writer; any listing or quote-hash change rolls the transaction back.
- Sync only deterministic planner-owned lines within the named existing
  project. Unrelated manual cart lines remain untouched. The cart still creates
  no request, booking, availability hold, reservation, contract or payment.
- Emit only internal data-minimized funnel events. They contain stage, version,
  template ID, counts, boolean eligibility and selected variant ID; actor,
  answers, dates, locations, listings, owners, quote hashes and prices are
  explicitly omitted.
- Add `PLANNER_INVENTORY_ENABLED`, default false. It requires the G4A core flag,
  is rejected in production and is checked on every technical route. Public
  release and external generative AI remain fixed false.

## Consequences

The variants are repeatable for the same server snapshot and become
unavailable when their advertised factual basis cannot be proved. A returned
quote is a non-persisted current preview, not a hold; the inventory snapshot and
cart must still be revalidated before a later rental request. Planner project
answers use the already-governed `rental_cart_projects.answers` dataset and are
covered by existing account export and confirmed deletion behavior. No schema
migration or new user-data table is introduced.

Rollback is a code/config revert plus restoration of the exact Privacy and
Retention source inventories and hashes. Existing G2 cart data remains valid;
no external or live state requires migration.
