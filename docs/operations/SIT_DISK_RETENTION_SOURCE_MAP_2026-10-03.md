# SIT disk retention source map — 2026-10-03

Source: `177a0628fd349bf2f4f6a1d26501c3c6236c3c50`, branch
`codex/master-workflow-20260808`. Read-only SSH used the verified
`sit-staging-vps` alias with strict host-key checking, no connection sharing and
no remote temporary files. That source inspection made no deletion or mutation.
Sol subsequently completed the separately authorized cleanup recorded below.
This documentation update made no further SSH request or live mutation. No
foreign project was inventoried or changed.

Path notation: `sit/` means the authorized SIT deployment root; `root_sit/`
means only the explicitly authorized legacy `ShareItToo-*` source directories.
These are evidence locators, not shell variables or deletion globs. Absolute
host/user paths, addresses and secret values are intentionally absent.

## Decision

**Source-Map PASS; Sol live cleanup PASS, disk 89% → 84%.** Sol removed exactly
the ten listed prep/input directories and only the additional verified
`5d3b4261` Staging build after fresh guards. The pre-execution estimate was
3,956,236,288 bytes for the ten caches and a conservative 4,273,610,752 bytes
including that build; the actual filesystem readback is decisive:

| `df` measure | Immediately before | After Sol's cleanup |
| --- | ---: | ---: |
| Total KiB | 100,476,656 | 100,476,656 |
| Used KiB | 88,435,628 | 84,257,056 |
| Available KiB | 12,024,644 | 16,203,216 |
| Displayed utilization | 89% | **84%** |

All protected releases, current/previous Web inputs, evidence, backups and
Green seals/images remained. No other Staging build or legacy source tree was
removed. Filesystem deletion is irreversible (no trash restore); source is
reconstructible from exact retained Git commits and artifacts from retained
byte-identical releases. Provenance values are recorded below. This is not a
promise of byte-identical regeneration of compressed archives or caches.

The five Web artifact subtrees are independently proven duplicate copies of
retained immutable releases, including their manifests and legal assets.
Source/cache recovery was handled by the exact-source retention boundary, not
by deleting protected runtime or audit material. No release, Green seal, Docker
image, volume, backup or evidence subtree was removed. **Natural health closure
PASS:** Sol observed `InactiveEnterTimestamp=2026-10-03 01:30:15 UTC`,
`Result=success`, `ExecMainStatus=0`, journal `ShareItToo health check passed`
and successful service deactivation/finish. The immediately following `df`
remained **84%**: total 100,476,656 KiB, used 84,257,308 KiB, available
16,202,964 KiB. No forced check or alert send occurred.

## Authoritative policy and focused regression map

| Requirement | Current source evidence | Consequence |
| --- | --- | --- |
| Remote inspection writes nothing | `AGENTS.md:322–324` | Source-map inspection made no writes; Sol's subsequent authorized cleanup is separately recorded above. |
| Preserve provenance and exact deployment identity | `backend/ops/README.md:5–30` | Commit-labelled images and deployment records are rollback evidence, not generic cache. |
| Keep old/rejected Web releases and exact previous | `docs/operations/STAGING_WEB_PILOT.md:226–246` | No automatic release cleanup; current/previous plus rejected artifacts remain. |
| Keep immutable stopped Green witnesses | `backend/ops/green_staging_promotion.mjs:30–35,740–794,1917–1920` | Stopped is not disposable; images referenced by those seals stay too. |
| Cleanup only exact owned rehearsal resources | `backend/ops/green_staging_promotion.mjs:1626–1631,1768–1806,2340–2394` | No Docker prune, standalone-volume removal or name-only deletion. |
| Backup policy is narrow, not a universal TTL | `backend/ops/backup.sh:18–21,23–43` | Its daily-backup `mtime +14` rule must not be applied to releases, sources, evidence or this task; all backups remain protected. |
| Preserve private metadata and source boundaries | `AGENTS.md:105–109,289–296` | Keep manifests/evidence/secrets; no host-specific paths in this document. |
| Existing regression anchors | `backend/test/green_staging_promotion.test.js:227–316,424–451`; `test/tool/staging_web_contract.test.mjs:80–143` | Retained identity, backup collision, current/previous and rollback drift are already tested. No general retention executor is proved by those tests. |

No general age-based policy for `ops`, build/source inputs or legacy source
copies was found in the directed cleanup/runbook search. Before a new cleanup
executor: focused tests must reject current/previous, retained evidence,
symlink/hardlink/parent escapes, identity drift, foreign ownership, open handles,
missing recovery proof and partial cleanup; verify exact before/after pointers,
hashes, owned absence and filesystem blocks. Do not rerun an unchanged full suite.

## Pre-cleanup live references and allocation

These retained measurements preceded the immediate pre/post execution table
above and are not the current disk state. At
`2026-10-03T01:13:38Z`, filesystem total was 102,888,095,744 bytes, used
90,556,547,072, available 12,314,771,456; reserved/unavailable blocks were
16,777,216. `used / (used + available)` was **88.028955%**. Actual utilization
below 85% needed at least **3,115,926,324 bytes** freed at that instant.

| Scope | Allocated bytes | Retention decision |
| --- | ---: | --- |
| `sit/ops` | 4,971,769,856 | Mixed source/toolchain/config/provenance; no blanket cleanup. |
| `sit/web-input` | 2,577,145,856 | Current/previous inputs protected; five stale inputs considered below. |
| `sit/bootstrap-input` | 1,005,522,944 | Includes upload archives and bootstrap/recovery artifacts; hold. |
| `sit/staging-builds` | 988,844,032 | Source copies of retained images; recovery/uniqueness proof required. |
| `sit/staging-web/releases` | 701,702,144 | All eight release trees protected. |
| `sit/releases` | 424,923,136 | 59 entries, six directories; preserve deployment records and legacy releases. |
| `sit/evidence` | 354,611,200 | 70 entries including protected dumps/environment/evidence; exclude completely. |
| 29 `root_sit/ShareItToo-*` directories | 4,591,837,184 | No process cwd/executable/fd references found, permission errors zero; nevertheless no whole-tree recovery/unique-data proof. Hold. |

Independent `du` scope totals are allocations, not additive guaranteed reclaim:
hardlinks/shared storage can invalidate naive sums. The ten-candidate batch
below was additionally inode-deduplicated; every non-directory inode's link
count was contained in that batch, with zero outside-batch shared blocks and
zero count contradictions. No special files were found there. Luna's original
inspection did not mutate state; Sol's subsequent actual free-space readback is
recorded in the execution table above.

Exact protected pointers:

- `sit/current` → `releases/df0374c2517161f751394e3d9306bcae832fe315`;
  `sit/previous` absent. Absence is not permission to remove older records.
- `sit/staging-web/current` →
  `releases/73202bfa3e6b30d0ba0e0b3445cc927c379796fcaaca540069fe224cffa4590e/web`.
- `sit/staging-web/previous` →
  `releases/6d62474d66f59f495122340836c906cf022a62d6b2bc0f16981c19afc99069ff/web`.
- Keep `sit/web-input/967958f6-20261002` and
  `sit/web-input/c513d07f-20261002` for those two Web versions. The current
  capsule's deployed Web/API statements agree with these pointer/image checks
  (`docs/operations/SIT_PILOT_PHASE_CAPSULE_2026-09-23.md:24–46`).

SIT container namespace inspection found **29 containers: six running, 23
stopped**. Active Staging API `ca772102b7b3` uses image
`sha256:16a90e4fbc3710e37c9e319fe5db545d6da6348448848c94c6bfc661eac47357`
tagged `6c0ef70db2656df3e378add858d5f5157388127e`. Its preceding
`d3c2f5d7` image is retained by sealed container `86d7abad7750` and rollback
container `ca6c2b44138e`. All 15 inventoried `ghcr.io/shareittoo/shareittoo-api`
images have active or stopped SIT container references. Virtual image sizes
must not be summed as reclaimable bytes.

The running `shareittoo-web` and stopped Web rollback container bind the entire
`sit/` root read-only at their app mount. Thus all `sit/` candidates have an
ancestor mount reference; “no Docker mount” would be false. Lack of a configured
serving/reference path requires its own readback. The old `shareittoo-web-5be5116`
also directly binds `sit/releases/5be5116f7e50f21d97b7b87a5189d094e565d261`.
Preserve all eight named SIT volumes: Caddy config/data, production DB/uploads,
Staging DB/uploads and Green DB/uploads. Neither an unused-looking name nor a
stopped consumer proves data expendable.

Do not treat mutable `sit/ops/green-target.json` as current runtime authority:
its inspected schema-3 descriptor still names the `3c40ded0` seal. Hash
`5a459d36f0f442b58d2252e149ad92e28c76a4bfa1ec9ebd3a025a7a7ed5d162`
binds this observed stale descriptor; newer actual containers and retained
versioned evidence take precedence. Config/target files themselves remain.

## Exact executed allowlist — Sol record, not a reusable deletion command

Sol independently supplied negative full-path reference and process-reference
readbacks for this exact batch. Luna independently checked allocation, file
shape, hardlink accounting, source commit availability and Web duplication.
Sol repeated fresh guards before execution. The observations below describe
the removed entries; they are not a standing authorization to remove future
directories with the same names.

| Removed entry relative to `sit/` | Pre-cleanup allocated bytes | Recovery/protection evidence |
| --- | ---: | --- |
| `ops/green-prep-435a17215c95311fffe39f5f4fd412990a34e023` | 559,763,456 | Exact Git commit retained; commit/archive/Node provenance below. |
| `ops/green-prep-6d7af4d67ae527d54ec48dbdcfe722e8733fa865` | 226,848,768 | Exact Git commit retained; commit provenance below. |
| `ops/green-prep-94ee76135dcf405523427443a69d7dd7cf65720e` | 302,419,968 | Exact Git commit retained; archive provenance below. |
| `ops/green-prep-9b92d6a94237156c8d0ec1b65cbc87185dcdead9` | 481,230,848 | Exact Git commit and central toolchain retained; provenance below. |
| `ops/green-prep-faa29b2d1b7ea78014bb873ea86b43fbd15e3878` | 625,848,320 | Exact Git commit retained; archive provenance below. |
| `web-input/ba49aecc-20261002` | 720,130,048 | Artifact duplicate retained; exact-source Git recovery. |
| `web-input/3c1ba1c1-20261002` | 489,713,664 | Artifact duplicate retained; exact-source Git recovery. |
| `web-input/2ed02ca40676227804d528f3506c9bd4ee60d7dd` | 374,784,000 | Artifact duplicate retained; exact-source Git recovery. |
| `web-input/candidate-7f3161b5-20260930-preflight` | 87,703,552 | Entire artifact subtree byte-identical to retained release; no source bundle in this parent. |
| `web-input/candidate-1ebc6eaf-20260930-preflight` | 87,793,664 | Artifact duplicate retained; exact-source Git recovery. |
| **Ten-directory batch** | **3,956,236,288** | Pre-cleanup inode-deduplicated estimate. |
| `staging-builds/5d3b42613da73451e9d9169a7b99ca1aba0c4227` | 317,374,464 | Conservative file-only reclaim; exact clean Git source and retained sealed image verified, details below. |
| **Batch plus 5d3, conservative** | **4,273,610,752** | No releases, seals, images, evidence, backups or current/previous input removed. |

Prep provenance marker values were read through stable regular-file descriptors
without following symlinks. `COMMIT` equals the full SHA in each prep name.
Their values were captured before cleanup and remain here as provenance, not
as a new disposal authority:

| Prep prefix | `ARCHIVE_SHA256` content |
| --- | --- |
| `435a1721` | `f743a3297e53ab38d2a334712e8e61ba009485b955c9fb9ecea2fb72288b670f` |
| `6d7af4d6` | Marker absent; do not invent a digest. |
| `94ee7613` | `eaadcdaf1e497dcc581e55ae14b3f603e6e761b38a1004bfd09a9c54ac8a0a2e` |
| `9b92d6a9` | `b62055653c55eb879fecd34870bd836c998f39206a1a5814d9037c33b41c4691` |
| `faa29b2d` | `9f937c81381a4bc7e0a108c77047971f5983cd8682000a0f798d49154aeb4fab  source.tar` |

`435a1721/NODE_ARCHIVE_SHA256` content is
`d60acfe00a2932254bb0ad20e01b0d74397a0875595de719654b214f4b03f307`.
These are observed marker values, not a claim that the corresponding archive
was independently rehashed in this task.

Every Web artifact pair has **148/148 identical relative files, sizes and
SHA-256 bytes, zero extra/changed files**. Files were opened without following
symlinks and metadata stability was checked across each read. The preserved
release identifiers respectively are:

| Input | Preserved manifest-addressed release |
| --- | --- |
| `ba49aecc` | `092e726be9e23bdfaab27b66289e9399825267511698f40b957a0d192563a4cd` |
| `3c1ba1c1` | `e49d51e488d4f2c5daccf70d0e7f3ea0b4084fb5e2dfb167a99cf0bdf921b157` |
| `2ed02ca4` | `6be29c87383e6480151433b1c1b345c884395c94e77f27dd32f06b5d0462b0cb` |
| `candidate-7f3161b5` | `7f2f97d3f4027cb904f2efdb6d0e3d659c3c516d682b77bbd4effd629390b018` |
| `candidate-1ebc6eaf` | `b050417566e4cda220e07c94693d27fd47740fb818ea6bfc0616dc561e9bbfa3` |

Deletion of a verified duplicate is recoverable by copying the retained exact
release, not by claiming a fresh build would reproduce it. Preserve that
release and its manifest/legal assets. All five prep-name commits, all five Web
source commits and the removed `5d3b4261` build commit exist in the local
authoritative Git object database; this proves source availability, **not**
equality of each remote checkout,
absence of unique untracked data, exact archive recovery or toolchain cache
availability by itself. These are limits of the initial inventory, not an open
cleanup authorization after Sol's completed fresh guards. Filename inspection
found only tracked-style `.env.example` and
`.env.staging.example` names, not actual environment/key/dump names, in these
ten candidates; that is not a comprehensive secret-content clearance.

At the measured filesystem state the full batch predicts **84.183145%** actual
utilization, but `df` rounds upward to **85%**. At least **188,403,221 more bytes**
would be needed for a displayed 84%, before metadata exclusions or growth.
The additional four-build inspection used `GIT_OPTIONAL_LOCKS=0`, disabled
external diff and made no Git index writes:

| Build | Readback and decision |
| --- | --- |
| `5d3b42613da73451e9d9169a7b99ca1aba0c4227` | Own Git directory, exact HEAD, tracked diff exit 0, no untracked files, no ignored files outside `backend/node_modules`. Canonical commit present. No outside hardlinks; 322,621,440 allocated bytes including directory blocks; use Sol's conservative 317,374,464 file-only amount. Sol additionally proved no outside path/process references. Stopped seal `8f9daa4153d5` and image `sha256:4c4ed030e23563c99caf9781e5fa1ace41d4d72987570dc318e260b217ba3d90` remain. Source can be reconstructed from the exact retained commit and lock; the old directory is not required to boot that immutable image. |
| `56ec5dc15a18d3fee77d1f9db8252d851afd48f2` | Git HEAD invalid; diff exit 128. **Exclude**, not a clean-recovery proof. |
| `bc86f8318e2c96af5d703007399dc582bc14b5f7` | No own Git directory. **Exclude** pending source equality proof. |
| `ea25e7cb9747dde9ccb331b0a439bb1f9cc6134e` | Clean exact Git, but Sol found an outside reference; 74,031,104 bytes also have outside hardlinks. **Exclude**. |

Only `5d3b4261` was removed as the additional build; the other three remain.
Its seal/image remain protected. The actual post-cleanup 84% reading above
supersedes the pre-cleanup prediction.

Seven legacy `root_sit` dependency trees each measured 80,900,096 bytes and had
no Docker mount overlap or observed process references. Each includes 4,204
hardlinked regular files and 407 symlinks, so their apparent 566,300,672-byte
sum is **not** an independent reclaim proof. They are not needed in the proposed
batch and were not removed. No legacy source tree was discarded.

## Execution guard contract and remaining closure

Sol completed the exact eleven-entry cleanup after fresh guards. The retained
guard contract below describes its narrow boundary, not another pending delete
or a general retention policy:

1. Re-resolve the verified alias, authorized SIT root and exact candidate;
   reject a symlink, special file, changed inode/owner or parent escape. No glob,
   broad directory, volume/image prune or “oldest first” substitute is permitted.
2. Recheck current/previous pointers, exact running API image and protected
   seal/image inventory; current/previous inputs, every release, evidence,
   backup, secret and central toolchain stay untouched. Parent-root Web mounts
   must not be mistaken for absence of a mount; require unchanged serving roots
   and no candidate-specific active reference or process handle.
3. Preserve `COMMIT`/archive checksum markers in place, or explicitly preserve
   their exact bytes as approved immutable provenance before deleting a parent.
   Retain all five byte-identical release copies and their manifests/legal
   assets. Source reconstruction uses exact retained commits/bundles; discovered
   unique files or a failed equality/recovery check abort that candidate rather
   than authorizing evidence loss. Claims about archive bytes are limited as
   stated above; do not promise an exact compressed archive can be regenerated.
4. Rebind the final leaf allowlist and recompute physical reclaim after all
   preservation exclusions. Use the conservative 5d3 file-only amount. After the
   first batch, reread filesystem blocks; only use the approved 5d3 additional
   entry if needed for the agreed displayed threshold. No other build fallback.
5. Verify only approved leaves absent, preserved hashes/pointers/runtime identity
   unchanged, and `df` below 85. Stop on unexpected state; do not automatically
   broaden cleanup. Directory deletion has no trash recovery: recover only from
   the explicitly retained source or byte-identical release, not from an assumed
   backup. Sol's completed execution and actual filesystem result are recorded
   above; this documentation follow-up performed no destructive step.

Optional later disk readback reference (not run in this documentation update):

```sh
ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o UpdateHostKeys=no -o ControlMaster=no -o ControlPath=none sit-staging-vps 'df -B1 --output=size,used,avail,pcent /'
```

Disk cleanup and the subsequent natural healthcheck both passed. This closes
the observed disk incident; it is not a promise that future alerts cannot occur.
No further cleanup or alert-source change is requested.
