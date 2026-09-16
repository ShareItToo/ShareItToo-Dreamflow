# WP163 — Current-source canonical signed Internal candidate

Status: **BUILD READY LOCALLY / EXACT GITHUB VERIFICATION PENDING**.

The current source candidate is bound to branch `codex/master-workflow-20260808`
and source commit `707d95e93c463ad4bbb0adbf382526d8869992c5`. The strictly newer
unused version is `1.0.0+2026091601`, package `com.shareittoo.app`, Internal
channel, staging API `https://staging.shareittoo.com/api/v1`, compile/target SDK
36 and min SDK 24.

The canonical signed AAB and APK are retained in the owner-only local archive
named `2026091601-707d95e93c463ad4bbb0adbf382526d8869992c5`:

- AAB: 138,844,325 bytes, SHA-256
  `c5cc29eea8d5cccdb1913e9247528a784d945010c433d0125b3e39bdf563da7c`
- APK: 199,976,443 bytes, SHA-256
  `32e2e28008e19e11d1fc00497c3f7f08f60eb42c48c0dea93878f8ae6670e464`
- upload certificate SHA-256:
  `098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4`
- privacy report SHA-256:
  `2fa95150f403ce78a5be94764bd4df69654972973e521a60d394e8732153166c`

The isolated official CLI-19 SDK and private APFS build profile were selected
without changing the global SDK. Both signed artifacts passed package/version,
signature, ZIP-structure and binary privacy verification. The complete local
technical regression passed, including tool inventory, backend/PostgreSQL,
Flutter tests/analyzer, Web/Wasm dry run, loopback smoke, Android debug build
and Android surface audit. No device was contacted and no Play upload or
activation occurred.

The remaining bounded action is exact-head GitHub Regression and CodeQL after
the evidence commit is pushed. Store, tester, production, provider, payment,
Firebase Console, cloud/VPS/DNS, device and PR-merge changes remain out of
scope. Stop at `BUILD_READY` after the GitHub readback.
