# S4BQ MobileScanner iPhone 17 floor

Status: technically verified, non-live.

## Retained checks

Run from the repository root:

```sh
node --test \
  test/tool/mobile_scanner_iphone17_floor.test.mjs \
  test/tool/android_gradle_warning_visibility.test.mjs \
  test/tool/android_debug_single_attempt_wiring.test.mjs \
  test/tool/release_host_capacity_guard_wiring.test.mjs
node tool/validate_privacy_disclosures.mjs
CI=true SIT_ALLOW_CANDIDATE_ROLLOVER=1 \
  bash scripts/technical_regression_check.sh
```

Retain the exact MobileScanner 7.1.4 declaration, lock checksum and resolved
Swift/Android/public-API hashes until a separately reviewed scanner package
replaces them. The Apple adapter must select from actually available pixel
formats before setting `videoSettings`; the former unconditional BGRA
assignment must not return. Keep the two current scanner surfaces and two
controllers review-bound.

The Android adapter must retain assignment-safe group, version, compileSdk,
minSdk, Java and Kotlin fields. The complete all-warning build must remain a
single attempt, print other vendor warnings unchanged and show no MobileScanner
Build-file or Settings-file warning location. A source hash alone is not Apple
device evidence.

Retained local evidence:

- implementation head:
  `910e88824784a4a5127e36d82be47356e052f577`;
- focused scanner/warning/one-attempt/PDF.js/capacity contracts: 16/16;
- expected first full-gate refusal on stale `pubspec.yaml` Privacy inventory,
  followed by 58/58 Privacy/Retention contracts after exact rebinding;
- complete gate: analyzer zero, 385 passes plus one documented skip,
  Google-only, Web/Wasm, loopback smoke, Android 448 tasks and binary minSdk
  24;
- direct all-warning confirmation: MobileScanner warning path absent, 448 tasks;
  and
- local capacity: 4,484,284 KiB effective at start, 1,112,148 KiB free,
  3,309,060 KiB generated and 32 KiB growth at completion; and
- exact CI `32618368745`: PostgreSQL 29 seconds, Backend 1:33 and
  Flutter/Web/Android 7:01, with all four scanner contracts, analyzer zero,
  385 passes plus one documented skip, Web/Wasm, Android 445 tasks, binary
  minSdk 24, no MobileScanner warning path, and signing/publication skipped.

Do not replace this evidence with an unreviewed 7.2+ update, dependency
override, Pub-cache patch, warning filter, retry, reduced suite or a claim that
source inspection equals physical iPhone validation. No external login, paid
service, production, Payment, Store, Cloud/VPS/DNS, merge, pilot or activation
action was performed. External readiness remains 0/10 and P0B remains `HOLD` /
`NO-GO`.
