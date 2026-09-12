# WP02 / WP01 — Pixel candidate 2026090402 preparation

Status: **PREPARATION — NOT BUILT / NOT INSTALLED**.

Source authority is `/Users/walidchraibi/Worktrees/SIT-master-workflow-20260808`,
branch `codex/master-workflow-20260808`, preparation base
`8e0d9f99b49d65e9bd4e5ff4d1d1cd19304a5fc4` (0/0 with origin).
Its exact Regression `33817737171` and CodeQL `33817737109` passed. This is not
a substitute for the future candidate HEAD's CI.

## Candidate binding

- `com.shareittoo.app`, `1.0.0+2026090402`.
- Highest build in retained private archives and all local Git refs was
  2026090401; 2026090402 is strictly higher and unused there. This is a direct
  private APK build, not a Play Console maximum or upload claim.
- Final source is the clean committed preparation HEAD, embedded by the normal
  signed builder and recorded in its immutable private archive.
- Internal channel and `https://staging.shareittoo.com/api/v1` only.
- Existing protected `shareittoo-staging` Firebase and canonical certificate
  `098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4`.
- Google enabled, Facebook/Apple disabled; existing non-binding closed-pilot
  `heilbronn_wave0`, Blue Ocean, booking groups, planner, supply and listing-set
  technical flags remain unchanged. No additional diagnostic/provider flags.
- AGP 8.13.2, Kotlin 2.3.10, Gradle 8.13, Flutter 3.41.7, Java 17, minSdk 24,
  target/compile SDK 36. Use the isolated official SDK installation described
  in `WP02_ANDROID_SDK_COMPATIBILITY_2026-09-04.md` with both per-process SDK
  variables and the established private cache wrapper.

Preparation changes only pubspec's version, matching client-build fallback,
their exact dependent source hashes, one SDK-selection regression and evidence.
Hash propagation verifies every non-hash claim and validator assertion remains
unchanged. No functional app, dependency, provider, legal/privacy or security
threshold change is included beyond the already committed toolchain fix.

## Preparation verification

The complete original-checkout gate passes with both selected-SDK variables
and the guarded external cache: 2,166 tool tests; 665 default Flutter passes
and 33 explicit-profile skips; all configured additional profiles; analyzer
zero; Web debug and Wasm dry run; loopback smoke; Android debug and R11 binary
surface (14 permissions, eight exports, minSdk 24). Android took 42 seconds,
471 tasks, 466 executed. The committed scanner replay reports no SDK XML or
Kotlin metadata findings. This is not yet a signed or physical-device pass.

Log `/tmp/sit-wp02-0402-preparation-full-regression.log`, SHA-256
`3b10bbffe0fc2f9dfe7ef509486a03afc8abbd4dd85e5a3ae23244703aa029ab`.
Normal capacity: free 11,659,452 -> 8,457,976 KiB; generated
334,980 -> 3,499,816 KiB. All fixed bounds and cache-wrapper checks passed.
No further cache deletion, test narrowing or memory/parallelism change occurred.

Configured preflight passes with canonical signing and original Android
Firebase Staging inputs; no artifact was generated. Apple remains unconfigured
and Store submission remains disallowed. Preflight log SHA-256:
`a896eb4cd9f95f8ca73c869ba1a23e751e024213f58ad077c0f49fa2ff324a1b`.
Backend tests pass 795 plus two expected skips, and syntax checks pass.
The separate normal dependency audit is still running after an npm advisory
POST failure and its existing bounded retry; no audit pass is inferred.
Full-history/working-tree secret scan has zero new high-confidence findings
and 21 exact historical baseline matches. A separate 26-file normalized
comparison proves only version strings and SHA bindings changed in those
files; the new test and explanatory documents are separately reviewed.

## Required closure sequence

1. Complete preparation full local regression, preflight and secret scan;
   commit and push only reviewed paths. Require the new exact CI including
   clean checkout and CodeQL.
2. On that clean HEAD run the complete local gate followed by the normal
   signed AAB/APK archive lifecycle using the same SDK and guarded cache.
   Preserve unchanged capacity thresholds and before/after measurements;
   no intervening manual cache purge or retry workaround.
3. Verify both artifacts, canonical signatures, source/version/API/profile,
   SDK and permission/component surface, binary privacy, hashes and bundle
   structure. Reject SDK XML or Kotlin-analysis diagnostics even on exit zero.
4. Only after these checks, use the existing same-certificate, strictly-higher,
   replace-only Pixel updater; verify installed bytes and retained app data.
   No uninstall, downgrade, data-clear or OnePlus access.
5. Continue authenticated Pixel smoke and no-SMS preflight. A fresh physical
   SMS completion test still needs a current owner-ready window. Meta's exact
   creation confirmation stays pending; do not duplicate the existing notice.

Frozen 2026090401 and installed 2026090307 retain their own evidence. No Store,
production, billing, new provider, public registration, real payment, history
rewrite or PR merge. The encompassing Staging Goal remains active.
