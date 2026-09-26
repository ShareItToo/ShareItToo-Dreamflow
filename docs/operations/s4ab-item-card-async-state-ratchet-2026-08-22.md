# S4AB item-card async-state ratchet

Status: locally verified, non-live.

## Canonical checks

Run Flutter commands sequentially from the repository root:

```sh
node --test test/tool/item_card_async_context_wiring.test.mjs
flutter test --reporter expanded \
  test/g2a_rental_cart_screen_test.dart \
  test/g2a_saved_items_persistence_test.dart \
  test/g2l_saved_items_lifecycle_test.dart
flutter analyze 2>&1 \
  | node tool/validate_flutter_analyzer_debt.mjs --log -
```

The source contract reports four passes, the Flutter selection reports five
passes, and the analyzer validator accepts exactly 207 findings at fingerprint
`2001fe6ae09a6e04b63b37b140b88dde0327940540c74a60ff35e7efd987bfe8`.

## Failure and release boundary

Do not replace a mounted check with a delay, callback retry, force-unwrapped
post-dialog list ID or lint suppression. Late UI work must stop without undoing
an already completed local persistence action.

This ratchet neither closes `TD-RR-010` nor authorizes live changes. Continue
reviewed source reductions to zero and retain exact-commit CI before release
readiness. P0B remains `HOLD` / `NO-GO`.
