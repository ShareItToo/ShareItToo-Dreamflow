# S4AA image-gallery async-context ratchet

Status: locally verified, non-live.

## Canonical checks

Run Flutter commands sequentially from the repository root:

```sh
flutter test --reporter expanded \
  test/image_gallery_overlay_async_lifecycle_test.dart
flutter analyze 2>&1 \
  | node tool/validate_flutter_analyzer_debt.mjs --log -
CI=true SIT_ALLOW_CANDIDATE_ROLLOVER=1 \
  bash scripts/technical_regression_check.sh
```

The focused test reports three passes. The analyzer validator accepts exactly
210 findings at fingerprint
`2896706b188c8ff524911d8a16505c9a91a77a0183a03739e6ed34e664ce243b`.
The final command is the documented local CI-metadata-only gate because the
historical candidate AAB is absent; it is not actual CI, Store or device
evidence.

## Failure and release boundary

Do not replace the mounted State/context guards with a delay, callback retry,
ignored Future or lint suppression. A late success may not update a disposed
gallery, and a late failure may not open a popup after that gallery is gone.
Collect Flutter test and analyze evidence sequentially.

This ratchet neither closes `TD-RR-010` nor authorizes live changes. Continue
reviewed source reductions to zero and retain exact-commit CI before release
readiness. P0B remains `HOLD` / `NO-GO`.
