# S4AR booking-detail handover/return async-context ratchet - architecture

Status: locally verified on 22.08.2026 at implementation commit `5658f10`.
This is a non-live source-safety reduction for `TD-RR-010`; it changes no
production, Payment, Store, Cloud/VPS/DNS or pilot state.

## Final booking-detail lifecycle boundaries

The final twelve booking-detail findings covered the complete handover and
return result boundary:

- both pickup and return steppers after secure challenge issuance;
- owner identity and transition synchronization before return result UI;
- renter identity, lifecycle synchronization, notification and banner work
  before pickup result UI; and
- QR and manual-code identity, verification, transition and notification work
  before pickup/return feedback and local entry-state reset.

Both steppers now stop after challenge lookup when their owning State is gone.
Every QR, manual-code and stepper result path proves the same State after its
last asynchronous operation before context or local state access. Secure role,
challenge, photo evidence, transition, notification, banner, review reminder,
`needsReview` and result-copy behavior remain unchanged.

Six committed S4AR source contracts lock these boundaries and reject timing or
lint accommodations in the changed paths. Together with the preceding booking,
owner-detail, analyzer and privacy contracts, the focused source selection
reports 45 passes. Ninety-six focused booking, cancellation, handover/return,
checkout, confirmation and notification Flutter tests retain the surrounding
behavior.

Because the booking-detail screen is source-bound by the release privacy
inventory, its exact source hash is updated together with this reviewed source
change. The privacy disclosure remains `draft`; no classification, approval or
release state changes.

## Analyzer ratchet and evidence

The exact analyzer snapshot moved only in the intended bucket:

- total `155 -> 143`;
- `use_build_context_synchronously` `33 -> 21`;
- `lib/screens/booking_detail_screen.dart` context bucket `12 -> 0`; and
- fingerprint
  `9798523795f6020c4dde8ee75fa825ff39678af6f459a082f19b7c8daa83830b`
  -> `69d1e3e1fc149c4c1812c165f00f39bf3c2aa1935ebb45a44676c3bdae804831`.

All other code and path/code counts remained unchanged. The complete clean
local metadata gate passed in one execution at
`5658f101a9a744f34c7ccdfd70cce1a317646cd8` with the exact 143-diagnostic
snapshot, 384 Flutter tests plus one documented skip, Google-only, Web
build/smoke and one direct 448-task Android debug build. A delayed desktop
output delivery did not change, restart or rerun the underlying process.

This clears the booking-detail context bucket but does not close `TD-RR-010`.
The remaining 21 item-overlay context findings require further reviewed source
ratchets to zero plus exact-commit CI. P0B remains `HOLD` / `NO-GO`.
