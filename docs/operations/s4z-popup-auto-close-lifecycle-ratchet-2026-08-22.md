# S4Z popup auto-close lifecycle ratchet

Status: locally verified, non-live.

## Canonical checks

Run Flutter commands sequentially from the repository root:

```sh
flutter test --reporter expanded \
  test/app_popup_auto_close_lifecycle_test.dart
flutter analyze 2>&1 \
  | node tool/validate_flutter_analyzer_debt.mjs --log -
CI=true SIT_ALLOW_CANDIDATE_ROLLOVER=1 \
  bash scripts/technical_regression_check.sh
```

The focused test reports two passes. The analyzer validator accepts exactly 212
findings at fingerprint
`97cc31e1954e2220a0ed13af26df71ba038d47c842a2a9834a6c78697f1cf59c`.
The final command is the documented local CI-metadata-only gate because the
historical candidate AAB is absent; it is not actual CI, Store or device
evidence.

## Failure and release boundary

Do not replace the captured mounted navigator and completion guard with delayed
context access, a longer timer, retry or lint suppression. A dismissed popup's
timer must never pop a later route. Flutter test and analyze evidence must be
collected sequentially so the toolchain lock is not treated as a workaround.

This ratchet neither closes `TD-RR-010` nor authorizes live changes. Continue
reviewed source reductions to zero and retain exact-commit CI before release
readiness. P0B remains `HOLD` / `NO-GO`.
