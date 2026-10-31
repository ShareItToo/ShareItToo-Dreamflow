# WP04 prerequisite — cold R10 storage capacity

Status: **FULL NORMAL REGRESSION AND CLEAN R10 PASS / EXACT CI PENDING**.
Technical debt: `TD-WP04-R10-COLD-CAPACITY` — **PARTIAL**: the cause is fixed
and locally verified by both full gates without intervening cleanup. Exact
GitHub CI remains required before release-readiness closure.
This is a build-host verification correction, not mobile/provider work or
completion of WP04. Base: `2408ada3ef3a5939e0222ac3655f2afa580b8fd1`.
Worktree: `/Users/walidchraibi/Worktrees/SIT-master-workflow-20260808`;
branch: `codex/master-workflow-20260808`.

## Actual failure

Corrected R10 session 14219 is terminal, exit 1. The exact isolated checkout
passed toolchain capture, locked restores, Backend tests/syntax, dependency
audit, secret scan, isolated PostgreSQL and the complete technical regression
(634 seconds). The second Android debug build also passed (50 seconds).
However, extracting the second APK failed with unzip exit 50 and a disk-full
write error. No APK-equivalence result or execution JSON was produced.
This is NOT a full clean-checkout pass.

The task-owned 32-GiB APFS build image had about 10 GiB available when the
run started. Cold package caches, project output, APK copies and both unpacked
inventories exhausted that remaining space. The existing generic five-GiB
cache floor was not a sufficient cold-R10 admission check. The source,
protected inputs and signed archives were not affected. The runner removed
its guarded generated child in `finally`; its parent directory and the
separate failure log remain. No manual cache deletion or timeout retry.

Failure log: private `SIT_WP04_WEBHOOK_EVIDENCE.IQxzop/r10-corrected.log`;
SHA-256 `797d0088f5966cc1503a2559ec3d2866b0ef352ba6958b191b0011778e70984a`.

## Correction and deterministic checks

R10 now reads free space on its actual temporary filesystem before reading
Git or creating the isolated clone. It requires 24 GiB: the unchanged five-GiB
project and eight-GiB package-cache bounds, one GiB for the clone, five GiB
for APK copies/extractions, and five GiB reserve. This is an admission budget,
not an exclusive reservation against unrelated concurrent writers.

The output-bound validator uses those same project/cache constants without
raising either limit. Both APK builds, both full inventories, raw hashes,
metadata-drift classification, runtime checks and cleanup remain unchanged.
There is no CLI bypass or undocumented cache dependency.

Deterministic tests cover the exact threshold, one KiB below, the observed
ten-GiB case before any Git access, malformed/negative/overflow statistics and
an unavailable filesystem. The helper suite passes 15/15; combined runner and
existing evidence-validator suites pass 23/23. Five unchanged cache-wrapper
tests also pass. The red helper log reports the missing guard export; the
behavioral failure is the complete old R10 attempt described above. Red and
green logs are retained separately. A real native-filesystem probe also
rejects the low-space internal volume without starting a build.

## Host recovery and closure still required

No live build or open volume handle remained before the task-owned image was
detached. The offline recovery copy completed and a recursive bytewise diff
passed (excluding only macOS AppleDouble `._*` sidecars). The existing logical
image was enlarged to 64 GiB, reattached and positively mapped to its own
virtual APFS container before that container was grown. The APFS filesystem
check exited zero. The physical external SSD was not reformatted or resized.

The exact image path, mount name, owner-only directories, SDK and private
normal build-cache profile remain unchanged. The unchanged wrapper validates
the exact image/APFS mapping, owner permissions and separate physical backing.
The native R10 probe sees 44,311,904 KiB free against 25,165,824 KiB required.
The existing real Java probe passes POSIX permissions, fsync, atomic rename,
symlink roundtrip and a separate-process exclusive lock. No other image,
user volume or login was changed. No cache or historical artifact was removed.

The offline 32-GiB recovery image remains at the private external location
recorded in the task checkpoint. Restore only as a separate controlled offline
operation after stopping verified users of the current image; it must not
overwrite a mounted or subsequently changed image.

Full normal regression now passes (session 69380, exit 0): 2,171 tool tests,
665 default Flutter passes / 33 explicit-profile skips and all configured
profiles, analyzer zero, Web debug / Wasm dry run, loopback smoke, Android
debug in 17 seconds (11/471 tasks executed), minSdk 24 and R11's 14 permissions
/ 8 exports. The original checkout and guarded cache were used without any
intervening purge. This is not a signed release or standalone Wasm-runtime
acceptance. Frozen signed 2026090402 APK/AAB hashes were separately rechecked
and still match their archive manifest.

## Exact clean-checkout completion

Implementation `c4c576d3e26166591130ca1e4744048069afbbc3` is committed.
Fresh R10 session28631 completed with exit0. The temporary clone started and
ended clean at that exact HEAD; generated project output and package caches
started at zero. All locked restores, Backend tests/syntax, dependency audit,
secret scan, isolated PostgreSQL and complete technical regression passed.
The full technical gate took677 seconds and the forced second Android build43
seconds. Both full APK extractions and every final check completed.

The two debug APKs are **byte-identical**, each231,269,307 bytes with SHA-256
`3c2d9edb257fa113c2ab3c216a43224ff2cc4e0134661a4ce80d02ae4391ce30`.
All794 extracted entries match; no metadata normalization exception was used.
Package `com.shareittoo.app`, version `1.0.0+2026090402`, SDK36/min24/target36
and all14 permissions pass. The default debug provider/network holds pass;
this does not produce or replace a signed Staging candidate.

All7 dependency,116 migration,84 asset and3 font inventory entries remained
identical. Generated project output3,217,282 KiB and fresh package caches
6,134,014 KiB are within the unchanged5/8-GiB bounds. The guarded child,
caches and test APK copies were automatically removed; parent fixture folders
and the log/evidence remain. No manual purge was used. Image free space was
44,302,384 KiB after cleanup. The unchanged execution-only validator passes.

Retained machine evidence:
`docs/evidence/release-readiness/wp04-r10-clean-reproducibility-20260904.json`.
Its legacy `nextPackage=R11` field is not an instruction to start another
hardening Goal; the active Staging queue and owner boundaries still govern.

The earlier failed attempt is preserved separately. GitHub CLI authentication
was freshly checked and remains unavailable; exact new-head CI is pending.
Neither this local pass nor a future newer-head pass clears the frozen
`bfd3e9e4` candidate's failed Regression. The full WP04/provider Goal remains
incomplete. Current remaining requirements are inventoried in
`SIT_STAGING_ACCEPTANCE_CHECKPOINT_2026-09-04.md`.

No Pixel/OnePlus installation, provider call, payment, deployment, Store,
Production, credential extraction, billing or PR merge occurred.

## Retained private proof

Logs remain in the task's owner-only `SIT_WP04_WEBHOOK_EVIDENCE.IQxzop` directory.

| Proof | SHA-256 |
| --- | --- |
| Combined 23 runner/validator tests | `7e0d1ed98e4c3bcf55d0929deb9fcbd5ee8d362792d3596fd4483a4e2ff67561` |
| Expanded host/profile admission | `f3df75b9599204769500e4b646e2826c6cb821f468c3407cf58753e595761d21` |
| Real filesystem probe | `ac1c29d766a886e906acd94d972eef9244af3e56795c49dcf8f666fb87f49652` |
| Full normal regression | `edb8693af3f40d2de1f859836954d1633025cd0ffb53e6af815ddd7354cb848c` |
| Full exact clean R10 log | `bd5385817bda12ab57ada3daf0b44a071d29b7d0588840d11be917daff3a44a7` |
| Exact clean R10 execution JSON | `643624b880af890687093106262545bb5db6a6e9023991eaefa409c678090d57` |
