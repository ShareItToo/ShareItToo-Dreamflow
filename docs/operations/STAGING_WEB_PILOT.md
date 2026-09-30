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

## Required separately authorized first-install gate

The installer intentionally has **no bootstrap mode**. Before using it, verify
the exact live Caddy mount inventory and preserve the gateway/Caddy configuration
as an owner-only backup. Provision a separate, owner-controlled
`/docker/shareittoo/staging-web` with `releases/` and a reviewed, checksum-valid
prior release; `current` must be the relative symlink
`releases/<prior-manifest-sha256>/web`. Do not fabricate prior-Web evidence from
the gateway placeholder. If no accepted prior release exists, stop and request
a bounded initial-seed/rehearsal package. That prerequisite is currently not
proved by this source-only package.

Caddy uses the already live-verified **existing read-only directory bind**
`/docker/shareittoo -> /app`. Its exact Staging root is
`/app/staging-web/current`, corresponding to the helper's host-side
`/docker/shareittoo/staging-web/current`. Atomic relative-symlink switches remain
inside this existing directory mount. No new mount or container recreation is a
prerequisite. Do not replace or alias Production `/app/current`. The source
Caddyfile changes only the Staging default handler; API, legal, support and
assetlinks stay ahead of the SPA fallback. Reconfirm the binding in deployment
preflight, validate the actual Caddy configuration, then obtain separate approval
before its live reload. No helper performs SSH, Caddy reload, container recreation,
DNS or Production actions.

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
node --test test/tool/staging_web_contract.test.mjs test/tool/p0a_web_smoke_readiness.test.mjs test/tool/prepare_public_store_route_rollout.test.mjs
node tool/check_current_consumer_closure.mjs
git diff --check
```

The permanent technical gate discovers all `test/tool/*.test.mjs`. The historical
20260811 route evidence stays frozen; its test reconstructs only the replaced
Staging placeholder to prove all unchanged route bytes still match. Actual
browser pilot acceptance, live route/mount readback and native capability proof
are later gates, not implied by static HTTP smoke or VM cache tests.
