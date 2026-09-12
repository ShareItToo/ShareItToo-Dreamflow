# S4AI bookings async-context ratchet - architecture

Status: locally verified on 22.08.2026 at implementation commit `4a050fc`.
This is a non-live source-safety reduction for `TD-RR-010`; it changes no
production, Payment, Store, Cloud/VPS/DNS or pilot state.

## Renter-bookings lifecycle boundaries

Booking-card navigation awaited the read mutation and then used the list
builder's captured `BuildContext`. It now proves that exact context immediately
before navigation and discards the late continuation when the card has been
disposed.

The completed-booking inline review awaited current-user lookup before opening
the review sheet through its State context. It now stops when that State is no
longer mounted. Existing post-review guards remain in place. Booking state,
read semantics, review eligibility, quote data, destination and refresh
behavior are unchanged.

Three committed S4AI source contracts lock both lifecycle boundaries and reject
timing delays or lint suppression. Together with booking-list, address, quote
and V5.2 checkout contracts, 20 assertions pass. Fifty-five focused booking and
review Flutter tests retain cancellation, transition, review-hold and display
behavior. Seventy-three privacy/retention contracts preserve the fail-closed
Store boundary.

## Analyzer ratchet and evidence

The exact analyzer snapshot moved only in the intended bucket:

- total `198 -> 196`;
- `use_build_context_synchronously` `76 -> 74`;
- `lib/screens/bookings_screen.dart` bucket `2 -> 0`; and
- fingerprint
  `d39144ea4cec745b18c765e2aedc84b5a4a270f1fb0088f274aab4b4e91e4958`
  -> `80c9450eda2af563072e34fe4fc0a2fa31e166def4e6d5c6ac28d2930be0080e`.

All other code and path/code counts remained unchanged. The privacy inventory
was rebound to the changed reviewed source without changing a disclosure,
decision or approval state. The complete clean local metadata gate passed at
`4a050fc4a695183e9352de2349255507bccc487f` with the exact 196-diagnostic
snapshot, 384 Flutter tests plus one documented skip, Google-only, Web
build/smoke and one direct 448-task Android debug build.

This is another downward step for `TD-RR-010`, not closure. Further reviewed
source ratchets to zero plus exact-commit CI remain mandatory. P0B remains
`HOLD` / `NO-GO`.
