# S4AE profile-info async-lifecycle ratchet

Status: locally verified, non-live.

## Canonical checks

Run Flutter commands sequentially from the repository root:

```sh
node --test test/tool/profile_info_async_lifecycle_wiring.test.mjs
flutter test --reporter expanded \
  test/public_profile_screen_logic_test.dart \
  test/large_text_primary_surfaces_test.dart
flutter analyze 2>&1 \
  | node tool/validate_flutter_analyzer_debt.mjs --log -
```

The source contract reports three passes, the Flutter selection reports 15
passes, and the analyzer validator accepts exactly 203 findings at fingerprint
`6a859c38b4b87688200eecb4320e070409d552aa52318aa25f778a6472c71614`.

## Failure and release boundary

Do not replace a mounted check with a delay, retry or lint suppression. A
profile save that already completed remains complete, but no late navigation or
State update may run through a disposed profile screen.

This ratchet neither closes `TD-RR-010` nor authorizes live changes. Continue
reviewed source reductions to zero and retain exact-commit CI before release
readiness. P0B remains `HOLD` / `NO-GO`.
