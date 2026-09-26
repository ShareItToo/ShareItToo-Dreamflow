# WP02 — isolated Android SDK compatibility and process-local selection

Superseding release checkpoint: the exact bfd3e9e4 full-gate-to-signed-archive
lifecycle now passes with no XML/Kotlin diagnostic. Two additional requirements
were proven: process-local `XDG_CONFIG_HOME` to avoid Flutter's higher-priority
global SDK setting, and official CLI19 inside `sdk/cmdline-tools/19.0` so Flutter
can inspect symbols. Existing public license receipts now match the original
SDK. No global setting, XML, JAR, credential or signing/Firebase input was edited.
The complete recipe and failed attempts are in
`WP02_PIXEL_CANDIDATE_2026090402_HANDOVER.md`; use that recipe, not the earlier
two-environment-variable-only recipe below. Exact candidate CI remains uncleared.

Status: **EXACT 8e0 CI PASS / ISOLATED DEBUG PASS / NEW SIGNED PROOF OPEN**.
This supersedes only the unresolved SDK hypothesis in
`WP02_ANDROID_TOOLCHAIN_ALIGNMENT_2026-09-04.md`; its earlier observations and
failed gates retain their original source and execution scope.

## Verified cause and supported installation

AGP 8.13.2 loads Android repository/sdklib 31.13.2, whose platform repository
reader supports schema v3. The shared SDK installed by command-line tools 22.0
contains platform metadata using v4. The loaded sdklib JAR matched Google's
Maven digest; no corrupt dependency was observed. No XML or JAR was edited.

Official command-line tools **19.0**, downloaded from
`https://dl.google.com/android/repository/commandlinetools-mac-13114758_latest.zip`,
were extracted into a separate public-tools directory. The 143,250,852-byte
archive matched the official repository SHA-1
`c3e06a1959762e89167d1cbaa988605f6f7c1d24`; SHA-256:
`5673201e6f3869f418eeed3b5cb6c4be7401502bd0aae1b12a29d164d647a54e`.
ZIP integrity and entry-path safety passed before extraction. Explicit
`sdkmanager --sdk_root=<fresh-root> --version` returned 19.0.

The new installation is
`/Volumes/SIT-Build-20260904/wp02-sdk19-compat.0bEpOq/sdk`.
Stable packages installed through that official manager:

- `platforms;android-36`, revision 2.
- `build-tools;35.0.0`.
- `ndk;28.2.13676358` (the pinned Flutter toolchain's NDK).
- `cmake;3.22.1` (first installed by the diagnostic build; include explicitly
  when recreating this setup).
- `platform-tools`, observed revision 37.0.1. Recheck this moving package's
  installed revision when recreating; its current contents are not presumed
  permanently pinned by the package name.

Only the original SDK's public license-acceptance hash file was reused after
validating its format. Installer stdin was closed; no new agreement, account,
credential, signing or Firebase file was supplied or copied. If licenses are
missing on another machine, their owner action remains a separate prerequisite.
The shared SDK, Flutter installation and global shell settings were not altered.

Fresh platform metadata is schema v3. Both old and fresh API-36 revision-2
`android.jar` files have identical SHA-256:
`d9eb9da824d9e247a352f570f01e1169e725b2954bca9e283a71786c59b59f9a`.
The API payload, minSdk 24 and target/compile SDK 36 did not change.

## Reproduction contract and test

Use a newly created root and the verified official 19.0 archive, then install
the packages above with `sdkmanager --sdk_root=<fresh-root> <package-ids>`.
Do not regenerate metadata by hand, suppress warnings or overwrite the shared
SDK. For every SIT command using this SDK, set **both** `ANDROID_HOME` and
`ANDROID_SDK_ROOT` to its absolute path in that child process. Continue using
the existing private build-cache wrapper; never fall back to the global cache.

`prepare_android_debug_build_metadata.mjs` already selects explicit argument,
then `ANDROID_HOME`, then `ANDROID_SDK_ROOT`, then existing local metadata.
One new deterministic regression locks those five cases, including equal
process-local variables overriding stale metadata. The behavior itself is
unchanged. The combined pin, scanner and metadata suite passes 12 tests.

An earlier diagnostic selected only local properties while inherited
`ANDROID_HOME` still named the original SDK; metadata preparation correctly
overwrote that selection. Its successful build still had the XML warning and
is **not** evidence for the fresh SDK. The corrected test supplied both process
variables and checked the selected path before building. This is an explicit
SDK selection, not a test retry, alternate success definition or global change.

## Exact isolated debug evidence

Clean `git clone --no-local` source:
`/Volumes/SIT-Build-20260904/wp02-sdk-source.FBsBcx`, exact
`8e0d9f99b49d65e9bd4e5ff4d1d1cd19304a5fc4`, canonical origin, no protected
inputs copied. The selected-SDK `:app:assembleDebug --rerun-tasks` passed:
52 seconds, 468 of 468 tasks executed. A fresh diagnostic process was used;
no permanent daemon, memory or test-parallelism setting was introduced.

Log: `/Volumes/SIT-Build-20260904/wp02-sdk19-compat.0bEpOq/fresh-sdk-selected-clean-head-debug-build.log`.
SHA-256: `aeb63a19e0e4ba367b64aa1b556e8d2434d7530d65dac0998920a6610cde2564`.
Replaying the committed diagnostic scanner in 257-byte chunks found neither
incompatible Kotlin metadata nor SDK XML. Ordinary vendor deprecations remain.
The R11 auditor run **from this same clone**, against its own version, passes
14 permissions and eight exported components, minSdk 24 and target/compile 36.
Running the original checkout's auditor after incrementing it to 2026090402
correctly rejected the old-version APK; that check was not relaxed.

A release-lint attempt in the public clone failed because signing inputs are
absent. That gate remains intact. Debug results cannot replace a configured,
signed release analysis or physical Pixel evidence.

Exact source 8e0 GitHub Regression `33817737171` and CodeQL `33817737109` now
pass, including all four Regression jobs; API-image publication was skipped.
Historical c0/2e5 failed audits are not relabelled. The future 2026090402 source
still needs its own exact CI and clean-head signed build.

## Capacity and remaining debt

With new explicit owner cleanup authority, unused global Gradle 8.12 and
downloaded-module caches were removed after no-daemon/open-handle checks.
Four non-current Apple aerial downloads were byte-verified on the external SSD
before removing their internal copies. All app archives, personal/project
files, signing, Firebase and authentication data stayed in place. Internal
free space reached 11,678,820 KiB (about 11.96 GB); measurements can change.
Private recovery instructions are in the task's `SIT_SPACE_RECOVERY_20260904.md`.
Wallpaper shuffle settings remain unchanged and may cause later re-downloads.

This cleanup is not permanent host-debt closure. No cache removal is allowed
between the next candidate's complete clean-head gate and signed archival
proof. Keep normal reserve checks, full test scope and exact CI. The release
scanner must find neither schema nor Kotlin-analysis incompatibility. Only
then can this configured build-host/toolchain debt be closed; SMS/provider and
the full Staging acceptance matrix remain separate.
