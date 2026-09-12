# WP02 / WP01 — signed Pixel candidate 2026090401

Status: **LOCAL BUILD VERIFIED / EXACT CI AUDIT BLOCKED / NOT INSTALLED**.
Observed 2026-09-04 on the Mac mini. The overall Staging Goal stays active;
WP01 physical SMS completion and WP02 provider setup are not closed.

## Frozen candidate

- Worktree: `/Users/walidchraibi/Worktrees/SIT-master-workflow-20260808`.
- Branch: `codex/master-workflow-20260808`.
- Clean, pushed build source: `c0c4a0d13761d995e2aba8fed13edf0be481f90d`.
- `com.shareittoo.app`, `1.0.0+2026090401`, Internal Staging.
- API: `https://staging.shareittoo.com/api/v1`.
- Original protected Firebase file matches `shareittoo-staging` and exactly
  one intended Android client; owner-only regular file, no contents disclosed.
- Google enabled; Apple/Facebook disabled. Existing non-binding closed-pilot
  `heilbronn_wave0`, Blue Ocean and G3/G4/G5 technical surfaces retained.
  No new diagnostic activation, provider setup or real payment.
- APK: 136,024,383 bytes, SHA-256
  `1cdb31264cd5518d8d2c83118a105d632648aeaed4e05442165a3779ba295d7d`.
- AAB: 109,179,798 bytes, SHA-256
  `c5a8fbadc429639fde6e5b91833f8c608650bcc75c06cc3ac83329f8f99900a2`.
- Both signatures independently match canonical certificate SHA-256
  `098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4`.
- Private four-file archive:
  `/Users/walidchraibi/Library/Application Support/ShareItToo/release/android/2026090401-c0c4a0d13761d995e2aba8fed13edf0be481f90d`.

APK/AAB ZIP integrity, JAR/APK signatures, exact archive hashes and profile,
and bundletool 1.18.1 structural validation all pass. minSdk 24, target/compile
SDK 36, release not debuggable, backup/cleartext disabled. Fourteen permissions
match the existing contract. The complete manifest component and intent trees
match the previous signed 2026090307 archive, including eight exported
components. Component-tree SHA-256:
`9177f1287ce73cdc047fb8f1caaa34058a0beb1cc9d54df801177ac86b9ccc8b`.
The candidate's own binary privacy scan has zero findings. These are new-byte
checks, not inherited physical acceptance.

## Local and GitHub verification

The metadata preparation gate and then the complete clean-candidate-HEAD gate
both pass: 2,156 tools; 665 default Flutter passes with 33 explicit-profile
skips; shared SDK/phone 17, isolated cold initialization 1 and native-provider
10 with seed 7; all other profiles; analyzer zero; Web debug, successful Wasm
dry run, loopback smoke, Android debug and security surface checks. This is
not a claim of a separately executed standalone Wasm runtime.

Clean-head gate log `/tmp/sit-wp02-0401-clean-head-full-regression.log`, SHA-256
`dcd7de1e4ff051a01eaf1c1803c994ef3ee54d60d2f0e2409fb7626689140493`.
Signed build log `/tmp/sit-wp02-0401-signed-release.log`, SHA-256
`e5c286d2487f0cdf74a3658e0e9623294e2706c864cdba748ebbb0b2aa0936de`.

Exact CodeQL `33814479602` passes. Code-scanning open alerts: zero on readback.
Exact Regression `33814479652` finished FAILED: Backend and clean-reproducibility
jobs failed at npm's advisory POST timeout after existing retries; PostgreSQL
and Flutter passed, API-image publication was skipped. Backend completed 797 tests and
syntax checks before the unavailable audit. No clean-reproducibility or
security-audit pass is claimed. The earlier c259027d run failed the same way.
The independent local unchanged audit also timed out, and a one-shot public
package GET returned HTTP 200 while the advisory POST timed out. This narrows
the observed failure to the audit request; it is not evidence of bad owner
authentication, an actual advisory, or an authoritative worldwide outage.

No audit suppression, new retry loop, longer timeout, dependency downgrade,
baseline waiver or false success was introduced. A later exact-CI rerun must
be recorded and pass after availability returns, before device clearance.

## Normal host lifecycle and remaining debt

The clean full gate and signed builder ran in sequence through the same
guarded dedicated cache profile, with no manual purge, retry or global-cache
fallback between them. Main source and protected signing/Firebase inputs
remained in place. Both retired global engine caches stayed absent; verified
recoverable copies remain on the dedicated APFS volume.

- Clean gate: free 2,047,192 -> 2,053,420 KiB; generated
  3,691,644 -> 3,691,640 KiB; all fixed bounds passed.
- Signed builder: free 2,053,332 -> 5,467,740 KiB; generated
  3,691,640 -> 41,632 KiB after normal builder-owned cleanup and archiving.
- Subsequent reserves: main 5,466,616 KiB, APFS build volume 21,550,076 KiB,
  physical backing 1,930,639,872 KiB. Wrapper mount/reserve checks passed
  before and after both commands. No protected archive was removed.

The candidate-bound local capacity lifecycle is now proven. Final host-debt
closure still retains the exact-CI requirement above. The separate Kotlin
metadata diagnostic recurred in this signed build: Firebase Auth 24.2.0
metadata 2.3.0 against compiler expectation 2.1.0. No suppression was used;
build exit 0 does not mean this toolchain debt is resolved. It needs a bounded,
supported alignment and its own deterministic clean-build proof.

## Pixel read-only preflight and next action

At `2026-09-03T22:55:15.967Z`, only Pixel 7 Pro (Android 17/API 37) was selected.
Its installed bytes still exactly match the frozen 2026090307 private archive.
The new-candidate update preflight passes: device already unlocked, exact
package, strictly higher build and same installed/archive certificate; no
uninstall or reset required. **No installation, launch, account mutation or
device write was performed.** Preflight is eligibility, not update acceptance.

After exact candidate CI succeeds, use the existing replace-only updater,
verify new installed bytes and app-data identity, then authenticated smoke
and no-SMS phone preflight. A fresh owner-ready SMS window is still needed
for direct valid-code dialog completion; do not reuse any earlier code or
send unattended SMS. Keep Meta creation waiting for the exact owner action;
do not repeat the already-sent Telegram request merely because it is pending.

No Store upload/release, OnePlus access, production change, new provider,
payment, KYC, real money, public registration, history rewrite or PR merge.
Evidence-only follow-ups do not change this frozen source or transfer its
results to a later mobile build.
