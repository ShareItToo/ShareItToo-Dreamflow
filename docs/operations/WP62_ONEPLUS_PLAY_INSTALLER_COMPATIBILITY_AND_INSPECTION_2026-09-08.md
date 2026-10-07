# WP62 — OnePlus Play installer compatibility and physical inspection

Status: **IMPLEMENTATION AND CURRENT PLAY-CANDIDATE PHYSICAL VERIFICATION
COMPLETE**.

## Trigger and root cause

The first bounded physical WP60 inspection reached the USB-authorized OnePlus
but rejected its package source as unavailable. The device was not missing the
Play installation. OxygenOS/Android 16 returned both the exact application and
the sibling QA package for the prefix-based command:

- `com.shareittoo.app`, installed by `com.android.vending`;
- `com.shareittoo.app.qa`, installed by the Android package installer.

The old parser required the complete output to contain only one package line.
That assumption converted a valid exact-package result into an unavailable
source. The fix splits the output, selects only the exact requested application
ID, requires exactly one exact match, and then enforces the Google Play
installer. Missing, duplicate or conflicting exact matches still fail closed.
No sibling package is trusted or inspected further.

## Verification

The parser and runner regressions cover the real sibling-prefix output in both
orders, absence of the exact application, duplicate exact rows and conflicting
exact installers. Thirteen focused tests pass locally; the synchronized isolated
MacBook checkout passes its ten focused parser/runner tests.

The complete local regression at implementation HEAD
`a105a5fdd08c224e8556c5e67f5474ddb8a46cb4` passes all 2,472 tool tests, 909
Flutter tests with 33 declared skips, randomized security profiles, analyzer
with zero issues, Web/Wasm, loopback smoke and Android minSdk 24/build. No
timing, cache, retry or parallelism workaround was introduced.

At the same exact HEAD, GitHub Regression `34280112694` passes PostgreSQL job
`102242767544`, Backend job `102242767806`, Flutter/Android job `102242767856`
and independent clean-checkout job `102242767975`. CodeQL `34280112554` / job
`102242568787` passes. The current PR-merge readback reports zero open code-
scanning alerts. PR #7 remains Draft, open, mergeable and unmerged.

## Sanitized physical result

The corrected runner then completed `inspect` read-only on the USB-authorized
OnePlus:

- Android 16 / SDK 36;
- exact package `com.shareittoo.app`;
- installed version `1.0.0+2026090204`;
- installer `com.android.vending`;
- four Play-delivered splits;
- classification `UPDATE_REQUIRED`;
- current candidate `1.0.0+2026090711` not yet installed.

This was a successful inspection of the previous accepted Play candidate, not
yet a pass for the current candidate. `verify` and `lifecycle` correctly did
not run at that point. No device or account content was inspected.

After Google Play delivered the approved Internal update, the same bounded
runner was executed again. It verified exact package `com.shareittoo.app`,
version `1.0.0+2026090711`, installer `com.android.vending`, four delivered
splits and the expected signing certificate. `inspect`, exact-candidate
`verify` and lifecycle all pass with no blocker. The update came from Google
Play; Codex did not sideload, uninstall, clear data or automate private UI.

## Boundary and next action

The current Play-signed `2026090711` installation is now verified. Sideloading,
uninstalling, clearing data, UI automation on the owner's private phone,
changing a tester list or creating a new Store release remain outside this
package.

Machine-readable evidence:
`docs/evidence/release-readiness/wp62-oneplus-play-installer-compatibility-and-inspection-20260908.json`.
