# S4AN owner-detail time/overflow async-context ratchet - architecture

Status: locally verified on 22.08.2026 at implementation commit `b4ac1d1`.
This is a non-live source-safety reduction for `TD-RR-010`; it changes no
production, Payment, Store, Cloud/VPS/DNS or pilot state.

## Owner-detail lifecycle boundaries

Two owner-detail areas previously retained UI context across asynchronous
work:

- appointment management after flow-state loading and after persisting an
  accepted or newly requested handover/return time; and
- the owner overflow menu after selection and after cancellation status and
  timeline mutations.

The time-management path now stops when the owning State has been disposed
after each relevant data dependency. The overflow route proves the exact
builder context immediately after menu selection and again after cancellation
mutations, before later popup or toast access. Appointment, cancellation,
timeline, item-detail and navigation rules remain unchanged.

Six committed S4AN source contracts lock these boundaries and reject timing or
lint accommodations. Together with the existing analyzer and privacy source
contracts, the focused source selection reports 34 passes. Ninety-six focused
booking, chat, handover/return, cancellation, checkout and confirmation Flutter
tests retain the surrounding behavior.

Because the owner-detail screen is source-bound by the release privacy
inventory, its exact source hash is updated together with this reviewed source
change. The privacy disclosure remains `draft`; no classification, approval or
release state changes.

## Analyzer ratchet and evidence

The exact analyzer snapshot moved only in the intended bucket:

- total `182 -> 175`;
- `use_build_context_synchronously` `60 -> 53`;
- `lib/screens/ongoing_owner_detail_screen.dart` context bucket `17 -> 10`;
  and
- fingerprint
  `44ca5afd2e1eb86cdac3fda478dbc76bde2de2682e903d506acf929c589908a8`
  -> `499e95593296df94e8d4da41c46ef05f1bc1469b30e16efebf45d53ecb3b7a18`.

All other code and path/code counts remained unchanged. The complete clean
local metadata gate passed at `b4ac1d1325d513103f6fe87c10e8306ec8ef0986`
with the exact 175-diagnostic snapshot, 384 Flutter tests plus one documented
skip, Google-only, Web build/smoke and one direct 448-task Android debug build.

This is another downward step for `TD-RR-010`, not closure. Further reviewed
source ratchets to zero plus exact-commit CI remain mandatory. P0B remains
`HOLD` / `NO-GO`.
