# Staging Web pilot contract

Source-only operational contract. No live deployment, public launch or native
acceptance follows from a local build. Production and Google Play are excluded.

## Build

From a clean exact-source checkout, with the repository's supported Flutter/Node
toolchain and existing dependency cache:

```sh
node tool/build_staging_web.mjs /absolute/clean/source EXACT_40_CHAR_HEAD /absolute/new/artifact
```

The helper rejects dirty/mismatched source and an existing output. It runs the
current-consumer/capacity guards, locked dependency resolution, release Web
compilation and loopback-only smoke. It fixes the API to
`https://staging.shareittoo.com/api/v1`, internal staging-only Web shell profile,
both synthetic lanes off, no public booking-group release and no CDN resources.
No caller-supplied flags are forwarded. No Firebase credentials are read or copied.

This initial Web shell explicitly sets `SIT_SOCIAL_GOOGLE_ENABLED=false`
(Apple/Facebook also false), because `FirebaseRuntimeConfig.currentOptions`
returns null on Web. It also sets `SIT_BLUE_OCEAN_LISTING_ASSISTANT=false` and
`SIT_STAGE_A_NON_BINDING_PILOT=false`, because `OnDeviceListingAnalysisService`
rejects Web. These temporary fail-closed boundaries are **not functional closure
by hiding controls**. `SIT_STAGE_A_PILOT_ID` is empty and
`SIT_SOCIAL_PROVIDER_ACTIVATION_VALIDATED=false`; there is no inactive pilot or
provider identity. The four technical UI flags for booking groups, planner,
supply enrichment and listing sets are false because the signed Stage-A envelope
is false. Core shared booking/listing/profile flows remain independent, and
existing backend/product guards stay unchanged. This shell does not claim Stage-A
simulation or provider parity. The immediate next functional package must implement and prove working
Web Google authentication and a real Web-capable listing-AI path before their
flags are re-enabled. Native login, push, camera/QR and install/update remain
separate physical-device gates. No real-money/provider activation is authorized.

Output contains only `web/`, `staging-web-manifest.json` and `SHA256SUMS`.
The manifest binds source SHA, source cleanliness, version, exact defines,
Flutter revision, builder+contract digest and every served file. Its SHA must be
approved out of band; the deployer never trusts an artifact's self-declared hash.
This is a repeatable input contract, not a claim of byte-identical Flutter output
across different toolchains. No timestamps or local/private paths enter it.

## Cache isolation

`--pwa-strategy=none` is required (currently supported but deprecated by Flutter;
its removal must fail the build until a reviewed successor exists).
Only the artifact's Staging index is wrapped. Before Flutter starts, the wrapper
unregisters an old `/flutter_service_worker.js` and removes the three known
Flutter caches, with an eight-second deadline. A controlled old tab reloads once;
failure remains visible instead of starting stale code. The retirement worker
also replaces old installations without a fetch handler. Neither path runs on
Production; user/application storage is not erased. Caddy sets `no-store` on all
Staging shell/assets, including entry, bootstrap and retirement worker.

## Separately authorized first installation

Ordinary `deploy_staging_web.mjs` still requires a real prior Web release and has
**no bootstrap bypass**. The separate `bootstrap_staging_web.mjs` transaction
accepts only an absent Web current/previous pointer. Its rollback truth is the
currently served exact `ShareItToo staging gateway` response plus the exact
original Caddyfile, never an invented prior Web manifest.

Caddy uses the already live-verified **existing read-only directory bind**
`/docker/shareittoo -> /app`. Its exact Staging root is
`/app/staging-web/current`, corresponding to the helper's host-side
`/docker/shareittoo/staging-web/current`. Atomic relative-symlink switches remain
inside this existing directory mount. No new mount or container recreation is a
prerequisite. Do not replace or alias Production `/app/current`. The source
Caddyfile changes only the Staging default handler; API, legal, support and
assetlinks stay ahead of the SPA fallback. Reconfirm the binding in deployment
preflight, validate the actual Caddy configuration, then obtain separate approval
before its live reload. Ordinary deployment performs no Caddy reload. Only the
explicit first-install transaction below can validate/reload the bound Caddy
instance; neither helper performs SSH, container recreation, DNS or Production
content changes.

### Protected preflight inputs

The CLI requires root, an exact clean source checkout containing the executor,
and the matching accepted Web artifact. It accepts a root-owned `0600` manifest
in a root-owned `0700` directory, plus its independently verified SHA256. Before
this transaction, separately authorize preparation of the exact root-owned
`0600` backup at
`/docker/shareittoo/backups/staging-web-bootstrap/Caddyfile.<gatewayConfigHash>.backup`;
that immediate directory must be root-owned `0700`. The transaction never
overwrites or prints this backup. Do not include environment, credentials or raw
Docker inspect output in either input. Manifest fields:

| Field | Required value / fresh evidence |
| --- | --- |
| `schemaVersion`, `target` | `1`, `https://staging.shareittoo.com` |
| `runId` | New `web-bootstrap-` plus 1–64 lowercase letters/digits/hyphens |
| `source`, `artifactHash` | Exact 40-character source SHA and accepted artifact manifest SHA256 |
| `gatewayConfigHash`, `candidateConfigHash` | Backup/live gateway Caddyfile SHA256 and source `backend/ops/Caddyfile` SHA256 |
| `containerId`, `containerName` | Fresh full Docker ID; fixed `shareittoo-web` |
| `image`, `imageId`, `version` | Exact image reference, immutable image SHA256 without prefix, Caddy version token |
| `mountsHash` | `mountDigest()` of fresh `.Mounts`; sorted Type/Source/Destination/RW/Mode projection only |
| `hostFile` | Fresh numeric `{inode, device, uid:0, gid:0}`; regular single-link root:root `0644` file required |

Observed 2026-09-30 binding (context, **not** reusable execution authority):
`caddy:2.10-alpine`, Caddy `v2.10.2`; host inode `853592`, size `2825`;
host and container Caddyfile SHA256
`6e5bf590292e7a28fc38ac1d43a68b1d4697831db33d6b49c0b9d1f21c0aca5b`.
The config is a read-only **file bind** from `/docker/shareittoo/Caddyfile` to
`/etc/caddy/Caddyfile`. Fresh inspect must prove both this binding and the
read-only `/docker/shareittoo -> /app` directory binding, no shadow mount and no
automatic `--watch` reload. Drift aborts; no stale-value fallback exists.

```sh
# Default: preflight only, no copying, file changes or Caddy reload.
node /absolute/clean/source/tool/bootstrap_staging_web.mjs /absolute/private/manifest.json MANIFEST_SHA /absolute/clean/source /absolute/accepted/artifact
# A separately authorized first install appends exactly --execute-bootstrap.
```

Preflight reads the mounted bytes, Caddy active JSON via its container-local
admin endpoint, and the HTTPS gateway body. It validates/adapts both configs
through `docker exec -i <exact-id> caddy validate|adapt --config /dev/stdin
--adapter caddyfile`. The active JSON must equal the adapted gateway config;
missing admin readback/tool support fails closed. Reconstructing the gateway
from the candidate is restricted to the exact Staging handler, so every other
Production/API/legal/assetlink byte must be unchanged.

Execution uses the ordinary deployment lock, validates/copies the artifact,
atomically creates `current` (no replacement), and installs config bytes through
the opened original host inode, with truncate/write/fsync and host/container
hash readback. **Never rename this Caddyfile:** its file bind would retain the
old inode. It then runs `docker exec <exact-id> caddy reload --config
/etc/caddy/Caddyfile --adapter caddyfile`, verifies active JSON, and compares the
four served static identity/bootstrap bytes. Commands and HTTPS requests are
bounded; no API/provider request is made.

On any failure after config mutation, restore the exact backup through the same
inode, validate/reload it, verify active gateway config and exact gateway body,
then remove only this transaction's exact `current` symlink. Before config
mutation, failures verify the unchanged gateway without an unnecessary reload.
Partial/failed copied releases are retained, never served as rollback truth.
A foreign runtime/config drift or failed recovery retains the lock and reports
`bootstrap_rollback_failed_manual_recovery_required`; never overwrite a foreign
active configuration or automatically remove that lock. The owner-only
`<runId>.json` journal in the backup directory records PASS only after readback,
otherwise restored/failure state. Colliding journal/release paths abort.

Local injected rehearsals prove transaction branches, not actual Caddy command,
mount, network or browser acceptance. No live first installation has occurred
in this source package. Interrupted processes/power loss require operator
inspection of the journal, original backup, inode, active JSON and current;
this is not a promise of crash-atomic multi-resource deployment.

## Preflight, switch and rollback

On the deployment host, the CLI root and origin are fixed. A clean checkout of
the exact artifact source must be available for source readback. Replace the
uppercase placeholders with independently verified values:

```sh
node tool/deploy_staging_web.mjs https://staging.shareittoo.com /absolute/clean/source EXACT_HEAD /absolute/artifact CANDIDATE_MANIFEST_SHA CURRENT_MANIFEST_SHA
# Only after separate deployment authorization, append --execute.
```

Default preflight changes nothing and performs no network request. Execution
takes an exclusive directory lock, validates/copies the complete candidate into
its manifest-addressed release directory, writes `previous`, atomically renames
`current`, and checks the exact served entry/bootstrap/worker/identity bytes over
bounded HTTPS requests. It never calls APIs/providers. A failed readback restores
the prior pointer and validates its bytes. Failed candidates and old releases
remain available for investigation; no automatic cleanup/overwrite occurs.

Explicit recovery after a successful switch uses the same guards, the previous
artifact's clean source checkout and hashes in reversed roles:

```sh
node tool/deploy_staging_web.mjs https://staging.shareittoo.com /absolute/prior/clean/source PRIOR_HEAD /absolute/prior/artifact PRIOR_MANIFEST_SHA CURRENT_MANIFEST_SHA --preflight-rollback
# Only after recovery authorization, replace --preflight-rollback with --rollback.
```

Recovery accepts only the exact validated `previous` target, never an arbitrary
existing release. Symlink/parent escapes, foreign current, missing/corrupt prior
artifact, special/hardlinked files, extra/missing files, hash/profile drift and
concurrent/colliding deployment fail closed. A killed process may leave a lock;
do not automatically remove it. Inspect current/previous, process ownership and
both manifests first. `rollback_failed_manual_recovery_required` is a hard stop,
not a deployment success. Retained `previous` is the recovery reference. This
provides atomic process-level switching, not a power-loss durability guarantee.

## Focused proof

```sh
node --test test/tool/staging_web_bootstrap.test.mjs test/tool/staging_web_contract.test.mjs test/tool/p0a_web_smoke_readiness.test.mjs test/tool/prepare_public_store_route_rollout.test.mjs
node tool/check_current_consumer_closure.mjs
git diff --check
```

The permanent technical gate discovers all `test/tool/*.test.mjs`. The historical
20260811 route evidence stays frozen; its test reconstructs only the replaced
Staging placeholder to prove all unchanged route bytes still match. Actual
browser pilot acceptance, live route/mount readback and native capability proof
are later gates, not implied by static HTTP smoke or VM cache tests.
