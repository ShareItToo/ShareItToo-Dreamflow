# S4Z popup auto-close lifecycle ratchet - architecture

Status: locally verified on 22.08.2026 at implementation commit `e7b7f8f`.
This is a non-live source-safety reduction for `TD-RR-010`; it changes no
production, Payment, Store, Cloud/VPS/DNS or pilot state.

## Navigator lifetime boundary

`AppPopup.show` and `toast` previously used the caller `BuildContext` after an
asynchronous delay to resolve and pop the root navigator. Besides retaining a
disposed context, the standard popup timer remained armed after a manual
dismissal and could pop a different route opened before the delay expired.

Both paths now capture the root `NavigatorState` synchronously. A delayed close
requires that the popup has not completed, the captured navigator still exists
and is mounted, and that it can pop. `showGeneralDialog.whenComplete` marks the
popup closed for both manual and automatic dismissal, so its old timer cannot
affect a later route. The toast retains its single-close guard while receiving
the same mounted-navigator boundary.

Two widget tests prove that a manually dismissed auto-close popup cannot pop a
subsequent route and that a toast still closes itself exactly once while its
navigator is mounted. No delay was added, no retry or lint suppression was
introduced, and no global route identity is inferred.

## Analyzer ratchet and evidence

The exact analyzer snapshot moved only in the intended bucket:

- total `214 -> 212`;
- `use_build_context_synchronously` `92 -> 90`;
- `lib/widgets/app_popup.dart` bucket `2 -> 0`; and
- fingerprint
  `313ea421e579179cfef4d8d1adf2e27ec2706de4d4e80f83c76775dcc5ecaa58`
  -> `97cc31e1954e2220a0ed13af26df71ba038d47c842a2a9834a6c78697f1cf59c`.

All other code and path/code counts remained unchanged. The two focused widget
tests and the complete clean implementation-head local metadata gate passed at
`e7b7f8f586ec457ce90efe2cae118e0aa0279963` with the exact 212-diagnostic
snapshot, 381 Flutter tests plus one documented skip, Google-only, Web
build/smoke and Android debug. SIT temp roots remained zero.

This is another downward step for `TD-RR-010`, not closure. Further reviewed
source ratchets to zero plus exact-commit CI remain mandatory. P0B remains
`HOLD` / `NO-GO`.
