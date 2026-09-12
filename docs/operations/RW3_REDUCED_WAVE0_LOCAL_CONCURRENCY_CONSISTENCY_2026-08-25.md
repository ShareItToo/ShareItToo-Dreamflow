# RW3 reduced Wave-0 local concurrency and cross-surface consistency

Status: **VERIFIED — REGRESSION AND CODEQL GREEN**

Baseline closure commit: `c3ac3b6be4cbd4813c33f24ff629f8d7419243fa`

## Retained focused commands

```text
flutter analyze <RW3 changed Dart paths>

flutter test --reporter expanded \
  test/reduced_wave0_local_concurrency_consistency_test.dart

flutter test --reporter expanded \
  test/reduced_wave0_local_state_truth_recovery_test.dart \
  test/reduced_wave0_product_journey_test.dart \
  test/reduced_wave0_accessibility_resilience_test.dart \
  test/g2a_rental_cart_screen_test.dart \
  test/g2a_saved_items_persistence_test.dart \
  test/g2b_rental_cart_persistence_test.dart \
  test/g2l_saved_items_lifecycle_test.dart \
  test/shared_persistence_sync_test.dart

node --test \
  test/tool/rw3_reduced_wave0_local_concurrency_consistency_wiring.test.mjs \
  test/tool/validate_rw3_reduced_wave0_local_concurrency_consistency.test.mjs
```

Focused RW3 result: 9 passed. The adjacent RW0/RW1/RW2, G2 persistence,
lifecycle and shared-refresh Flutter matrix passes 34 checks with the retained
profile skips. The G2 lifecycle validator now binds four local Gemerkt keys,
including the canonical atomic document.

The red-first matrix initially reproduced lost concurrent assignments, lost
custom folders, lost cart items, ignored canonical recovery and absent refresh
events. The implementation resolves each finding without a delay, retry,
serial test mode, rate-limit accommodation or timing threshold. The complete
candidate-rollover technical regression passes in CI-metadata mode, including
the full Flutter suite, Web/Wasm build and loopback smoke, Android debug build
and repository resource guard. Exact implementation head
`f7a49899b51e733041878dba86bebf5737fac023` passed GitHub Regression
`32802063600` and CodeQL `32802063601`, with zero open code-scanning alerts.

## Rollback

Revert the bounded RW3 implementation before a successor depends on it. The
canonical wishlist document, queues, change events, screen coordinators,
lifecycle update and tests form one consistency boundary and must not be
partially reverted.

## Gate truth

`BUILD_READY`, `PLAY_UPLOAD_APPROVED`, `HUMAN_PILOT_ACTIVATED`, external AI,
Payment and `PR7_MERGE_APPROVED` remain ungranted. The historical GitGuardian
owner review remains open. Focused local verification grants no live action.
