# Green 106 → 106 successor run for runtime `20657fc1`

This is a parameterized operator recipe, not execution evidence or deployment
approval. It uses the current clean Ops checkout
`/docker/shareittoo/ops/green-106106-source-20657fc1531229dd12a8a5a092d90f82a2aa8123`
and keeps the runtime fixed at
`20657fc1531229dd12a8a5a092d90f82a2aa8123`. GHCR publication run
`40280709498` completed successfully. Its schema-2 publication artifact has
raw SHA-256
`7dd472a1fe86d9839bf686276f1d9207bdaca617ba2b0ed7d3fa7bd78e512ab1`
and binds digest
`sha256:a6ee95a5b1e8e243dd6d1352e4e507e9d9733059679a1119620d38b6913683a0`
to the exact runtime commit. Collection may start only after these bytes and
the pulled image's OCI revision are independently verified on the target host.

## Fresh inputs and protected workspace

Run on `sit-staging-vps` as the approved operator, from the exact Ops checkout
above, with Node `22.23.3` and pnpm `11.16.0`. Use the repository's current
reviewed `opsCommit` and `reviewedCommit`; they must satisfy the source gate in
`validateSuccessorSource`. Runtime commit remains the value above. Use a new
run ID matching `[a-z0-9][a-z0-9-]{7,47}`. Never copy a prior run ID, receipt,
binding, target, config, manifest, rehearsal, backup, or confirmation.

Create a new root-owned operator evidence directory with mode `0700`. Place
the exact GHCR publication JSON there as a single-link owner-owned regular file
with mode `0600`; record its raw-byte SHA-256. Capture a **fresh** sanitized
scope JSON from current exact-ID readbacks. It must describe the current API,
database, both networks, upload volume, and every Green witness (including
stopped witnesses), with the exact fields in the successor plan. Do not build
scope from old receipts or from names/counts remembered from a previous run.
Save it as a single-link owner-owned `0600` file and record its raw SHA-256.
No secret contents belong in publication, scope, or command output.

```sh
set -eu
umask 077
RUN_ID='<fresh-lowercase-run-id>'
RUNTIME_COMMIT=20657fc1531229dd12a8a5a092d90f82a2aa8123
OPS_COMMIT='<current-reviewed-ops-commit>'
REVIEWED_COMMIT='<independent-reviewed-commit>'
EVIDENCE_DIR='/docker/shareittoo/evidence/green-106106-<fresh-run-id>'
OPS_ROOT='/docker/shareittoo/ops/green-106106-source-20657fc1531229dd12a8a5a092d90f82a2aa8123'
PUBLICATION="$EVIDENCE_DIR/publication.json"
SCOPE="$EVIDENCE_DIR/scope.json"
IMAGE_ID='<fresh-docker-image-inspect-id-sha256:...>'
```

The placeholders above are values to populate only from current direct
readbacks. Before proceeding, verify the checkout is clean at `OPS_COMMIT`,
the reviewed commit is an ancestor, runtime has exactly migrations 001–106,
the published OCI revision/digest identifies runtime `20657…`, and the local
candidate image ID has the publication digest in `RepoDigests`. A tag alone is
not image identity.

## Bind, collect, and read-only preflight

Run the binding preparation helper from the reviewed Ops source tree after the
helper itself is present there. It reads only the protected publication and
fresh scope files, verifies their raw hashes and schemas, derives the full
source inventory from the current checkout, checks exact reviewed Git blobs,
and writes a new protected binding. `BINDING_SHA` is the binding file's raw
byte SHA-256 printed by the helper; the canonical content SHA is distinct.

```sh
cd "$OPS_ROOT"
node tool/prepare_green_staging_106_106_binding.mjs \
  --runtime-commit "$RUNTIME_COMMIT" --ops-commit "$OPS_COMMIT" \
  --reviewed-commit "$REVIEWED_COMMIT" \
  --publication "$PUBLICATION" --publication-sha256 '<publication-raw-sha256>' \
  --scope "$SCOPE" --scope-sha256 '<scope-raw-sha256>' \
  --candidate-image-id "$IMAGE_ID" --evidence-directory "$EVIDENCE_DIR" \
  --output-name "$RUN_ID.binding.json"
BINDING="$EVIDENCE_DIR/$RUN_ID.binding.json"
BINDING_SHA='<binding-raw-sha256-from-helper>'
```

Then collect once. Collection is read-only. Preserve its sanitized stdout as a
new `0600` file; it must report `collected_not_authorized`. Extract the target
from that output into a new exclusive `0600` file and calculate both the target
raw SHA and canonical `objectDigest(target)` returned as `targetSha256`.
These are different hashes. Do not proceed if collection reports drift or any
inventory mismatch.

```sh
node tool/validate_green_staging_106_106_runtime.mjs \
  --mode collect --binding "$BINDING" --binding-sha256 "$BINDING_SHA" \
  --publication "$PUBLICATION" --publication-sha256 '<publication-raw-sha256>' \
  > "$EVIDENCE_DIR/$RUN_ID.collection.json"
node -e 'const fs=require("node:fs");const x=JSON.parse(fs.readFileSync(process.argv[1]));if(x.status!=="collected_not_authorized")process.exit(2);fs.writeFileSync(process.argv[2],JSON.stringify(x.target)+"\n",{flag:"wx",mode:0o600});process.stdout.write(x.targetSha256+"\n")' \
  "$EVIDENCE_DIR/$RUN_ID.collection.json" "$EVIDENCE_DIR/$RUN_ID.target.json"
TARGET="$EVIDENCE_DIR/$RUN_ID.target.json"
TARGET_SHA='<target-file-raw-sha256>'
TARGET_CONTENT_SHA='<targetSha256-from-collection>'
```

Create a new execution config and runtime manifest only from current direct
readbacks. The config binds `sourceState`, exact sealed source name, run ID,
resolved UID/GID, every root-owned material descriptor, and the env-file
descriptor. Keep secret bytes out of the files and transcript; only approved
paths, metadata, and SHA-256 values are recorded. The runtime manifest binds
the canonical content hashes of binding, target, and config plus a fresh
physical-schema hash. `configSha256`, `bindingSha256`, `targetSha256` in that
manifest are canonical object hashes. CLI `*-sha256` arguments below are raw
file hashes.

```sh
CONFIG="$EVIDENCE_DIR/$RUN_ID.execution-config.json"
MANIFEST="$EVIDENCE_DIR/$RUN_ID.runtime-manifest.json"
CONFIG_SHA='<execution-config-raw-sha256>'
MANIFEST_SHA='<runtime-manifest-raw-sha256>'
node tool/validate_green_staging_106_106_runtime.mjs \
  --mode preflight --binding "$BINDING" --binding-sha256 "$BINDING_SHA" \
  --publication "$PUBLICATION" --publication-sha256 '<publication-raw-sha256>' \
  --target "$TARGET" --target-sha256 "$TARGET_SHA" \
  --execution-config "$CONFIG" --execution-config-sha256 "$CONFIG_SHA" \
  --runtime-manifest "$MANIFEST" --runtime-manifest-sha256 "$MANIFEST_SHA" \
  > "$EVIDENCE_DIR/$RUN_ID.preflight.json"
```

Preflight must return a fresh `read_only_preflight_passed` receipt. It is not
authorization. Verify all expected live readbacks, including unchanged schema,
database snapshot, exact container/network/mount identities, zero other DB
connections for sealed source, and current physical schema. Record the receipt
raw-byte SHA for stable reading and compute its canonical `objectDigest` for
the rehearsal confirmation.

## Rehearse and promote gates

Rehearsal performs controlled, isolated resource mutations and seals the exact
source; run it only after Sol confirms the fresh preflight. Confirmation is
exactly
`rehearse:$RUNTIME_COMMIT:$OPS_COMMIT:$TARGET_CONTENT_SHA:$PREFLIGHT_CONTENT_SHA`.
Keep the rehearsal stdout/evidence protected and record the resulting
`$RUN_ID.rehearsal.json` raw-byte SHA.

```sh
PREFLIGHT="$EVIDENCE_DIR/$RUN_ID.preflight.json"
PREFLIGHT_SHA='<preflight-raw-byte-sha256>'
PREFLIGHT_CONTENT_SHA='<canonical-objectDigest-of-preflight>'
node tool/validate_green_staging_106_106_runtime.mjs \
  --mode rehearse --binding "$BINDING" --binding-sha256 "$BINDING_SHA" \
  --publication "$PUBLICATION" --publication-sha256 '<publication-raw-sha256>' \
  --target "$TARGET" --target-sha256 "$TARGET_SHA" \
  --execution-config "$CONFIG" --execution-config-sha256 "$CONFIG_SHA" \
  --runtime-manifest "$MANIFEST" --runtime-manifest-sha256 "$MANIFEST_SHA" \
  --preflight "$PREFLIGHT" --preflight-sha256 "$PREFLIGHT_SHA" \
  --evidence-directory "$EVIDENCE_DIR" \
  --confirm "rehearse:$RUNTIME_COMMIT:$OPS_COMMIT:$TARGET_CONTENT_SHA:$PREFLIGHT_CONTENT_SHA" \
  > "$EVIDENCE_DIR/$RUN_ID.rehearsal-cli.json"
```

Canonical promotion is a separate action after Sol's rehearsal review. It
requires a fresh current-state review immediately before the command and must
remain within the standing Staging authorization. Confirmation is exactly
`promote:$RUNTIME_COMMIT:$OPS_COMMIT:$REHEARSAL_RAW_SHA`. Success is only
`promoted_owner_smoke_pending`; it does not complete public release. Owner smoke
and release evidence remain a separate gate.

```sh
REHEARSAL="$EVIDENCE_DIR/$RUN_ID.rehearsal.json"
REHEARSAL_SHA='<rehearsal-raw-byte-sha256>'
node tool/validate_green_staging_106_106_runtime.mjs \
  --mode promote --binding "$BINDING" --binding-sha256 "$BINDING_SHA" \
  --publication "$PUBLICATION" --publication-sha256 '<publication-raw-sha256>' \
  --target "$TARGET" --target-sha256 "$TARGET_SHA" \
  --execution-config "$CONFIG" --execution-config-sha256 "$CONFIG_SHA" \
  --runtime-manifest "$MANIFEST" --runtime-manifest-sha256 "$MANIFEST_SHA" \
  --rehearsal "$REHEARSAL" --rehearsal-sha256 "$REHEARSAL_SHA" \
  --evidence-directory "$EVIDENCE_DIR" \
  --confirm "promote:$RUNTIME_COMMIT:$OPS_COMMIT:$REHEARSAL_SHA" \
  > "$EVIDENCE_DIR/$RUN_ID.promotion.json"
```

Do not execute this recipe from the old c904 evidence directory. It provides no
binding authority for this successor. The publication artifact and its
digest/OCI readback are now available; subsequent gates require new scope,
source review, target, protected materials, physical-schema readback,
preflight and rehearsal review.
