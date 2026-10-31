# S4AD listing-options async-context ratchet

Status: locally verified, non-live.

## Canonical checks

Run Flutter commands sequentially from the repository root:

```sh
node --test \
  test/tool/listing_options_async_context_wiring.test.mjs \
  test/tool/wishlist_async_context_wiring.test.mjs \
  test/tool/item_card_async_context_wiring.test.mjs
flutter test --reporter expanded \
  test/g2a_rental_cart_screen_test.dart \
  test/g2a_saved_items_persistence_test.dart \
  test/g2l_saved_items_lifecycle_test.dart
flutter analyze 2>&1 \
  | node tool/validate_flutter_analyzer_debt.mjs --log -
```

The source contracts report ten passes, the Flutter selection reports five
passes, and the analyzer validator accepts exactly 204 findings at fingerprint
`54a8b14c150f43d5a4ae03176c9075c6ca1a9043e7c173eb8a5b7fa4265393ae`.

## Failure and release boundary

Do not replace an exact context-mounted check with a delay, retry or lint
suppression. A persistence operation that already completed remains complete,
but it must not trigger a callback or popup through a disposed caller.

This ratchet neither closes `TD-RR-010` nor authorizes live changes. Continue
reviewed source reductions to zero and retain exact-commit CI before release
readiness. P0B remains `HOLD` / `NO-GO`.
