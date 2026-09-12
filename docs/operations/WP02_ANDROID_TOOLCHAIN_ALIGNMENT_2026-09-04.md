# WP02 prerequisite — Android compiler and release-analysis alignment

Status: **SSD FULL REGRESSION PASS / EXACT CI AND NEW SIGNED CANDIDATE OPEN**.
This is a bounded prerequisite of the active Staging/Pixel package, not a new
Goal or an assertion that the full product is complete.

## Provenance and reproducible cause

Source authority remains
`/Users/walidchraibi/Worktrees/SIT-master-workflow-20260808`, branch
`codex/master-workflow-20260808`, base
`2e5b1ed53123b4a0bc5f24211e6b0bbb3a48c3fa` (clean and 0/0 before these edits).
Frozen signed `2026090401` remains bound to `c0c4a0d1`; it is not rebuilt,
relabelled or installed. Pixel remains on previously verified `2026090307`.

With the original AGP 8.9.1 / Kotlin 2.1.0 / Gradle 8.12, explicitly rerunning
`:app:compileReleaseKotlin` passed without incompatible metadata. Rerunning
`:app:lintVitalAnalyzeRelease` emitted the Kotlin 2.3.0-versus-2.1.0 error
specifically inside `:firebase_auth:lintVitalAnalyzeRelease`, yet Gradle exited
zero. This identifies a failed dependency-analysis diagnostic, not an app
Kotlin compile failure or evidence of a runtime authentication failure.

Local task-only traces (no arguments, credentials or project properties):

- `/tmp/sit-wp02-kotlin-baseline-task.log`: 32 seconds; 311 tasks, 310 executed.
- `/tmp/sit-wp02-kotlin-baseline-lint-task.log`: 14 seconds; 657 executed tasks.
- `/tmp/sit-wp02-kotlin-aligned-lint-task.log`: 2m28s; 701 executed tasks; exit
  zero and no incompatible Kotlin metadata after the coordinated pin change.

## Bounded implementation

AGP is pinned to **8.13.2**, Kotlin Gradle plugin to **2.3.10**, Gradle to
**8.13** with official distribution SHA-256
`20f1b1176237254a6fc204d8434196fa11a4cfb387567519c61556e8710aed78`.
Java 17, Flutter 3.41.7, Dart 3.11.5, API 36/minSdk 24 and all application,
Firebase, provider and signing configuration remain unchanged.

The [AGP release contract](https://developer.android.com/build/releases/agp-8-13-0-release-notes?hl=en)
specifies R8 8.13.19 with Kotlin 2.3 support, Gradle 8.13 and JDK 17.
The [Kotlin compatibility table](https://kotlinlang.org/docs/gradle-configure-project.html)
includes this combination for KGP 2.3.10. The wrapper checksum was read from
the [official Gradle checksum](https://services.gradle.org/distributions/gradle-8.13-bin.zip.sha256).
The developer-source research guided a coordinated update, not just a compiler
bump or a metadata-check suppression.

`validate_android_toolchain.mjs` checks both AGP/Kotlin declarations and the
exact wrapper URL/checksum; it rejects known compatibility-check suppressions
in the root/app build scripts, settings and properties. Both normal preflight
and the complete gate run it. Current R10 execution requires Gradle 8.13;
historical R10 evidence still requires its original 8.12. Historical Play
transition evidence and approval claims are not rewritten.

Both signed release build commands now use `run_checked_android_build.mjs`.
Its bounded streaming scanner preserves each output stream separately and
retains failure findings after log truncation. Known Kotlin-metadata or SDK-XML
reader incompatibilities fail even when Flutter/Gradle returns zero. Nonzero
child status is retained; missing processes and signals fail closed. Artifact
archiving remains after both checked builds. No retry, timeout extension,
lint bypass, reduced test scope or parallelism workaround is added.

Replaying the actual logs through this same scanner in 257-byte chunks finds
no metadata issue for the baseline app-compile log, the Kotlin issue for the
baseline dependency-lint log, and only the SDK reader issue for both aligned
logs. Their SHA-256 values, in the order above plus the fresh-process trace:

- `66281b4284b1daeff28eaab422e49e165c8f3ace4a00e981667de8e59c5bce37`
- `1ca45236e5ca7842b946b29ab18ee524bf8b9bc09ec51190f1bbc6d415dc2607`
- `cac2372e98a7064ec0040f04e8f75c6d4cf5d2c85605b79b7ae848488783a5e0`
- `c3307757267d65cb4b828ac53cfa0e7ba7ea912e047b7626986d17a2d175adb5`

The final trace is `/tmp/sit-wp02-sdk-reader-cold-trace.log`; it uses a fresh
diagnostic Gradle process, not a permanent daemon/parallelism workaround.

## Current verification and separate unresolved issues

All 2,165 Node tool tests pass, including nine new pin/stream/process cases.
The complete original-checkout gate stopped at its existing capacity guard
before any tests: effective capacity 3,407,300 KiB versus 5,242,880 required.
Log: `/tmp/sit-wp02-toolchain-full-regression.log`. No cache was purged and the
failure is not claimed as a pass. Independent public-source validation on the
existing APFS SSD subsequently passed as detailed below; it is not a signed
main-host proof.

The isolated source snapshot is
`/Volumes/SIT-Build-20260904/wp02-toolchain-source.lfjbCI`. It was cloned with
full Git history from the exact base, then received only the reviewed tracked
diff and five named new public files. All 2,828 files were compared byte for
byte against the working source before execution; sorted path/NUL/content
snapshot digest:
`c82a16f738cb220ec80e2e4e7c89466d67950f7b7764c5bb5f9573db1642e0aa`.
Its origin matches the canonical GitHub repository. Only public SDK-path local
metadata was added; no signing, Firebase or account input was copied. The main
checkout remains authoritative. Later handover-only additions do not change
the executed implementation.

The complete normal gate with the existing private cache selector, `CI=true`
and `SIT_ALLOW_CANDIDATE_ROLLOVER=1` passed exit zero. Log:
`/tmp/sit-wp02-toolchain-ssd-full-regression.log`, SHA-256
`f90b7264e06c994c327e671e1d9d0599fb73854d0689ee2e2c04625e37fa366f`.
Results: 2,165 tool passes; 665 default Flutter passes/33 profile skips; all
explicit profiles including 17/1/10 provider cases with seed 7; analyzer zero;
Web debug build and Wasm **dry run**; loopback smoke; Android debug build and
binary-surface audit (minSdk 24, 14 permissions, eight exported components).
Android: 65 seconds, 468 tasks, 463 executed. Fixed capacity bounds passed:
18,006,460 to 12,755,920 KiB free; zero to 3,178,724 KiB generated output.
A separate public SDK archive download also occurred on the SSD during this
run, so free-space delta is not attributed entirely to this build. No manual
cache purge, reduced parallelism or repeated build attempt occurred.
This is an unconfigured-Firebase debug snapshot, not a signed Staging build,
physical-device acceptance or final committed clean-checkout evidence.

The SDK XML reader warning remains **OPEN**. A fresh diagnostic Gradle process
still emits it. Every app/library project loads Android repository/common
31.13.2; the SDK CLI is 22.0. The actual sdklib 31.13.2 JAR contains repository
schemas through v3, while installed SDK platform metadata contains repository2
v4. This explains the incompatible schema boundary; it does not yet prove a
supported remediation. Do not edit SDK XML, suppress the warning, or mutate the
shared Flutter/Android installations merely to obtain a green release.

The loaded sdklib JAR was also independently hashed and matched the digest
served by the official Google Maven repository. No artifact-integrity mismatch
was observed. This is a schema-compatibility problem, not evidence of corrupted
or substituted cache contents.

For the next bounded compatibility check, official command-line tools 19.0
were downloaded to
`/Volumes/SIT-Build-20260904/wp02-sdk19-compat.0bEpOq`, without installing them
over the shared SDK or executing an installer. The official repository's
143,250,852-byte archive and SHA-1 matched, ZIP integrity/path validation passed;
local SHA-256:
`5673201e6f3869f418eeed3b5cb6c4be7401502bd0aae1b12a29d164d647a54e`.
Its sdklib also supports repository schemas through v3. Whether an SDK freshly
provisioned by that pinned official tool removes the mismatch remains a
hypothesis to test; no SDK XML or existing installation was edited.

Base 2e5b1ed5 exact GitHub Regression `33815561756` is terminal failure:
Backend, Flutter and PostgreSQL pass; clean reproducibility fails at the
unchanged npm advisory POST timeout. Exact CodeQL `33815561755` passes.
Earlier candidate c0c4a0d1's Regression remains failed, not replaced by the
evidence HEAD's results. No owner reauthentication is inferred from these
network timeouts. Availability and exact new-source CI still need verification.

Later in this same bounded run the normal local `pnpm audit --prod
--audit-level=moderate` completed with exit zero and no known vulnerabilities,
after its own unchanged standard retries. No wrapper retry or audit exception
was added. Log `/tmp/sit-wp02-toolchain-dependency-audit.log`, SHA-256
`3f2a81b69011967bad338b15d9d07a7eb2de54e8a5e4f5cc5a661ded5e45d7a7`.
This restores local audit evidence, not the failed exact historical CI runs.
Backend tests also pass: 795 passed, two expected skips (797 total); syntax and
full Git-history/working-tree secret checks pass with zero unexpected findings.

## Closure, rollback and next step

Before installing an updated Pixel candidate: complete full local and exact
GitHub Regression/CodeQL, prove clean-checkout reproducibility, resolve SDK
reader/capacity debt with a reproducible supported setup, choose a fresh version
strictly above every retained candidate, and run a clean guarded signed build
plus independent identity/signature/hash/profile/privacy verification. Never
reuse `2026090401` or transfer old device evidence to a new artifact.

Rollback is a normal forward revert of the coordinated pins and guard changes;
no history rewrite or replacement of archived artifacts. No Pixel/OnePlus
write, Store, Meta/Apple account, SMS, live provider, billing, production,
payment or PR-merge action is part of this correction. Meta confirmation and a
later owner-ready SMS window remain separate dependencies; no duplicate owner
notification is sent for their unchanged state.
