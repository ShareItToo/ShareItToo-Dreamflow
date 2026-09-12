# S4AD listing-options async-context ratchet - architecture

Status: locally verified on 22.08.2026 at implementation commit `1299518`.
This is a non-live source-safety reduction for `TD-RR-010`; it changes no
production, Payment, Store, Cloud/VPS/DNS or pilot state.

## Dialog lifecycle boundary

The listing-options callbacks are created only after an asynchronous Wishlist
lookup. Add and move could therefore open another dialog through a stale caller
context. Successful add, move or removal could also notify a disposed caller
after persistence had completed.

The add path now checks the exact context immediately before either selector,
again after the selector and again after persistence. Move checks after its
optional lookup, after the selector and after persistence. Removal checks after
persistence. A late persisted result remains persisted, but no disposed caller
callback, navigator or toast is used.

Four committed source contracts lock these boundaries and reject timing delays
or lint suppression. Five existing Gemerkt/Mietkorb persistence, accessibility
and account-deletion tests retain the user-facing data contract.

## Analyzer ratchet and evidence

The exact analyzer snapshot moved only in the intended bucket:

- total `207 -> 204`;
- `use_build_context_synchronously` `85 -> 82`;
- `lib/widgets/listing_options_dialog.dart` bucket `3 -> 0`; and
- fingerprint
  `2001fe6ae09a6e04b63b37b140b88dde0327940540c74a60ff35e7efd987bfe8`
  -> `54a8b14c150f43d5a4ae03176c9075c6ca1a9043e7c173eb8a5b7fa4265393ae`.

All other code and path/code counts remained unchanged. Ten combined Wishlist
lifecycle contracts, five related Flutter tests and the complete clean
implementation-head local metadata gate passed at
`1299518107e51b6079bee17624e711c3e794ca0b` with the exact 204-diagnostic
snapshot, 384 Flutter tests plus one documented skip, Google-only, Web
build/smoke and one direct Android debug build with 448 tasks.

This is another downward step for `TD-RR-010`, not closure. Further reviewed
source ratchets to zero plus exact-commit CI remain mandatory. P0B remains
`HOLD` / `NO-GO`.
