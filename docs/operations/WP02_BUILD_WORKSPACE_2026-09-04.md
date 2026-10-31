# WP02 prerequisite — bounded Mac-mini build-cache capacity

Subsequent candidate-bound checkpoint: clean full regression followed by the
signed `2026090401` archive lifecycle passes without manual purge or retry on
source `c0c4a0d1`; original global entries stayed absent. Exact CI remains
blocked at npm's dependency audit and Kotlin metadata debt persists. See
`WP02_PIXEL_CANDIDATE_2026090401_HANDOVER.md`; the original observations below
retain their historical time and source binding.

Status: **COLD AND ORIGINAL LOCAL GATES PASS / HOST-TOOL CI PENDING / SIGNED LIFECYCLE OPEN**.
No new Goal, signed candidate, device install or live-provider action.

## Decision and provenance

The original source checkout remains
`/Users/walidchraibi/Worktrees/SIT-master-workflow-20260808`, branch
`codex/master-workflow-20260808`. At setup it was clean at committed HEAD
`d7575368b3ca1671ab2898d4f3cb02f603dd0fbd`, pushed with 0/0 divergence.
Exact CodeQL `33810785212` and Regression `33810785195` passed, including
Backend, Flutter, PostgreSQL and exact clean-checkout reproducibility. API-image
publication was skipped.
The older `70edafa2` Regression `33809975120` was cancelled by the normal
workflow concurrency rule after the follow-up push, not recorded as a pass.

Internal capacity is approximately 1 GiB free plus 3.6 GiB replaceable SIT
output, below the unchanged 5-GiB floor. Inspection found no large abandoned
SIT temporary fixtures or generated output in the two historical worktrees.
Protected archives, user files, Git history and other projects were preserved.

The connected Crucial X9 has about 1.8 TiB available but uses exFAT. A newly
created, task-owned 32-GiB sparse APFS image provides normal Mac filesystem
semantics without reformatting that disk or changing existing files:

- Image: `/Volumes/Crucial X9/SIT-build-workspace.9rvNwz/SIT-Build.sparsebundle`.
- Mount: `/Volumes/SIT-Build-20260904`, current-user-owned mode 0700.
- Dedicated cache: `/Volumes/SIT-Build-20260904/gradle`, mode 0700.
- Disposable independent clone: `/Volumes/SIT-Build-20260904/source-d7575368`.

The clone used `git clone --no-local` from the original repository and retains
the exact branch/HEAD. Its origin was set to the same canonical GitHub URL;
cleanliness and 0/0 divergence were checked. It is a build-only snapshot, not
a replacement source authority or another writer. Only ignored public SDK-path
metadata was added. No signing properties, keystore, Firebase configuration,
account credentials or personal device inputs were copied to this workspace.
The original private release archives remain at their original locations.

## Verified filesystem and current execution

A real Java filesystem probe passed owner-only POSIX permissions, file flush,
atomic rename, symlink roundtrip and an exclusive lock checked by a separate
Java process. Its synthetic files were removed afterward. Probe retained at
`/Users/walidchraibi/Documents/Codex/2026-08-19/new-chat/SITBuildFilesystemProbe.java`;
SHA-256 `c54cc71ef09701f7cbfd7e24b5c3f67b0dd6597b8847d58383e56e6f040f6253`.

The unchanged full gate completed with exit 0 in the exact build clone with process-local
`GRADLE_USER_HOME=/Volumes/SIT-Build-20260904/gradle`, `CI=true` and
`SIT_ALLOW_CANDIDATE_ROLLOVER=1`. Start: 33,076,724 KiB free, zero generated
output. The cache started empty. Log:
`/tmp/sit-wp02-external-apfs-full-regression.log`, SHA-256
`8806d3bd1c49ecea58907f0fea2214e7d2e2a97274d78b3e8024bbe753223318`.
Results: 2,151 tool tests, 665 default Flutter passes plus 33 explicit-profile
skips, 17/1/10 provider cases with seed 7, remaining configured profiles,
analyzer zero, Web debug/Wasm dry run, loopback and Android PASS. Android's
cold build took 6m53s (440 executed tasks, five up-to-date), with minSdk 24,
14 permissions and eight exported components. End: 23,224,528 KiB free and
3,581,184 KiB generated; the fixed capacity and footprint guards passed.
This is the ordinary unconfigured-Firebase CI build profile, not a signed
Staging candidate or real-provider acceptance. The metadata-only historical
artifact checks retain their limited meaning. No test, timeout, parallelism,
package pin or capacity threshold was relaxed.

## Original configured-checkout result

The guarded original-checkout full regression now completed with exit 0.
It includes the new host selector and five CLI/validation tests: 2,156 tool
passes, 665 default Flutter passes/33 profile skips, 17/1/10 provider cases,
all other profiles, analyzer zero issues, Web debug/Wasm dry run, loopback and
Android PASS. The original protected Firebase inputs remained in their normal
location. Android completed in 23 seconds (12 tasks executed, 436 up-to-date),
minSdk 24, 14 permissions and eight exported components. This debug result is
not a signed candidate or physical acceptance.

Internal start: 2,030,180 KiB free plus 3,691,664 KiB generated (5,721,844 KiB
effective). End: 2,018,480 KiB free, 3,691,672 KiB generated, growth eight KiB.
All existing capacity bounds passed unchanged. The host selector's image and
physical-backing checks passed before and after the child command. Both retired
global transform entries remained absent afterward; their verified backup
copies remain available. There was no intervening purge or retry.

Final log `/tmp/sit-wp02-original-owned-cache-full-regression.log`, SHA-256:
`c5e9fc61e6aee2f23b9231e9e5bba8e07dbea4c4816a1cf60d4231a8e6e48f38`.
Migration evidence SHA-256:
`2860ff98b0b96ddb209be266c2f8bd9ea614f307dd7b99c7d96dd98c107032b0`.
Working-tree secret scan and `git diff --check` pass. Canonical signing
configuration was verified read-only; no new signature or release was created.
The host-tool commit still needs its own exact CI; d7575368's completed CI
certifies the earlier SDK/test changes, not the new host selector.

## Guarded normal SIT cache selection

New local tool `tool/run_with_local_build_cache.mjs` validates an explicit,
owner-only JSON profile, the exact mounted image, APFS type, directory
ownership, separate physical backing and at least 5 GiB free both in the image
and its backing filesystem. It passes the dedicated `GRADLE_USER_HOME` only
to a child command in the invoking checkout. It checks storage again when the
child ends and retains nonzero child exit status. No shell evaluation, hidden
global-cache fallback, volume mutation, credential handling or global-profile
change is implemented.

Private host profile (public paths only, mode 0600):
`/Users/walidchraibi/Documents/Codex/2026-08-19/new-chat/SIT_BUILD_CACHE_20260904.json`.
Five maintained tests cover schema/path constraints, missing/wrong mounts,
permissions, thin-image backing reserve, argument-array execution and absence
of global mutations. Live probes confirm the exact child environment and
preservation of child exit status 17. CLI regressions prove unsafe, linked,
missing and invalid profiles cannot start the child or print their contents.
The existing full regression discovers
these tests through its complete Node-tool inventory; no opt-out was added.

Normal invocation from the original source checkout:

```sh
CI=true SIT_ALLOW_CANDIDATE_ROLLOVER=1 node tool/run_with_local_build_cache.mjs \
  --profile /Users/walidchraibi/Documents/Codex/2026-08-19/new-chat/SIT_BUILD_CACHE_20260904.json \
  -- bash scripts/technical_regression_check.sh
```

This wrapper does not authorize release flags. Signed candidates still need
their exact reviewed source/version/configuration and existing signing gate.
It deliberately cannot mount or recreate a missing disk image; a missing SSD
must not cause an internal-disk fallback. Existing main-checkout signing inputs
stay normal owner-only files; their no-symlink check is not weakened.

## Remaining closure criteria and recovery

After the cold gate passed, exactly the two identified local engine-transform
caches were migrated recoverably to
`/Volumes/SIT-Build-20260904/retired-local-engine-transforms`.
Seven files, 962,702,399 bytes, passed before/copy/source-unchanged/readback
SHA-256 checks. Destination files were flushed before source retirement.
Both retained source JARs in both cache homes passed ZIP integrity checks.
Original-cache daemon checks and exact-target open-file checks were clear
before copying and again before retiring the originals. All backup files were
re-hashed after retirement. The target's `migration-evidence.json` records
`MIGRATED_VERIFIED_RECOVERABLE`. Internal free space rose to 2,033,976 KiB;
protected archives, credentials and source JARs were unchanged. The migration
script remains outside Git in the task workspace; it refuses rerunning over an
existing destination. No general cache directory or user file was removed.

Future SIT builds must select
the dedicated cache; repeatedly purging the regenerated global cache is not an
accepted maintenance prerequisite.

The original-checkout full gate has passed. Next bind a new version and prove
the exact candidate's full gate followed by its signed archive lifecycle using
the same dedicated cache, without intervening
manual purge or retries. Keep before/after internal, image and backing-space
measurements. Only that result can close the capacity debt for this configured
host. The Kotlin metadata diagnostic is separate and still OPEN. Removing or
disconnecting the external drive is not supported during a build; its contents
are reproducible source/cache data, not the only copy of source or credentials.
Do not detach an image with a confirmed live build or reuse a historical
artifact/device result as evidence for a new source version.
