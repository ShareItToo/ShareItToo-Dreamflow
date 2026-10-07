# S4AA image-gallery async-context ratchet - architecture

Status: locally verified on 22.08.2026 at implementation commit `4522bb2`.
This is a non-live source-safety reduction for `TD-RR-010`; it changes no
production, Payment, Store, Cloud/VPS/DNS or pilot state.

## Disposed-gallery boundary

The gallery's Wishlist and Share controls await callbacks owned by their
calling feature. The overlay can be dismissed while either callback is still
pending. Previously, successful Wishlist completion could then call `setState`
on the disposed overlay, while Wishlist or Share failure could try to open an
error popup with the disposed build context.

Wishlist success now returns before `setState` unless the gallery state remains
mounted. Both error paths return before popup creation unless the exact local
`BuildContext` remains mounted. This distinction is intentional: a State guard
protects `setState`, while a context guard protects the context passed to
`AppPopup.toast`. The analyzer rejected an unrelated State-only guard for the
context operation before the exact boundary was applied.

Three widget tests hold each callback pending, replace the gallery and then
complete or fail the action. They prove that a late success causes no disposed
`setState`, and late Wishlist/Share failures open no popup or route after
disposal. No timeout, retry, lint suppression or swallowed mounted failure is
used.

## Analyzer ratchet and evidence

The exact analyzer snapshot moved only in the intended bucket:

- total `212 -> 210`;
- `use_build_context_synchronously` `90 -> 88`;
- `lib/widgets/image_gallery_overlay.dart` bucket `2 -> 0`; and
- fingerprint
  `97cc31e1954e2220a0ed13af26df71ba038d47c842a2a9834a6c78697f1cf59c`
  -> `2896706b188c8ff524911d8a16505c9a91a77a0183a03739e6ed34e664ce243b`.

All other code and path/code counts remained unchanged. The three focused
widget tests and complete clean implementation-head local metadata gate passed
at `4522bb26c156500518af22045671ac67836285ca` with the exact 210-diagnostic
snapshot, 384 Flutter tests plus one documented skip, Google-only, Web
build/smoke and Android debug. SIT temp roots remained zero.

This is another downward step for `TD-RR-010`, not closure. Further reviewed
source ratchets to zero plus exact-commit CI remain mandatory. P0B remains
`HOLD` / `NO-GO`.
