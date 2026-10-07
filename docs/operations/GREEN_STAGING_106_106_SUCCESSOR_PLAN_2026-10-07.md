# Green Staging 106 → 106 successor: read-only execution preflight

Status: **read-only collector/CLI, binding and execution preflight implemented; no rehearsal or
promotion adapter implemented**. Tests are synthetic/local PG16; no live
collection, publication or deployment verification is claimed. Existing 98→106 source and evidence remain
unchanged. The successor must be independently reviewed and gated before use.

## Implemented slice

`backend/ops/green_staging_106_106_contract.mjs` has no Docker calls or writes.
It validates exact schema-2 publication bytes against an independently supplied
SHA-256 and runtime commit, the immutable image ID/RepoDigest/OCI revision,
and the exact existing 001–106 checksum ledger. Before/after snapshot equality
includes migration timestamps, every table in the independently supplied
inventory, counts/content hashes, and the sanitized readiness-finding hash.
Existing Mission tables may be populated; their contents must remain identical.
This validates supplied data, not the provenance or completeness of live data.

`planSuccessor()` defaults to a non-mutating plan, accepts only `plan`/`validate`,
and explicitly returns all execution/readiness flags false (`collectionImplemented`
is true, but does not claim a collection happened). It rejects
`collect`, `preflight`, `rehearse`, `promote` and `execute`, even with valid
confirmation text. Distinct future consent strings are defined as:

- `rehearse:RUNTIME_COMMIT:OPS_COMMIT:TARGET_CONTENT_SHA256`
- `promote:RUNTIME_COMMIT:OPS_COMMIT:REHEARSAL_BYTE_SHA256`

No expected runtime/image is invented or embedded in its own Ops source.
The exact accepted current-source publication must be supplied independently.

## Operational read-only collector

`backend/ops/green_staging_106_106_collector.mjs` is exposed by
`tool/validate_green_staging_106_106_runtime.mjs`. Default `--mode plan` performs
no Docker call. Explicit `--mode collect` permits only exact-ID container/image/
network inspection, volume inspection, the complete Green-label container-ID
inventory and one fixed read-only SQL input. It never pulls, creates, stops,
starts, writes evidence, changes files or calls a provider. Output is sanitized
JSON on stdout; do not confuse collection with deployment authorization.

Required CLI inputs are `--binding`, `--binding-sha256`, `--publication` and
`--publication-sha256`. Inputs must already exist outside the repository under
an owner-only 0700 parent, as owner-only 0600 single-link regular files. Stable
no-follow reads bind actual publication bytes; errors expose no rejected data.
The separate external binding has kind `sit-green-staging-106-106-binding`,
schemaVersion 1, `opsCommit`, `reviewedCommit`, `runtimeCommit`,
`publicationSha256`, `candidateImageId`, `sourceInventory` and `scope`.
The scope supplies exact `api`, `database`, `witnesses`, two `networks`,
`uploads`, `databaseUser` and `databaseName`. Container descriptors contain
`id`, `name`, `imageId`, `imageDigest`; API additionally has `runtimeCommit`.
Network descriptors contain `id`, `name`, `internal`. No historical IDs,
counts, names or current runtime values are embedded in this collector.

`successorSourcePaths()` defines the complete relative-import closure of the
collector/CLI, dependency manifests and all migration up-files. Every listed
byte must match the actual checkout and both exact Ops/reviewed Git blobs.
The reviewed commit may equal the Ops commit: commit/review the source first,
then create the external binding. The binding is not an inventory member and
there is no self-commit/hash cycle. The runtime commit must contain exactly
the 001–106 migration names/checksums; publication and image OCI revision bind
that separate runtime commit. Uncommitted source cannot pass the real gate.

Collection captures/rechecks full Config/HostConfig/complete canonical mounts
and network-ID fingerprints, exact current image identities, unchanged protected
environment hashes, upload-volume hash, full sorted network member/router sets,
and the complete stopped Green witness inventory. Unknown additions, missing
members, label loss or changes during collection fail closed. Raw Config, Env,
mount source paths and table contents never appear in stdout.

`green_staging_106_106_database.mjs` uses one repeatable-read, read-only psql
transaction for complete catalog-derived table fingerprints, the exact ledger
including timestamps, readiness findings and a separately typed watchdog.
Mission tables can be populated. `assertSuccessorStartup` reuses the strict
one-successful-heartbeat rule: only +1 attempt/+1 success, no errors/alerts,
valid increasing timestamps and unchanged inspected count; every other table,
ledger and readiness component stays identical. Collection captures one
transactional state; it neither evaluates a startup delta nor claims that a
running database has been quiesced.
Target kind/schema are `sit-green-staging-106-106-target`/1. Its canonical
content hash is separately named `targetSha256`; it is not a raw-file hash.
Independent target review/binding is still required before later execution.

## Implemented execution preflight (read-only)

Explicit `--mode preflight` additionally requires protected `--target`,
`--execution-config` and `--runtime-manifest`, each with its own `-sha256`
raw-byte argument. Default remains `plan`; no write/rehearse/promote mode is
accepted. The new source closure includes both preflight and image reader.

`green_staging_106_106_preflight.mjs` defines separate version-1 kinds
`sit-green-staging-106-106-execution-config` and
`sit-green-staging-106-106-runtime`. The config binds `sourceState`
(`running` or `sealed`), `sealedSourceName`, `runId`, resolved `uid`/`gid`,
`materials` and `envFile`. Each material binds the complete exact source,
destination, SHA-256, UID, GID and mode. Secret-file sources must be root-owned
0640 beneath root-owned 0700 parents, with candidate-readable group; env-file
sources are root-owned 0600 and have null destination. All actual bind mounts
must match the material set exactly and be read-only. Descriptor-held bytes,
no-follow parent/file identity and metadata are checked before/after preflight;
symlinks, hardlinks, mutations and wrong ownership/permissions fail closed.
Only ordinary secret-file binds under `/run/secrets/` are supported. Directory
overlays or other mount purposes require a separately reviewed successor.

The runtime manifest binds `opsCommit`, `runtimeCommit`, canonical content
hashes `bindingSha256`/`targetSha256`/`configSha256` and independently approved
`physicalSchemaSha256`. These content hashes are deliberately distinct from
the CLI's input-file byte hashes; the external manifest is not self-inventoried.
It must be created after source review and exact baseline capture.

The fixed read-only physical catalog query hashes columns/defaults, relations,
owners/ACLs, constraint definitions/validation, indexes, triggers/functions,
enums, row-security policies, views/materialized views and sequence parameters.
Preflight checks the digest twice and requires zero unvalidated public
constraints. All table/ledger/readiness/watchdog contents must still equal the
independently bound collection. A sealed source additionally requires zero
other database connections before and after. This is not a backup or a frozen
database: sequence current values, materialized-view contents and broader
restore-compatibility proof remain part of the future rehearsal package.

`green_staging_106_106_image.mjs` consumes `docker image save` stdout only,
without extraction, pulls, temporary files or new containers. Its bounded tar
reader validates header checksums, config-image SHA, ordered layer diffIDs,
effective layer whiteouts, exact 001–106 migration bytes and passwd/group-derived
nonroot identity. It accepts the explicitly tested USTAR/POSIX-PAX variants;
unsupported formats, consumed links/xattrs, duplicate paths, invalid traversal,
missing/extra/changed migrations and unreadable migration paths fail closed.
It verifies image Env/OCI version/commit/build-time equality and reconstructs
effective provider/config state from image defaults plus the protected env file;
APP identity overrides, duplicates, omissions and changed effective values fail.

Running and sealed sources retain exact immutable ID/image/config/mount/env and
network-ID bindings. A sealed source must have the exact bound sealed name,
be stopped, and be absent from active network membership; all remaining members
including router and database are unchanged. Inventories are rechecked before
and after all reads. No name-based fallback or old-image restart exists.

Pure disposable primitives specify new run-scoped names/labels, exact image and
captured-ID ownership checks, an internal network, and anonymous attached PG
storage only. They do not create or remove resources. Resource lifecycle,
response-loss handling and actual cleanup belong to the later executor.

Preflight PASS remains **read-only evidence**, with
`namespaceReadabilityVerified=false`, `rehearsalPassed=false`,
`promotionAuthorized=false` and `mutationAdapterImplemented=false`. Static
UID/group/mode proof does not replace the exact candidate namespace's future
material readability/config import probe. Synthetic image archives and mocked
root-material metadata are not actual Docker-image or host-material proof.

## Exact remaining modules, in order

1. **Runtime namespace proof and explicit protected evidence writing**:
   Add the separately consented, isolated exact-image material readability and
   config-import probe; prove mounted target parent traversal as the resolved
   nonroot user without weakening root-only host parents. Any future writer
   needs its own explicit mode and 0600/0700 no-follow held-descriptor contract.
   Verify the actual exported image format in the authorized target environment
   before claiming operational runtime proof; unsupported export variants fail.

2. **Disposable lifecycle and complete restore compatibility**:
   `backend/ops/green_staging_106_106_database.mjs`,
   `backend/ops/green_staging_106_106_resources.mjs` and
   `backend/test/fixtures/green_106106_docker.js`.
   Extend the pure ownership/storage primitives into the stateful executor.
   Complete sequence-value/materialized-view and restore-compatibility checks;
   orchestrate strict comparisons and the bounded startup heartbeat exception.
   Use new run-scoped names/labels, exact-ID lifecycle checks, anonymous volumes
   attached to owned containers and cleanup by captured IDs. Tests must model
   Docker mount permutation, active network membership and stopped-source
   absence, router preservation, foreign joins and response-loss handling.

3. **Protected rehearsal and isolated acceptance**:
   `backend/ops/green_staging_106_106_execution.mjs` plus
   `backend/test/green_staging_106_106_execution.test.js`.
   Validate all inputs/tools/material/readability and the fresh target first;
   require explicit rehearsal consent. Quiesce/seal the exact source and prove
   no DB writers, create an exclusive verified backup, restore its held bytes
   into owned isolated PG16 after init-complete plus two SELECT 1 successes.
   Start the immutable candidate only in an isolated DB/uploads context with
   neutral providers; require exact version/readiness and synthetic MFA/identity
   acceptance. No migration delta is allowed; startup must leave all baseline
   data, schema, ledger/timestamps and readiness findings unchanged (apart from
   the validated one-heartbeat transition) before
   synthetic fixture activity. Verify fixture cleanup separately. Cleanup
   failure overrides PASS. Source remains sealed/stopped; no automatic restart.

4. **Separately confirmed canonical swap and evidence**:
   extend the same new executor, never the old 98→106 runner. Require a fresh
   successful receipt (maximum one hour), exact backup/material/source bindings
   and distinct promotion consent. Recheck sealed source and the complete
   baseline network/router membership minus the stopped source. Write an
   exclusive canonical-started receipt before candidate start. Bind the new
   container's ID/config/image/UID/mounts; confirm unchanged DB/ledger/data and
   exact source/readiness before the final public attachment. Membership after
   swap equals the bound baseline minus old API plus the exact successor ID/name.
   Any failure after the boundary isolates the exact successor and requires
   reviewed forward recovery; never restart the old image, down-migrate or
   restore canonical data automatically. Preserve sealed originals and evidence.

## Reuse boundary

Safe candidates, imported without altering their source, are the canonical
hash/ledger primitives, complete-mount and network-member normalization,
held-descriptor evidence I/O, least-privilege material reading and bounded MFA
probe. Their exact Git/source hashes must enter the successor inventory.
`green_staging_98_106_execution.mjs` is not reusable as an executor: its runtime,
schema delta, emptiness checks and receipt semantics are specific to 98→106.
`readSnapshot` also forbids populated post-98 namespaces; `OwnedDocker` embeds
98→106 resource names/labels. Those need narrow successor adapters or a reviewed
new shared implementation, with old files/evidence preserved.

## Focused first-slice verification

```sh
SIT_GREEN_106_106_PG16=1 node --import ./backend/test_setup.js --test backend/test/green_staging_106_106_contract.test.js backend/test/green_staging_106_106_collector.test.js backend/test/green_staging_106_106_preflight.test.js backend/test/green_staging_106_106_postgres.integration.test.js
node --test test/tool/validate_green_staging_106_106_runtime.test.mjs
```

Before a later commit, perform Sol review, current-consumer closure and the
standard backend gate once for the completed bounded module. Pure fixture tests
cannot close image execution, operational rehearsal, promotion or public release.
