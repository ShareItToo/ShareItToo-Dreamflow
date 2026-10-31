# WP167 — Scoped Android SDK compatibility diagnosis

Status: **LOCAL CAUSE CONFIRMED; SCOPED PROFILE READY; CANDIDATE BUILD NOT RUN**.

## Finding

The failed signed-candidate invocation was started directly with
`scripts/build_android_release_candidate.sh` and no process-local Android SDK
profile. In that environment Flutter resolved the shared SDK from
`/opt/homebrew/share/android-commandlinetools`, whose command-line tools are
revision 22.0. AGP's repository reader in this checkout supports SDK metadata
schema v3, while that shared installation exposes schema-v4 metadata. The
unchanged fail-closed build scanner therefore rejected the diagnostic
`incompatible-sdk-xml-reader`; the non-zero diagnostic was not reclassified as
success and no candidate archive was retained.

This is a selection/invocation defect, not evidence that the maintained SDK is
corrupt. The shared SDK, SDK XML files, Gradle files, scanner and global Flutter
configuration were not edited.

## Scoped-v2 proof

The owner-only profile
`/Users/walidchraibi/Documents/Codex/2026-08-19/new-chat/SIT_ANDROID_BUILD_20260904.json`
selects:

```text
ANDROID_HOME=/Volumes/SIT-Build-20260904/wp02-sdk19-compat.0bEpOq/sdk
ANDROID_SDK_ROOT=/Volumes/SIT-Build-20260904/wp02-sdk19-compat.0bEpOq/sdk
XDG_CONFIG_HOME=/Users/walidchraibi/Documents/Codex/2026-08-19/new-chat/SIT_FLUTTER_CONFIG_20260904.JGGxKy
```

Read-only execution through `tool/run_with_local_build_cache.mjs` verified the
dedicated APFS cache and returned the exact effective Flutter SDK above from
`flutter config --machine`. The selected SDK contains official command-line
tools 19.0, build-tools 35.0.0, platform-tools 37.0.1 and API-36 platform
metadata. No global environment or settings were changed.

The maintained invocation for any future signed lifecycle is therefore the
existing wrapper plus this profile, with the release builder as its child. The
wrapper must remain the entrypoint; direct invocation of the builder is not
equivalent and is not release evidence.

## Verification

- `node --test test/tool/scoped_android_build_environment.test.mjs test/tool/android_toolchain.test.mjs`: **28/28 passed**.
- `node tool/validate_android_toolchain.mjs`: **valid** (AGP 8.13.2, Kotlin 2.3.10, Gradle 8.13).
- Scoped `flutter config --machine`: **effective SDK matches profile**.
- `git diff --check`: **passed**.
- No candidate build, AAB/APK, Play/Store, device, provider, payment or
  external action was performed in this package.

## Next action and boundary

Only after this compatibility finding is accepted may the separate candidate
rollover package rebuild one new candidate through the scoped-v2 wrapper. This
document does not alter historical candidates, handoffs, source hashes or
release gates.
