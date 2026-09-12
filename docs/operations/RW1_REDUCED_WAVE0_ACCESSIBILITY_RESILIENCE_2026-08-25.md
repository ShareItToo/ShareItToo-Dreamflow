# RW1 reduced Wave-0 accessibility and resilience matrix

Status: **VERIFIED — REGRESSION AND CODEQL GREEN**

Baseline closure commit: `ccdc1ec`

## Retained commands

```text
flutter analyze \
  lib/screens/create_listing_screen.dart \
  lib/screens/wishlists_screen.dart \
  lib/widgets/app_popup.dart \
  lib/widgets/listing_options_dialog.dart \
  test/reduced_wave0_accessibility_resilience_test.dart

flutter test --reporter expanded \
  test/reduced_wave0_accessibility_resilience_test.dart

flutter test --reporter expanded \
  --dart-define=SIT_STAGE_A_NON_BINDING_PILOT=true \
  --dart-define=SIT_BLUE_OCEAN_LISTING_ASSISTANT=true \
  test/reduced_wave0_accessibility_resilience_test.dart
```

Focused results:

- changed-file analyzer: zero issues;
- ordinary profile: five passed and one documented exact-profile skip;
- exact Stage-A/Blue-Ocean profile: six passed;
- adjacent AppPopup, Mietkorb, persistence, large-text and RW0 journey set:
  16 passed with two documented profile skips;
- adjacent async/lifecycle source-contract set: 16 passed.

The exact-profile command is permanently invoked by
`scripts/technical_regression_check.sh`. No serial-test, retry, relaxed timing,
smaller viewport substitution or CI-only bypass is part of the fix.

The complete candidate-rollover technical regression passes with the same
committed test and build path, including Web/Wasm smoke, Android debug assembly
and the repository resource guard.

## Exact GitHub closure

- RW1 implementation commit:
  `eef58764ec9057748c2124689a40e9d96553acc6`;
- first Regression `32793801223`: the clean-checkout execution completed, but
  its final validator rejected the valid `2026-08-25` execution date because it
  was hard-coded to the retained historical artifact's `2026-08-24` date;
- deterministic validator correction:
  `13bf29bce7911bf95e339ff61744c678aeafdce4`, with valid ISO calendar-date tests
  and the historical artifact still bound to its exact date;
- exact correction-head Regression `32795007748`: success, including Backend,
  PostgreSQL, Flutter/Android and the 14:32 clean-checkout job;
- exact correction-head CodeQL `32795007746`: success;
- open GitHub code-scanning alerts after both workflows: zero.

The correction is a permanent deterministic rule, not a retry, serial-test,
rate-limit, timing or local-toolchain workaround.

## Rollback

The package is additive UI layout/test work. A rollback may revert the bounded
RW1 implementation commit before any successor depends on it. It must revert
the tests and regression wiring together; retaining an unscrollable dialog or
fixed compact action row while removing its regression is not an acceptable
rollback.

## Gate truth

`BUILD_READY`, `PLAY_UPLOAD_APPROVED`, `HUMAN_PILOT_ACTIVATED`, external AI,
Payment and `PR7_MERGE_APPROVED` remain ungranted. The separate historical
GitGuardian owner review remains open. Full local regression and exact GitHub
Regression/CodeQL verification are green and do not authorize any live action.
