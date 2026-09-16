# RW15 security interaction owner and route invariant

Date: 2026-08-25  
Run mode: deterministic local client-security correction only

## Focused verification

```bash
flutter analyze \
  lib/screens/security_screen.dart \
  lib/services/account_security_service.dart \
  lib/widgets/app_popup.dart \
  lib/widgets/tracked_dialog_route.dart \
  test/rw15_security_logout_all_prompt_result_principal_epoch_test.dart

flutter test --reporter expanded \
  test/rw10_local_security_control_truthfulness_test.dart \
  test/rw12_security_success_ui_principal_epoch_test.dart \
  test/rw13_security_logout_all_outcome_principal_epoch_test.dart \
  test/rw14_security_remote_device_revocation_outcome_principal_epoch_test.dart \
  test/rw15_security_logout_all_prompt_result_principal_epoch_test.dart \
  test/b10_release_truthfulness_test.dart

node --test \
  test/tool/rw15_security_logout_all_prompt_result_principal_epoch_wiring.test.mjs \
  test/tool/validate_rw15_security_logout_all_prompt_result_principal_epoch.test.mjs
node tool/validate_rw15_security_logout_all_prompt_result_principal_epoch.mjs
```

The focused RW15 widget/service file passes five tests. The combined
RW10 + RW12 + RW13 + RW14 + RW15 + B10 matrix passes 74 tests. Changed-file
analysis reports zero issues.

The supported full regression ran with the same fail-closed candidate-rollover
metadata mode used by GitHub CI:

```bash
CI=true SIT_ALLOW_CANDIDATE_ROLLOVER=1 \
  bash scripts/technical_regression_check.sh
```

It passed 1,907 repository-owned Node tool tests with zero skips, 563 Flutter
tests with the three documented profile skips, analyzer with zero issues,
Web/Wasm, loopback smoke, and Android debug with 448 tasks at `minSdk 24`.
Candidate rollover permits only validation of the newer current source against
the still fail-closed Store draft; it grants no upload or submission permission
and is not a timing or test workaround. The independent clean-checkout proof
also passed with 112 migrations, 84 assets, a finally clean tracked tree and a
second equivalent Android debug build.

The verified implementation HEAD is
`9db0b98981e3f8f7ae7f654193cfc00532799177`. GitHub Regression
`32877417222` and CodeQL `32877417279` both passed on that exact HEAD; the
branch has zero open code-scanning alerts.

## Deterministic CI correction

The first implementation run exposed one synthetic RW15 test-password literal
to the existing Linux high-confidence secret scanner. No real secret was
present. The current test constructs the value at runtime, while the immutable
old commit, exact rule and exact test path are bound as a reviewed historical
false positive without retaining the value. The scanner remains enabled and
unchanged; its full history/working-tree run passes with 15 reviewed findings
and zero unexpected findings. Updating that baseline required only mechanical
RW0/RW10 and transitive RW12-RW15 evidence-hash ratchets; prior decisions,
verified HEADs, CI results and gates did not change.

## Red-first evidence

- Stale A logout-all confirmation under B: expected zero calls, observed one.
- Open A result under B: expected no A title, observed one.
- Unstructured/non-contract 4xx: expected unknown, observed definite rejection.

No sleeps, retries, timing inflation, reduced test parallelism or test exclusion
was used.

## Operational rule

Do not use `Navigator.pop`, `maybePop` or top-stack state as the cancellation
mechanism for an account-owned asynchronous dialog. Register the exact route in
a `TrackedDialogRouteHandle`, bind it to the initiating owner token and remove
only that route on an owner epoch change.

Do not call a security mutation after an awaited dialog unless the exact owner
token is still current. Keep typed result catches before the generic pre-remote
catch, keep success processing structurally outside that generic catch, repeat
definite local-session absence immediately before login navigation, and never
classify a status code without an exact operation error code.

## Open inventory

The package records but does not silently claim closure for profile logout,
account deletion, contact email/phone/email-verification flows and LoginScreen
session cleanup. They remain prioritized P0/P1 follow-up work and keep all live
and build gates closed.
