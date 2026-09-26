# S4AF listing-photo async-lifecycle ratchet

Status: locally verified, non-live.

## Canonical checks

Run Flutter commands sequentially from the repository root:

```sh
node --test \
  test/tool/create_listing_photo_async_lifecycle_wiring.test.mjs \
  test/tool/validate_android_photo_picker_policy.test.mjs
flutter analyze 2>&1 \
  | node tool/validate_flutter_analyzer_debt.mjs --log -
node tool/validate_privacy_disclosures.mjs
node tool/validate_retention_deletion_readiness.mjs
```

The source selection reports four passes, the analyzer validator accepts
exactly 202 findings at fingerprint
`450b3cf87867dd26e7a02cfd38633f569063f543671fc585ee1d45a7d8127a05`,
and both source-bound policy validators remain honestly draft and fail-closed.

## Failure and release boundary

Do not replace the exact post-read context check with a delay, retry or lint
suppression. A completed file read may finish, but no late preview dialog may
open through a disposed thumbnail.

This ratchet neither closes `TD-RR-010` nor authorizes live changes. Continue
reviewed source reductions to zero and retain exact-commit CI before release
readiness. P0B remains `HOLD` / `NO-GO`.
