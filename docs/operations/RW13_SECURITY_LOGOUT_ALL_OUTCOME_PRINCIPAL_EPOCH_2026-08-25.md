# RW13 security logout-all outcome and principal epoch

Date: 2026-08-25
Run mode: deterministic local client-security correction only

## Supported focused checks

```bash
flutter analyze \
  lib/screens/security_screen.dart \
  lib/services/account_security_service.dart \
  test/rw10_local_security_control_truthfulness_test.dart \
  test/rw13_security_logout_all_outcome_principal_epoch_test.dart
flutter test --reporter expanded \
  test/rw10_local_security_control_truthfulness_test.dart \
  test/rw12_security_success_ui_principal_epoch_test.dart \
  test/rw13_security_logout_all_outcome_principal_epoch_test.dart \
  test/b10_release_truthfulness_test.dart
node --test \
  test/tool/rw13_security_logout_all_outcome_principal_epoch_wiring.test.mjs \
  test/tool/validate_rw13_security_logout_all_outcome_principal_epoch.test.mjs
node tool/validate_rw13_security_logout_all_outcome_principal_epoch.mjs
```

The focused RW13 matrix passes 12 Flutter tests. The combined RW10 + RW12 +
RW13 + B10 matrix passes 58 tests, and changed-file analysis reports zero issues.

The closure gate is the supported full regression under standard parallelism:

```bash
CI=true SIT_ALLOW_CANDIDATE_ROLLOVER=1 \
  bash scripts/technical_regression_check.sh
```

The Mac-mini `CI=true` path is metadata-only and cannot prove a private release
AAB, Store upload or physical-device result.

At implementation head `1011ef52d8c9f15b80798242cb5e0368b75af53e`, this full
regression passed with standard parallelism: 1,887 repository-owned tool tests
passed with zero skips, 547 Flutter tests passed with the three documented
profile skips, analyzer reported zero issues, Web/Wasm and loopback smoke
passed, and Android debug passed 448 tasks at `minSdk 24`. No timing, retry,
parallelism-reduction or test-exclusion workaround was used.

GitHub Regression run `32862708601` and CodeQL run `32862708673` both passed
against that exact implementation head, with zero open GitHub code-scanning
alerts at closure recording time.

## Operational invariant

- Reserve `Geräte nicht abgemeldet` as a server-result claim for an explicit
  allowlisted structured rejection only.
- Use `Geräte serverseitig abgemeldet` after confirmed remote completion when
  local finalization cannot be proved.
- Use `Ergebnis der Geräteabmeldung unklar` for timeout, transport, 5xx and
  invalid-response paths; do not recommend a blind repeat.
- On a confirmed or unknown result, clear only the exact invoking Account A
  marker and never a successor Account B marker.
- Navigate to login only after definite local session absence and an unchanged
  post-service security epoch.
- Discard cached sessions after confirmed-local-failure or unknown outcome;
  never turn either into a server-confirmed empty session list.
- Do not use decoded `readSession() == null` as definite absence.

Do not add sleeps, retries, serial flags, worker reductions, test exclusions or
live auth calls to diagnose a failure.

## Rollback

Rollback is a normal Git revert of the RW13 client changes, focused tests,
validator, evidence, documentation, regression registration and mechanical hash
refreshes. Do not reset, rebase, force-push or rewrite history.

## Closed gates

BUILD_READY, Play upload, human pilot, PR #7 merge, live provider/AI, real auth
or support traffic, real money, legal-owner decisions and the GitGuardian
owner-history review remain ungranted.
