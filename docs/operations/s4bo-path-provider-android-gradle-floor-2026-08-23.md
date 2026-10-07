# S4BO PathProvider Android Gradle floor

Status: technically verified, non-live.

## Retained checks

Run from the repository root:

```sh
node --test \
  test/tool/android_path_provider_gradle_floor.test.mjs \
  test/tool/android_gradle9_bridge_floor.test.mjs \
  test/tool/android_lifecycle_gradle_floor.test.mjs \
  test/tool/android_gradle_warning_visibility.test.mjs \
  test/tool/android_debug_single_attempt_wiring.test.mjs \
  test/tool/release_host_capacity_guard_wiring.test.mjs
CI=true SIT_ALLOW_CANDIDATE_ROLLOVER=1 \
  bash scripts/technical_regression_check.sh
```

Retain the exact transitive `path_provider_android` 2.2.19 lock and checksum
until a separately reviewed dependency or Android toolchain package replaces
it. The local and CI Flutter floor must remain at least the reviewed 3.41.7.
Do not substitute a dependency override, Pub-cache patch, warning suppression,
retry or unreviewed compile/target-SDK migration.

The complete gate must retain the PathProvider contract, the single direct
Android all-warning build and S4BN's real `aapt` check of the resulting debug
APK. A missing package contract, warning ownership proof, build artifact or
merged minSdk-24 proof is a release-gate failure.

Retained evidence:

- implementation head:
  `620b7298847fc2732b789be731a17adfb027adfd`;
- focused warning/bridge/lifecycle/one-attempt/capacity contracts: 17/17;
- direct all-warning Android proof: 448 tasks, no PathProvider Build-file
  warning location and merged minSdk 24 / targetSdk 35;
- complete local gate: analyzer zero, 385 passes plus one documented skip,
  Google-only, Web/Wasm, loopback smoke, Android 448 tasks and binary floor;
- local capacity: 4,480,552 KiB effective at start, 1,154,648 KiB free,
  3,309,024 KiB generated and zero growth at completion; and
- exact CI `32616929359`: PostgreSQL 39 seconds, Backend 1:23 and
  Flutter/Web/Android 7:07, with signing and publication skipped.

The later PathProvider 2.3.x JNI migration remains outside this package and
requires its own API/runtime review. Remaining third-party warning paths stay
visible for later bounded compatibility work. No external login, provider
setup, paid service, production, Payment, Store, Cloud/VPS/DNS, merge, pilot
or activation action was performed. External readiness remains 0/10 and P0B
remains `HOLD` / `NO-GO`.
