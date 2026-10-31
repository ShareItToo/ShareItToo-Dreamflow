# S4BN Android Gradle-9 bridge floors - architecture

Status: technically verified on 23.08.2026 at implementation head
`09094df2d74c68293866160289179413830a627f`. This package changes only three
transitive Android bridge locks and the binary platform-reach proof. It changes
no direct Dart API, application permission, target SDK, production, Payment,
Store, Cloud/VPS/DNS, pilot or activation state.

## Bounded compatible correction

S4BM exposed Gradle-9/10 space-assignment warnings in resolved third-party
plugin build files. The first bounded S4BN probe selected the newest resolvable
SharedPreferences, URL-Launcher and ImagePicker Android bridges. That build
correctly failed before compilation because the resulting AndroidX Browser,
Activity and Core artifacts require compile SDK 36 and Android Gradle Plugin
8.9.1 or later. SIT remains on compile/target SDK 35 and AGP 8.6.0. The failed
probe was not retried, suppressed or accepted and none of those latest locks is
committed.

The retained solution uses the earliest upstream releases that state a
Gradle-9 deprecation correction while staying compatible with the existing
toolchain:

- `image_picker_android` 0.8.13+4;
- `shared_preferences_android` 2.4.15; and
- `url_launcher_android` 6.3.24.

Their exact Pub checksums are source-guarded. A direct all-warning Android build
passes 448 tasks and no Build-file warning remains for those three resolved
package paths. Other vendor and SDK warnings remain visible and separate.

## Platform reach remains explicit

The app continues to delegate `minSdk` to the pinned Flutter 3.41.7 toolchain.
Because dependency metadata alone cannot prove the final merged result, the
complete gate now locates the installed Android build tools and uses `aapt` on
the actual debug APK. It fails unless the merged binary declares exactly
`sdkVersion:'24'`. This validates the artifact after the same single Android
build; it adds no second build or device dependency.

## Verification

Fourteen focused bridge, lifecycle, warning, one-attempt and capacity contracts
pass. The complete local gate passes analyzer zero, 385 Flutter tests plus one
documented skip, Google-only, Web/Wasm, loopback smoke, one 448-task Android
build and the real APK minSdk-24 proof. Capacity starts at 4,501,568 KiB
effective and ends with 1,173,552 KiB free, 3,308,984 KiB generated and 4 KiB
growth.

Exact clean-host CI `32616408339` passes at the implementation head:

- repository-owned PostgreSQL-16 fresh-cluster proof: 31 seconds;
- Backend, audit, Compose and image build: 1:28;
- Flutter/Web/Android: 6:37;
- analyzer zero, 385 passes plus one documented skip, Google-only, positive
  Wasm result, Android success and `minSdk 24` binary proof; and
- signed-candidate construction and publication remain skipped.

S4BN closes `TD-RR-017`; all 17/17 deterministic exit contracts are retained.
External readiness remains 0/10 and P0B remains `HOLD` / `NO-GO`.
