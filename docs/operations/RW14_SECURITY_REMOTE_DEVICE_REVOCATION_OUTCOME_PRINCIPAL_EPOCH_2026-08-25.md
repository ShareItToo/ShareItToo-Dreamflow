# RW14 remote-device revocation outcome and principal epoch

Date: 2026-08-25
Run mode: deterministic local client-security correction only

## Supported focused checks

```bash
flutter analyze \
  lib/screens/security_screen.dart \
  lib/services/account_security_service.dart \
  test/rw10_local_security_control_truthfulness_test.dart \
  test/rw14_security_remote_device_revocation_outcome_principal_epoch_test.dart
flutter test --reporter expanded \
  test/rw10_local_security_control_truthfulness_test.dart \
  test/rw12_security_success_ui_principal_epoch_test.dart \
  test/rw13_security_logout_all_outcome_principal_epoch_test.dart \
  test/rw14_security_remote_device_revocation_outcome_principal_epoch_test.dart \
  test/b10_release_truthfulness_test.dart
node --test \
  test/tool/rw14_security_remote_device_revocation_outcome_principal_epoch_wiring.test.mjs \
  test/tool/validate_rw14_security_remote_device_revocation_outcome_principal_epoch.test.mjs
node tool/validate_rw14_security_remote_device_revocation_outcome_principal_epoch.mjs
```

The focused RW14 matrix passes 11 Flutter tests. The combined security and B10
matrix passes 69 tests.

The closure gate is the supported full regression under standard parallelism:

```bash
CI=true SIT_ALLOW_CANDIDATE_ROLLOVER=1 \
  bash scripts/technical_regression_check.sh
```

The Mac-mini `CI=true` path is metadata-only and cannot prove a private release
AAB, Store upload or physical-device result.

At implementation head `38a89e67acefcdc1f756dabc7febd5f1ab9f9813`, this full
regression passed with standard parallelism: 1,897 repository-owned tool tests
passed with zero skips, 558 Flutter tests passed with the three documented
profile skips, analyzer reported zero issues, Web/Wasm and loopback smoke
passed, and Android debug passed 448 tasks at `minSdk 24`. No timing, retry,
parallelism-reduction or test-exclusion workaround was used.

GitHub Regression run `32868503103` and CodeQL run `32868503117` both passed
against that exact implementation head, with zero open GitHub code-scanning
alerts at closure recording time.

## Operational invariant

- Bind a device confirmation to the security epoch before opening its dialog.
- Bind every typed result to the exact normalized target session id.
- Reserve `Geräteabmeldung abgelehnt` for an allowlisted structured rejection.
- Preserve `Gerät serverseitig abgemeldet` for a confirmed remote completion
  whose local/principal finalization cannot be trusted.
- Use `Ergebnis der Geräteabmeldung unklar` for timeout, transport, 5xx and
  invalid-response paths; do not recommend a blind repeat.
- Present no Account A result unless the service proves A still current and the
  UI operation epoch is unchanged; dismiss an open A result when B activates.
- Convert typed failure outcomes to an explicit list error plus reload action,
  never a server-confirmed empty list.
- Never revoke the current session through the remote-device path and never
  clear Account A or successor Account B credentials here.

Do not add sleeps, retries, serial flags, worker reductions, test exclusions or
live auth calls to diagnose a failure.

## Rollback

Rollback is a normal Git revert of the RW14 client changes, tests, validator,
evidence, documentation, regression registration and mechanical hash refreshes.
Do not reset, rebase, force-push or rewrite history.

## Closed gates

BUILD_READY, Play upload, human pilot, PR #7 merge, live provider/AI, real auth
or support traffic, real money, legal-owner decisions and the GitGuardian
owner-history review remain ungranted.
