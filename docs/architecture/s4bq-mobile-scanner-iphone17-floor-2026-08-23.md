# S4BQ MobileScanner iPhone 17 floor - architecture

Status: technically verified on 23.08.2026 at implementation head
`910e88824784a4a5127e36d82be47356e052f577`. This package changes only the
direct MobileScanner patch lock, its Privacy source binding and a permanent
dependency contract. It changes no application flow, permission, Android/iOS
platform floor, production, Payment, Store, Cloud/VPS/DNS, pilot or activation
state.

## Bounded upstream correction

The locked MobileScanner 7.1.3 predates the upstream Apple correction for an
iPhone 17 scanner-start crash. Version 7.1.4 is the immediately following
patch. Its production-plugin delta is bounded to the Apple pixel-format
selection and assignment-safe Android Gradle syntax; the other archive changes
are package/example files that do not enter the SIT binary, and the unchanged
public Dart API hash remains explicitly bound. Later 7.2 through 7.4 releases
change scanner behavior, Web backends and Android toolchain floors and are
outside this package.

The retained solution pins exactly 7.1.4 with Pub checksum
`c6184bf2913dd66be244108c9c27ca04b01caf726321c44b0e7a7a1e32d41044`.
It binds the reviewed Swift plugin, Android Build file and public Dart API
hashes. The Apple contract requires inspection of the output's available pixel
formats before selecting BGRA or either YCbCr fallback, and rejects the former
unconditional BGRA assignment. The Android side retains compileSdk 36, minSdk
23 and Java 17 while requiring assignment-safe Gradle fields. Application scope
remains exactly two scanner surfaces and two controllers in the guarded
pickup/return flows.

## Verification

Sixteen focused scanner, warning, one-attempt, PDF.js and capacity assertions
pass. The first complete gate correctly rejected the stale Privacy inventory
hash for the changed `pubspec.yaml`. The source inventory was rebound only to
the reviewed dependency declaration; all 58 Privacy/Retention contracts then
passed with the same draft and fail-closed decisions.

The identical complete local gate passes analyzer zero, 385 Flutter tests plus
one documented skip, Google-only, Web/Wasm, loopback smoke, one 448-task
Android build and the real APK minSdk-24 proof. The MobileScanner Build-file
warning path is absent. Capacity starts at 4,484,284 KiB effective and ends
with 1,112,148 KiB free, 3,309,060 KiB generated and 32 KiB generated growth.

Exact clean-host CI `32618368745` passes at the implementation head:

- repository-owned PostgreSQL-16 fresh-cluster proof: 29 seconds;
- Backend, audit, Compose and image build: 1:33;
- Flutter/Web/Android: 7:01;
- all four MobileScanner contracts, analyzer zero, 385 passes plus one
  documented skip, Google-only, positive Wasm result, loopback Web smoke,
  Android 445 tasks and `minSdk 24` binary proof;
- no MobileScanner Build-file or Settings-file warning path; and
- signed-candidate construction and publication remain skipped.

S4BQ closes `TD-RR-020` for this dependency patch and deterministic exit. The
source-bound Apple correction is not physical iPhone evidence; signed Apple
candidate construction and device validation remain separate external gates.
External readiness remains 0/10 and P0B remains `HOLD` / `NO-GO`.
