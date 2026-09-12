# ADR-042: P0B Current-Source Signed Device Evidence

Status: Android evidence accepted on 2026-08-21; iOS and overall gate remain
blocked.

## Context

P0A could build Android debug but could not replace the installed release app
with a debug-signed APK without deleting data. The later explicitly authorized
token permits a current-source signed candidate and bounded physical evidence,
but forbids Store submission. Protected Android/iOS Firebase files and the
canonical Android upload key are available locally.

## Decision

- Build an internal-staging Android AAB/APK bound to exact source commit
  `e8cd4a99d95f74c279afa86a24a9a61df6ee98c8`.
- Require canonical signing, configured Android Firebase and a passed binary
  privacy scan; archive exact bytes privately with owner-only permissions.
- Install only with non-destructive `adb install -r`; never uninstall, reset
  data or force downgrade to make evidence pass.
- Verify installed bytes, version and cold launch without capturing a raw
  device ID, screenshot or user content.
- Record direct internal install as distinct from Play/Store installation.
- Do not invent iOS evidence. Keep it blocked when full Xcode, CocoaPods and a
  verifiable physical iOS device are absent.
- Keep production, Cloud, Payment, Provider, Store and public activation false.

## Consequences

The earlier Android signature blocker is resolved safely for a correctly
signed candidate: the update installed and preserved data. Android physical
current-source evidence is now real and hash-bound. iOS remains a hard blocker,
so the combined signed-device gate is not ready.

The private archive is intentionally outside Git and non-overwriting. Its
local validator verifies bytes without disclosing the path. Repository
rollback does not delete that archive or modify the installed app.
