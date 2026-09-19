# G3E Disabled Multi-Item UX - Technical Evidence

Date: 2026-08-20
Decision: G3A Variant A
Activation: disabled, non-release technical path only

## Implemented presentation

- `Mietkorb` identifies only same-owner, same-project, same-period and
  same-currency candidates containing two to 20 available items.
- Candidate rows state that the server must recheck compatibility and that no
  reservation, contract or payment exists.
- The technical screen requests a fresh immutable server group quote and
  displays the group total, rental subtotal, service amount and every item's
  exact cent allocation.
- Client parsing rejects malformed IDs/hashes, currency drift, duplicate
  positions, invalid deposit allocations and any item/group total mismatch.
- The group read response now supplies the exact predecessor quote for a
  current counter-offer. A missing predecessor fails closed on the server.
- Counter-offer comparison shows prior/current totals, delta and item-set
  change. Acceptance remains disabled until the renter explicitly selects the
  exact revision-and-total statement; the request binds current quote ID and
  hash.
- A shared appointment projection shows pickup and return without an exact
  address. Four evidence slots, accessories, confirmations, chat, return
  status, deadlines, damage case and `needsReview` remain visible per item.

## Activation controls

- Flutter `SIT_BOOKING_GROUPS_TECHNICAL_UI_ENABLED` defaults false.
- Flutter release builds never expose the path, even if a technical define is
  supplied. The public-release sentinel does not enable this implementation.
- Backend `BOOKING_GROUPS_ENABLED` remains false and production activation is
  rejected independently.
- Public/live use still requires G3L and the later professional legal and
  release gates.

## Non-effects

- No new database migration or local persistence is added.
- No group booking, contract, payment, refund, cancellation, damage charge,
  exact-address disclosure or Store/public artifact is created.
- Existing single-item checkout remains available and unchanged.
- No production, VPS, cloud console, provider account, real money, signing or
  Store state is changed.

## Verification contract

- Focused Flutter tests cover disabled release behavior, candidate isolation,
  cent-total rejection, predecessor comparison, exact explicit consent and
  item-specific evidence presentation.
- Existing Mietkorb tests prove the technical entry is absent under default
  configuration.
- Backend tests cover predecessor projection and continue to cover exact
  quote/hash consent, append-only transitions and item evidence isolation.
- Privacy and retention source hashes remain exact while both manifests stay
  draft and fail-closed.
- Complete Flutter/backend regression, web and Android debug builds, exact
  PostgreSQL integration and exact commit-bound CI must pass before G3E is
  marked GREEN.

## Rollback and next package

Normal rollback is a code revert; there is no G3E migration. Disabling either
the Flutter technical flag or backend booking-group flag makes the path
unreachable without altering stored group or V5.2 evidence. After exact green
CI, V2.4 automatically advances to G3L-DRAFT.
