# 48H R10 clean-checkout and build reproducibility

Status: **CLOSED — EXACT GITHUB REGRESSION AND CODEQL VERIFIED**

R10 creates a no-hardlink local clone at an exact detached Git head and starts
with zero `.dart_tool`, `build`, `android/.gradle` and `backend/node_modules`
footprint. Backend, Flutter and Gradle dependencies are restored from checked-in
locks into fresh bounded temporary caches; neither private Firebase/signing
files nor credentials are copied. The clone runs the Backend suite, syntax
checks, dependency audit, sanitized repository secret scan, repository-owned
PostgreSQL runner and the full analyzer/Flutter/Web/Wasm/Android technical gate.

The retained local run is bound to implementation head
`322e97ecc0c20c7f765054523dbcf1ddf45d0e9a`. It preserves exact hashes for
seven dependency/toolchain files, 112 schema/migration files, 84 image/font/
license assets and all three font files. Toolchain identity is Flutter 3.41.7,
Dart 3.11.5, Node 22.23.2, pnpm 11.16.0, Java 17 and Gradle 8.12.

The first clean run exposed that direct Gradle assembly silently used fallback
identity `1.0+1` when generated `android/local.properties` did not yet contain
Flutter version fields. The permanent correction now derives debug build
metadata from checked-in `pubspec.yaml` immediately before the existing single
direct Gradle build. The retained APK identity is therefore
`com.shareittoo.app`, `1.0.0+2026082302`, compile/target SDK 35 and minSdk 24.

Two forced equivalent debug builds have equal size and 795 extracted entries,
but their raw hashes are not identical. The only differing entry is
`classes18.dex`. Exact normalization proves that the changed bytes are limited
to DEX header checksum/SHA-1 bytes 8-31 and a nine-hex-digit D8 synthetic-class
checksum value. No raw binary identity is claimed; every other entry and the
normalized DEX payload must match, and any unexplained entry drift fails.

The merged artifact retains the exact reviewed 14-permission inventory,
backup and cleartext traffic disabled, no legacy external-storage mode, backend
disabled by default in debug, external AI and real payment disabled, all social
providers default-off, no compiled OpenAI API origin, and Firebase SDKs present
with Messaging auto-init, Analytics collection and Crashlytics collection all
default-off. Runtime strings are inspected from the debug
`assets/flutter_assets/kernel_blob.bin`, not a release-only `libapp.so`.

Generated project output is 3,208,463 KiB under the unchanged 5-GiB project
cap. Fresh Flutter, Gradle and pnpm caches total 6,119,769 KiB under their
separate 8-GiB temporary-cache cap. Total measured temporary footprint is
9,328,232 KiB. The clone, all three caches and both APK copies are removed at
the end. No retry, reduced parallelism, sleep, hidden cache, retained artifact,
signed candidate, Production/VPS/Cloud/Firebase/Store/Payment/account change,
API billing, credential extraction, PR merge or publication is part of R10.

The committed validator is fail-closed for exact retained evidence and supports
a separate structural execution mode for a detached GitHub PR-head checkout.
At security-fix head `7d215e41e2c0f20f088152a19b4915b8bc2bdb45`, Regression
`32767155545` passed the independent R10 job `97559117227`, PostgreSQL, Backend
and Flutter jobs; publication, explicit parallel stress and the signed-candidate
step remained skipped. CodeQL workflow `32767155548` and Advanced Security check
`97559603226` passed with zero annotations and zero open code-scanning alerts.
PR #7 remained Draft, open and unmerged. The post-PF18 finding and its permanent exit
contract are retained separately in
`docs/operations/48H_R10_TECHNICAL_DEBT_2026-08-24.md`; the historical PF18
21-item snapshot remains unchanged. The visible GitGuardian failure remains the
documented pre-existing 250-commit PR-history finding; no credential detail was
inspected. R10 is closed and R11 begins.

The first exact run `32765161224` passed the clean R10 job, normal Regression
and the CodeQL workflow. Its separate Advanced Security result identified an
APK time-of-check/time-of-use hash shape and two ambiguous URL-substring APIs
in the new runner. The implementation now hashes the same in-memory bytes used
for size and treats compiled origins as conservative raw-byte diagnostics, not
URL authorization. No alert was dismissed. The exact replacement checks above
passed and closed both R10 technical-debt items.
