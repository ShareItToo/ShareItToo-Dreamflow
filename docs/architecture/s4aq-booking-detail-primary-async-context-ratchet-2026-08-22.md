# S4AQ booking-detail primary async-context ratchet - architecture

Status: locally verified on 22.08.2026 at implementation commit `1cb7489`.
This is a non-live source-safety reduction for `TD-RR-010`; it changes no
production, Payment, Store, Cloud/VPS/DNS or pilot state.

## Primary booking-detail lifecycle boundaries

The first ten booking-detail findings covered four connected UI boundaries:

- time-management thread and flow-state lookup, accepted-time feedback and
  the common time-picker entry;
- listing lookup before the deleted-listing dialog or item overlay;
- overflow-menu selection before any selected route, including the fail-closed
  payment-status screen; and
- completed-renter review before the prompt and again before result feedback.

State-owned helpers now prove the owning State lifecycle after each relevant
lookup. The overflow and review callbacks additionally prove their exact build
or Builder context after asynchronous work. The listing lookup no longer
retains a context across its public-item query. Time selection, listing match,
menu destinations, review direction, Payment availability and `needsReview`
behavior remain unchanged.

Five committed S4AQ source contracts lock these boundaries and reject timing
or lint accommodations in the changed paths. Together with the preceding
owner-detail, analyzer and privacy contracts, the focused source selection
reports 39 passes. Ninety-six focused booking, cancellation, handover/return,
checkout, confirmation and notification Flutter tests retain the surrounding
behavior.

Because the booking-detail screen is source-bound by the release privacy
inventory, its exact source hash is updated together with this reviewed source
change. The privacy disclosure remains `draft`; no classification, approval or
release state changes.

## Analyzer ratchet and evidence

The exact analyzer snapshot moved only in the intended bucket:

- total `165 -> 155`;
- `use_build_context_synchronously` `43 -> 33`;
- `lib/screens/booking_detail_screen.dart` context bucket `22 -> 12`; and
- fingerprint
  `0e3a17c307ad7158bf910a2e2c96a574bdbda8fcf0b9682935c1b3007322feca`
  -> `9798523795f6020c4dde8ee75fa825ff39678af6f459a082f19b7c8daa83830b`.

All other code and path/code counts remained unchanged. The complete clean
local metadata gate passed at `1cb74899cc2c051c749acd85a8b40d9dc414b47e`
with the exact 155-diagnostic snapshot, 384 Flutter tests plus one documented
skip, Google-only, Web build/smoke and one direct 448-task Android debug build.

This package does not close `TD-RR-010`. The remaining 12 booking-detail and 21
item-overlay context findings require further reviewed source ratchets to zero
plus exact-commit CI. P0B remains `HOLD` / `NO-GO`.
