# G4B Real Inventory Resolution and Project Cart - Technical Evidence

Date: 2026-08-21
Activation: disabled; authenticated technical routes only
External generative AI: disabled and unused

## Server-truth chain

1. G4A creates the answer-bound set of reviewed item types and exact allowed
   category/subcategory targets.
2. G4B selects only active, moderated, public-image-backed database listings
   for those exact targets. No text similarity can widen the category scope.
3. Every candidate is passed to the existing booking quote workflow with
   `persist: false`. That workflow remains authoritative for owner/renter
   eligibility, user blocks and suspensions, private-pilot facts, dates,
   current availability and deterministic price.
4. Only successful current EUR previews enter ranking. A candidate rejection
   is counted without exposing the listing or rejection details.
5. The ordered candidate IDs, real rating facts, quote hashes and availability
   revisions are bound into the inventory snapshot hash.

The response says explicitly that inventory, availability and quote preview
were checked at request time, while no quote was persisted and no booking or
reservation was created. Revalidation remains mandatory before a request.

## Variant truth

| Variant | Deterministic inputs | Fail-closed condition |
| --- | --- | --- |
| 1-Stop | Exact internal owner equality, current unique listings, current EUR totals, listing ID | Unavailable unless one owner covers every selected item type. |
| Preis-effizient | Current EUR total, real published owner rating, review count, listing ID | Unavailable unless every item type has a unique current EUR listing; no FX or savings claim. |
| Top-bewertet | Published renter-to-owner average, review count, current EUR total, listing ID | Unavailable if any item type lacks a unique genuinely rated candidate. |

The matching step never assigns one listing to two plan positions. Owner IDs
are stripped before response shaping. Listing titles, category, subcategory,
condition and city/country are real stored facts; no exact address is returned.

## Edit, cart and revalidation boundaries

- `selectedItemTypes` supports adding/restoring and removing only types from
  the current G4A plan. Missing required types are visible and make the result
  ineligible for cart sync.
- `preferredListings` supports editing a choice only to a current candidate for
  that item type. Duplicate physical listings fail closed.
- Cart sync requires the exact prior inventory snapshot hash, re-resolves the
  complete result inside the transaction and rejects any drift before writes.
- The existing project and cart upserts then quote every selected listing once
  more. Listing or quote-hash drift aborts the whole transaction.
- Only deterministic planner-owned lines of the named project are replaced or
  removed. Manual project/cart content is preserved.
- `reservationCreated=false` and `bookingCreated=false` are invariant. No
  booking/request/hold/contract/payment function is imported or called.

## Instrumentation and privacy

The two technical stages are `inventory_resolved` and
`project_added_to_cart`. Internal funnel events contain only planner version,
template ID, item/variant counts, cart eligibility and selected variant. They
omit actor, answers, dates, location, listing/owner IDs, quote hashes and
prices. The routes are disabled by default, so no event exists unless the
bounded technical flags are explicitly enabled outside production.

Planner project answer codes are persisted only when the user adds the result
to the existing project cart. This reuses the existing
`rental_cart_projects.answers` lifecycle; account export, confirmed account
deletion and the retention inventory already cover it. The Privacy and
Retention source inventories now bind both planner processing files and every
changed cart/config/app source. No new database dataset or external processor
is introduced.

## Activation, verification and rollback

- `PLANNER_INVENTORY_ENABLED` defaults false in both Compose profiles, requires
  `PLANNER_CORE_ENABLED`, and is rejected in production.
- Both technical routes require authentication, an active account, unsuspended
  booking scope and the exact disabled-feature access assertion.
- Public release, inventory public-release permission and external generative
  AI remain false. PR #7 remains Draft and unmerged.
- Focused tests cover current candidate truth, all three ranking bases,
  unavailable variants, bounded item/listing edits, required-item safety,
  stale-snapshot abort, cart revalidation/removal, non-reservation, flag gates
  and data-minimized instrumentation.
- Full backend/Flutter/Web/Android regression and exact commit-bound CI remain
  required before G4B closes.

Rollback removes the G4B module, tests/routes and inventory flag, restores the
small cart test seam, and restores exact Privacy/Retention source inventories
and hashes. There is no migration, production change or provider state.
