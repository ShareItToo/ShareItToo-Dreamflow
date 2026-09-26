# S4Y wishlist async-context ratchet

Status: locally verified, non-live.

## Canonical checks

From the repository root:

```sh
node --test test/tool/wishlist_async_context_wiring.test.mjs \
  test/tool/analyzer_baseline_wiring.test.mjs \
  test/tool/validate_flutter_analyzer_debt.test.mjs
flutter test --reporter expanded \
  test/g2a_rental_cart_screen_test.dart \
  test/g2a_saved_items_persistence_test.dart \
  test/g2l_saved_items_lifecycle_test.dart
flutter analyze 2>&1 \
  | node tool/validate_flutter_analyzer_debt.mjs --log -
```

The first command reports nine passes, the Flutter selection reports five
passes, and the analyzer validator accepts exactly 214 findings at fingerprint
`313ea421e579179cfef4d8d1adf2e27ec2706de4d4e80f83c76775dcc5ecaa58`.

## Failure and release boundary

Do not replace a mounted check with a delay, retry, ignored lint or unconditional
popup. A `null` result after caller disposal is the fail-closed outcome and must
not mutate saved-item state.

This ratchet neither closes `TD-RR-010` nor authorizes live changes. Continue
reviewed source reductions to zero and retain exact-commit CI before release
readiness. P0B remains `HOLD` / `NO-GO`.
