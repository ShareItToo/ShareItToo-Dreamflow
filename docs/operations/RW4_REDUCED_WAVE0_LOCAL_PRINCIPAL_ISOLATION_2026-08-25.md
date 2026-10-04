# RW4 reduced Wave-0 local principal isolation

Status: **VERIFIED — REGRESSION AND CODEQL GREEN**

Baseline closure commit: `9af5c768279e501a0e3288affea4c403c2baf178`

## Retained focused commands

```text
flutter analyze <RW4 changed Dart paths>

flutter test --reporter expanded \
  test/reduced_wave0_local_principal_isolation_test.dart

flutter test --reporter expanded \
  test/reduced_wave0_local_principal_isolation_test.dart \
  test/reduced_wave0_local_state_truth_recovery_test.dart \
  test/reduced_wave0_local_concurrency_consistency_test.dart \
  test/g2a_rental_cart_screen_test.dart \
  test/g2a_saved_items_persistence_test.dart \
  test/g2b_rental_cart_persistence_test.dart \
  test/g2l_saved_items_lifecycle_test.dart \
  test/shared_persistence_sync_test.dart

node --test \
  test/tool/rw4_reduced_wave0_local_principal_isolation_wiring.test.mjs \
  test/tool/validate_rw4_reduced_wave0_local_principal_isolation.test.mjs
```

Focused RW4 result: 13 passed. The combined RW4 and adjacent RW2/RW3/G2
matrix passes 51 checks. Changed-file analysis reports zero issues. The G2
lifecycle and predecessor wiring set passes 20 checks.

The red-first matrix first reproduced account-A saved state and cart visibility
for guest/account B, attribution of legacy bytes to a newly signed-in account,
and an export without principal scope. The bounded implementation resolves
those findings and adds deterministic immediate session-replacement,
bucket-local quarantine, process recreation, capacity, deletion and compact
stale-state proofs without a delay,
retry, serial test mode, rate-limit accommodation or timing threshold.

The complete candidate-rollover technical regression passes in CI-metadata
mode. It includes all repository validators, analyzer with zero issues, the
default Flutter suite with 440 passed and three documented exact-profile skips,
all exact RW profiles, Web/Wasm debug build and loopback smoke, Android debug
assembly with 448 tasks, merged-artifact checks and the release-host resource
guard. Exact implementation head
`f11335b74b88365a4f42c0bc748966d9b58d85d7` passed GitHub Regression
`32805997938` and CodeQL `32805997934`, with zero open code-scanning alerts.
PR #7 remains Draft, open and unmerged. No candidate was signed, installed or
uploaded.

## Rollback

Revert the bounded RW4 implementation before a successor depends on it.
Principal-token derivation, V3/V2 registry readers and writers, guest-only
legacy compatibility, auth transition events, lifecycle contracts and tests
form one isolation boundary and must not be partially reverted. A rollback
must not reinterpret account buckets as unscoped guest data.

## Gate truth

`BUILD_READY`, `PLAY_UPLOAD_APPROVED`, `HUMAN_PILOT_ACTIVATED`, external AI,
Payment and `PR7_MERGE_APPROVED` remain ungranted. The historical GitGuardian
owner review remains open. Focused local verification grants no live action.
