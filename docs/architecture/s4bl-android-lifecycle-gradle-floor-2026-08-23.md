# S4BL Android lifecycle Gradle floor - architecture

Status: technically verified on 23.08.2026 at implementation head
`fcd2a0d761c6b1e70011c29b1561eac4f47a09e1`. This package is limited to one
transitive Android lifecycle bridge, its deterministic toolchain contract and
the permanent registration of the S4BJ/S4BK dependency guards. It changes no
application behavior, permission, account, production, Payment, Store,
Cloud/VPS/DNS, pilot or activation state.

## Bounded dependency decision

An Android `--warning-mode all` inventory attributed the Gradle deprecation
warnings to Flutter/plugin or local SDK toolchain paths, not to an SIT-owned
Gradle script. The narrowest safe source improvement was
`flutter_plugin_android_lifecycle`: the prior 2.0.30 package still used the
upstream Groovy form that reports Gradle-9/10 syntax deprecations. The reviewed
2.0.35 release uses Kotlin build files and is compatible with the repository's
pinned Flutter 3.41.7 toolchain.

Only this transitive lock changed: 2.0.30 to 2.0.35, with SHA-256
`3854fe5e3bff0b113c658f260b90c95dea17c92db0f2addeac2e343dd9969785`.
No direct dependency floor, Android Gradle Plugin, Gradle wrapper, Kotlin,
compile SDK or target SDK was broadly upgraded. A source contract binds the
exact lifecycle lock and checksum, both local and CI Flutter 3.41.7 pins, and
its own permanent full-gate registration.

The all-warning Android build no longer reports the lifecycle package's former
Groovy syntax deprecation. Its separate legacy manifest `package=` warning, the
local SDK XML version warning and other third-party manifest, deprecated-API or
unchecked-cast warnings remain visible and are not claimed closed.

## Retained dependency guards

The review also found that the focused S4BJ file-picker security contract and
S4BK PDF/WebAssembly contract were not yet called by the complete regression
runner. Both are now permanent full-gate steps and each test asserts its own
registration. The lifecycle contract is registered beside them. A future
lock, API, Wasm or runner regression therefore fails the ordinary complete
gate instead of relying on a package-specific manual command.

## Verification

Eleven focused Node contracts pass, including Android photo-policy retention.
One direct local `--warning-mode all` Android build passes all 448 tasks. The
complete local gate passes in one unchanged execution with analyzer zero, 385
Flutter tests plus one documented skip, the separate Google-only test, Web
build/Wasm dry run, loopback smoke and one direct 448-task Android build. It
starts with 4,646,844 KiB effective capacity and ends with 1,330,284 KiB free,
3,308,848 KiB generated and 12 KiB generated growth.

Exact clean-host CI run `32614834455` passes at the implementation head:

- repository-owned PostgreSQL-16 fresh-cluster proof: 39 seconds;
- Backend, dependency/history audit, Compose and image build: 1:22;
- Flutter/Web/Android: 6:48;
- log: all three dependency contracts, analyzer zero, 385 passes plus one
  documented skip, separate Google-only pass, `Wasm dry run succeeded` and
  Android `BUILD SUCCESSFUL`; and
- API-image publication and signed candidate: skipped.

S4BL closes `TD-RR-015`; all 15/15 deterministic exit contracts are retained.
External readiness remains 0/10 and P0B remains `HOLD` / `NO-GO`.
