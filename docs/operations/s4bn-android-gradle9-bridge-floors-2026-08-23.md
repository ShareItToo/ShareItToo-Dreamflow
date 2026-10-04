# S4BN Android Gradle-9 bridge floors

Status: technically verified, non-live.

## Retained checks

Run from the repository root:

```sh
node --test \
  test/tool/android_gradle9_bridge_floor.test.mjs \
  test/tool/android_lifecycle_gradle_floor.test.mjs \
  test/tool/android_gradle_warning_visibility.test.mjs \
  test/tool/android_debug_single_attempt_wiring.test.mjs \
  test/tool/release_host_capacity_guard_wiring.test.mjs
CI=true SIT_ALLOW_CANDIDATE_ROLLOVER=1 \
  bash scripts/technical_regression_check.sh
```

Retain the exact transitive locks and checksums for
`image_picker_android` 0.8.13+4, `shared_preferences_android` 2.4.15 and
`url_launcher_android` 6.3.24 until a separately reviewed Android toolchain
package can absorb newer compile-SDK/AGP requirements. Do not substitute a
Pub-cache patch, dependency override, warning suppression or an unreviewed
compile/target SDK change.

After the one direct Android debug build, the complete gate must inspect
`build/app/outputs/flutter-apk/app-debug.apk` with the newest available `aapt`
and require `sdkVersion:'24'`. A missing tool, missing APK or different merged
floor is a release-gate failure. Do not replace the binary proof with a source
assumption or a generated-file snapshot.

Retained evidence:

- implementation head:
  `09094df2d74c68293866160289179413830a627f`;
- focused bridge/lifecycle/warning/one-attempt/capacity contracts: 14/14;
- direct all-warning Android proof: 448 tasks, no warning location for the
  three updated bridges and merged minSdk 24 / targetSdk 35;
- complete local gate: analyzer zero, 385 passes plus one documented skip,
  Google-only, Web/Wasm, loopback smoke, Android 448 tasks and binary floor;
- local capacity: 4,501,568 KiB effective at start, 1,173,552 KiB free,
  3,308,984 KiB generated and 4 KiB growth at completion; and
- exact CI `32616408339`: PostgreSQL 31 seconds, Backend 1:28 and
  Flutter/Web/Android 6:37, with signing
  and publication skipped.

The intentionally failed newest-resolvable probe remains diagnostic evidence:
it required compile SDK 36 and AGP 8.9.1 or later. Do not turn that finding into
a broad toolchain migration inside this package. Remaining third-party warning
paths stay visible for later bounded compatibility work. No external login,
provider setup, paid service, production, Payment, Store, Cloud/VPS/DNS, merge,
pilot or activation action was performed. External readiness remains 0/10 and
P0B remains `HOLD` / `NO-GO`.
