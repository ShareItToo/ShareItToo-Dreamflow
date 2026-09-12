# S4Y wishlist async-context ratchet - architecture

Status: locally verified on 22.08.2026 at implementation commit `1958248`.
This is a non-live source-safety reduction for `TD-RR-010`; it changes no
production, Payment, Store, Cloud/VPS/DNS or pilot state.

## Context lifetime boundary

`WishlistSelectionSheet.showAdd` and `showMove` each awaited the wishlist list
and item assignments before reading theme state, opening a popup and capturing
the original navigator context. If the calling widget was disposed during
either lookup, those context operations could target a dead element.

Each method now checks `context.mounted` immediately after each asynchronous
lookup and returns `null` when its caller no longer exists. That return is the
same user-visible result as dismissing the selector: it creates no list change,
item assignment, reservation or booking side effect. A disposed caller no
longer receives a popup.

The committed source contract requires all four guards in their exact lookup
positions and rejects a lint suppression, delayed action or retry. Related
saved-item behavior retains the truthful `Gemerkt`/non-reserving contract.

## Analyzer ratchet and evidence

The exact analyzer snapshot moved only in the intended bucket:

- total `220 -> 214`;
- `use_build_context_synchronously` `98 -> 92`;
- `lib/widgets/wishlist_selection_sheet.dart` bucket `6 -> 0`; and
- fingerprint
  `3a2fcf242ac029bcf4e3f2b70a92660700f88b68a05e3a3fca7d81b94b5010bd`
  -> `313ea421e579179cfef4d8d1adf2e27ec2706de4d4e80f83c76775dcc5ecaa58`.

All other code and path/code counts remained unchanged. Nine focused
Ratchet/Wishlist tests and five saved-item lifecycle/UI tests passed. The
complete clean implementation-head local metadata gate passed at
`195824802b5edaf2c65d8b8ab611abfccae4b707` with the exact 214-diagnostic
snapshot, 379 Flutter tests plus one documented skip, Google-only, Web
build/smoke and Android debug. SIT temp roots remained zero.

This is one downward step for `TD-RR-010`, not closure. Further reviewed source
ratchets to zero plus exact-commit CI remain mandatory. P0B remains `HOLD` /
`NO-GO`.
