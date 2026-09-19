# S4BO PathProvider Android Gradle floor - architecture

Status: technically verified on 23.08.2026 at implementation head
`620b7298847fc2732b789be731a17adfb027adfd`. This package changes only the
transitive `path_provider_android` lock and its permanent regression contract.
It changes no direct Dart API, application permission, Android platform floor,
production, Payment, Store, Cloud/VPS/DNS, pilot or activation state.

## Bounded compatible correction

S4BM's all-warning Android build attributed a Groovy Gradle-9/10
space-assignment warning to resolved `path_provider_android` 2.2.17. Upstream
2.2.18 raises its Android Gradle Plugin and Flutter/Dart floors, and 2.2.19 is
the first subsequent release that explicitly resolves Gradle-9 deprecations.
The later 2.3.x line also migrates the bridge to an internal JNI model and is
therefore outside this narrow package.

The retained solution locks only `path_provider_android` 2.2.19 with exact Pub
checksum
`3b4c1fc3aa55ddc9cd4aa6759984330d5c8e66aa7702a6223c61540dc6380c37`.
The reviewed package floor is compatible with the pinned local and CI Flutter
3.41.7 toolchain. No dependency override, Pub-cache patch, warning suppression
or compile/target-SDK migration remains in the repository.

The direct all-warning Android build passes 448 tasks. No Build-file warning
location remains for the resolved PathProvider package; other vendor and SDK
warnings stay visible and separate. The resulting APK still declares merged
minSdk 24 and targetSdk 35.

## Verification

Seventeen focused warning, bridge, lifecycle, one-attempt and capacity
contracts pass. The complete local gate passes analyzer zero, 385 Flutter
tests plus one documented skip, Google-only, Web/Wasm, loopback smoke, one
448-task Android build and the real APK minSdk-24 proof. Capacity starts at
4,480,552 KiB effective and ends with 1,154,648 KiB free, 3,309,024 KiB
generated and zero generated growth.

Exact clean-host CI `32616929359` passes at the implementation head:

- repository-owned PostgreSQL-16 fresh-cluster proof: 39 seconds;
- Backend, audit, Compose and image build: 1:23;
- Flutter/Web/Android: 7:07;
- analyzer zero, 385 passes plus one documented skip, Google-only, positive
  Wasm result, Web smoke, Android success and `minSdk 24` binary proof;
- the PathProvider Build-file warning location is absent; and
- signed-candidate construction and publication remain skipped.

S4BO closes `TD-RR-018`; all 18/18 deterministic exit contracts are retained.
External readiness remains 0/10 and P0B remains `HOLD` / `NO-GO`.
