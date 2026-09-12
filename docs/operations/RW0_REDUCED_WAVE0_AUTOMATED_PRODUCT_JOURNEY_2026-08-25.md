# RW0 reduced Wave-0 automated product journey

Status: **VERIFIED — REGRESSION AND CODEQL GREEN**

Baseline HEAD: `4937a88ff07dd6378e1c52ca4f264e564a669ef4`

## Outcome

RW0 now retains one synthetic, local-only journey for the complete R17 reduced
participant surface: explicit listing publication, search, Gemerkt, project,
non-reserving cart, informative Stage-A review, structured feedback and process
restart. It also retains deterministic missing/corrupt/torn-storage checks.

The run found and permanently corrected six product/security gaps documented in
`docs/architecture/rw0-reduced-wave0-automated-product-journey-2026-08-25.md`.
No retry, reduced concurrency, timing relaxation or CI-only bypass was added.

## Retained commands

```text
flutter analyze
flutter test --reporter expanded
flutter test --reporter expanded \
  --dart-define=SIT_STAGE_A_NON_BINDING_PILOT=true \
  --dart-define=SIT_BLUE_OCEAN_LISTING_ASSISTANT=true \
  test/reduced_wave0_product_journey_test.dart
node --test test/tool/rw0_reduced_wave0_journey_wiring.test.mjs
node tool/validate_privacy_disclosures.mjs
node tool/validate_retention_deletion_readiness.mjs
```

Verified local results:

- analyzer: zero issues;
- default Flutter suite: 400 passed, two documented profile skips;
- exact Reduced Wave-0 profile: one passed;
- non-destructive catalog tests: five passed;
- cart service/surface focused set: seven passed;
- RW0 wiring: seven passed;
- privacy and retention validator tests: 70 passed;
- privacy and retention manifests: valid and still honestly draft/blocked.
- full technical regression in candidate-rollover CI metadata mode: passed,
  including
  every retained package validator, PostgreSQL-backed checks, Flutter analyzer,
  the 400-test default suite with two documented profile skips, both exact
  special profiles, Web/Wasm smoke and the 448-task Android debug build.
- exact implementation and CI-correction head:
  `ce37ecc89af1a5176d4afaa608ddd1f3552d2512`;
- GitHub Regression run `32790896732`: passed, including Backend, Flutter,
  PostgreSQL and clean-checkout reproducibility;
- GitHub CodeQL workflow `32790896756`: passed, with zero open code-scanning
  alerts.

## Gate truth

`BUILD_READY`, `PLAY_UPLOAD_APPROVED`, `HUMAN_PILOT_ACTIVATED`, external AI,
Payment and `PR7_MERGE_APPROVED` remain ungranted. The historical GitGuardian
owner review `R17_GITGUARDIAN_HISTORY_REVIEW_COMPLETE` remains a separate P0
gate and no finding value was inspected.

GitGuardian was skipped on the exact verification head. Its historical owner
review remains explicitly open and separate; RW0 neither inspects a finding
value nor treats the skipped check as green. No live gate is authorized.
