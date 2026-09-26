# S4AG public-profile async-context ratchet

Status: locally verified, non-live.

## Canonical checks

Run Flutter commands sequentially from the repository root:

```sh
node --test test/tool/public_profile_async_context_wiring.test.mjs
flutter test --reporter expanded \
  test/public_profile_screen_logic_test.dart \
  test/blocked_users_screen_test.dart \
  test/large_text_primary_surfaces_test.dart
flutter analyze 2>&1 \
  | node tool/validate_flutter_analyzer_debt.mjs --log -
```

The source contract reports three passes, the Flutter selection reports 16
passes, and the analyzer validator accepts exactly 200 findings at fingerprint
`521233f5d8bfbbb086e2ed3cd3d33d43726c83e30cd9f963c65f4ed7171f0bbb`.

## Failure and release boundary

Do not replace either exact context check with a State-only guard, delay, retry
or lint suppression. Clipboard completion and the block flow may proceed only
while the exact public-profile screen context is still mounted.

This ratchet neither closes `TD-RR-010` nor authorizes live changes. Continue
reviewed source reductions to zero and retain exact-commit CI before release
readiness. P0B remains `HOLD` / `NO-GO`.
