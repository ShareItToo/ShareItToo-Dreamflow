# RW12 security success UI principal epoch

Date: 2026-08-25
Run mode: deterministic local client-security correction only

## Supported focused checks

```bash
flutter analyze \
  lib/screens/security_screen.dart \
  lib/services/account_security_service.dart \
  lib/services/auth_service.dart \
  lib/services/shared_persistence_sync_web.dart \
  test/rw12_security_success_ui_principal_epoch_test.dart
flutter test --reporter expanded \
  test/rw10_local_security_control_truthfulness_test.dart \
  test/rw12_security_success_ui_principal_epoch_test.dart \
  test/b10_release_truthfulness_test.dart
node --test \
  test/tool/rw12_security_success_ui_principal_epoch_wiring.test.mjs \
  test/tool/validate_rw12_security_success_ui_principal_epoch.test.mjs
node tool/validate_rw12_security_success_ui_principal_epoch.mjs
```

The current complete `test/tool/*.test.mjs` inventory is 326 files / 1,877
passing tests / zero skips under standard Node test-runner parallelism.
The focused RW10 + RW12 + B10 Flutter matrix passes 46 tests; changed-file
analysis reports zero issues.

The package closure gate is the supported full regression with standard
parallelism and no timing accommodation:

```bash
CI=true SIT_ALLOW_CANDIDATE_ROLLOVER=1 \
  bash scripts/technical_regression_check.sh
```

The Mac-mini `CI=true` branch is metadata-only. It cannot prove the unavailable
private AAB, a Store upload or a physical-device result.

## Current verification

- Exact implementation head:
  `0a13df419f4abd5e30858503f4e93f23c9e9d9f1`.
- Full technical regression: passed with standard parallelism, no retry, sleep,
  exclusion or worker reduction.
- Tool inventory: 1,877 passed, zero skipped.
- Flutter: 535 passed with three documented profile skips; analyzer zero.
- Web/Wasm and loopback smoke: passed.
- Android debug: 448 tasks passed, minSdk 24.
- Private release AAB, Store and device proof: not claimed.
- Exact-head GitHub Regression `32857019933` and CodeQL `32857019848`:
  passed; zero open GitHub code-scanning alerts.
- PR #7 remains Draft, open, clean and unmerged.

## Operational invariant

- Never emit password-change success from an error, malformed session, active or
  successor session, unreadable storage result, stale widget, or changed epoch.
- Never use `AuthService.readSession() == null` as proof of definite absence,
  because that reader deliberately maps malformed/unreadable input to null for
  general app recovery.
- Capture the success epoch after the service returns, then recheck it after the
  definite-absence await and after the popup await.
- Keep `account_security_state_v1` in the Web persistence watch set.
- Reserve `Passwort nicht geändert` for a definite allowlisted backend rejection
  or a local pre-request failure. Use the server-confirmed local-finalization and
  outcome-unknown messages for the other two cases.
- On an unknown remote outcome, remove only the exact invoking A marker when it
  still matches; never broadly clear a successor B session.
- Clear password fields immediately on security-state events; do not retain or
  report secret values in evidence.

Do not add sleeps, retries, serial flags, worker reductions, test exclusions or
live auth calls when diagnosing a failure.

## Rollback

Rollback is a normal Git revert of the RW12 product changes, focused tests,
validator, evidence, documentation, regression registration and mechanical hash
refreshes. Do not reset, rebase, force-push or rewrite history.

## Closed gates

BUILD_READY, Play upload, human pilot, PR #7 merge, live provider/AI, real auth or
support traffic, real money, legal-owner decisions and the GitGuardian owner-
history review remain ungranted.
