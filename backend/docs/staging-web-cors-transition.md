# Staging Web CORS transition — source-only preparation

This is not a deployment or execution approval. The default command is read-only
preflight. It reuses the registration runner's tested container reconstruction,
exact configuration comparison, response-loss reconciliation and rollback. A
separate manifest kind and confirmation namespace cannot enable registration.

## Exact scope

- Only `shareittoo-staging-api` in the existing `sit-green` topology; schema 98
  and its exact ledger are required. Same pinned image, mounts, labels, resource
  settings and both network identities are retained.
- The real executor accepts only `/docker/shareittoo/ops/green.env`, regular,
  owner-bound `0600`. All file bytes except the existing `CORS_ORIGINS` value
  remain unchanged, including comments, line endings and unrelated credentials.
- The only allowed delta is
  `http://shareittoo-staging-api:8080` →
  `http://shareittoo-staging-api:8080,https://staging.shareittoo.com`.
- Firebase Auth remains true, Google registration false/empty, the closed
  access gate true, phone false, memory payments, Stripe off and external AI off.
  The allowed-user list is byte-identical. No valid tokens or provider calls.
- `shareittoo-api`, `shareittoo-web` and the exact Production root response are
  read-only witnesses before/after the switch and after rollback. Never mutate
  those witnesses to make a drift check pass. A changing Production root is a
  blocker, not permission to loosen the digest.

## Fresh private manifest

Create outside Git, owner-only `0600`, using fresh read-only inventory. Reuse the
existing registration runtime manifest topology schema, **not** old values:
`kind: sit-staging-web-cors-runtime-manifest`, schemaVersion 1, current immutable
`apiContainerId`, exact image/revision/digest, networks, mounts, root env owner
and safetyEnv. Do not include a mapping or finalizationBinding.

Add `corsBinding` with exactly these SHA-256/full-ID fields:

| Field | Fresh source |
| --- | --- |
| `apiFingerprint` | `corsContainerFingerprint(currentApiInspect)` |
| `envSha256` | SHA-256 of exact current protected env bytes |
| `productionApiId` | `shareittoo-api` immutable Docker ID |
| `productionApiFingerprint` | `corsContainerFingerprint(productionApiInspect)` |
| `webId` | `shareittoo-web` immutable Docker ID |
| `webFingerprint` | `corsContainerFingerprint(webInspect)` |
| `productionRootSha256` | SHA-256 of the 200, no-redirect `https://shareittoo.com/` body |

The exported fingerprint hashes the captured ID/name/image/config/env/host
configuration/mounts/network identities and running state. Compute in memory;
never write raw `docker inspect`, env content or credentials into evidence.
Only the observed unordered Docker `Mounts` collection is sorted as complete
records (all fields and duplicates retained). Other arrays, including env,
security options, DNS and network aliases, remain order-sensitive. Regenerate
all three container fingerprints from fresh readbacks with this exact helper;
do not reuse manifests produced by the earlier order-sensitive mount hashing.
Public fingerprint values are not evidence that stale inventory is current.

## Intended default invocation (not executed by this package)

```sh
STAGING_WEB_CORS_RUNTIME_MANIFEST=/docker/shareittoo/evidence/web-cors-runtime.json \
node backend/ops/enable_staging_web_cors.mjs
```

Expected: `preflight-passed-no-mutation`; no evidence success file, no lock, no
container or env mutation. The host needs its reviewed Node runtime, Docker CLI
and HTTPS access; no package installation or alternate container is automatic.

Only after independent preflight/review and dedicated execution approval:

```sh
STAGING_WEB_CORS_RUNTIME_MANIFEST=/docker/shareittoo/evidence/web-cors-runtime.json \
STAGING_WEB_CORS_EVIDENCE_FILE=/docker/shareittoo/evidence/web-cors-transition-UNIQUE.json \
STAGING_WEB_CORS_EXECUTE=1 \
STAGING_WEB_CORS_CONFIRM=EXACT_RUNTIME_REVISION_FROM_MANIFEST \
node backend/ops/enable_staging_web_cors.mjs
```

Use a fresh unused evidence path. Execute mode takes an exclusive env-adjacent
lock; an existing lock/symlink blocks execution and is never auto-deleted.
Coordinate against all other Ops writers as well: this bounded lock protects
this transition, not unrelated operational tools.

## Success and recovery

The original immutable container is stopped and retained as
`shareittoo-staging-api-web-cors-rollback-<original-id-prefix>`. The replacement
uses the same image digest and exact primary network name-or-ID representation.
Only captured immutable IDs are used for stop/rename/start/remove operations.
Readback checks exact env bytes/digests, complete unrelated config, live/ready,
version, schema/ledger, closed registration and the retained original seal.

Fixed external probes require Origin `https://staging.shareittoo.com`:
OPTIONS `/api/v1/auth/register` → 204 with matching CORS headers;
POST of `{}` → 403 with matching CORS header and
`staging_registration_disabled`. Empty POST contains no account material. Real
local API tests prove this closed path never accesses the DB; operational probes
use read-only user/Google-identity counts before/after (counts alone do not prove
absence of all concurrent database work). Production witnesses must be unchanged.

On forward failure, restore the exact original env bytes and original container,
verify identity/running state, and retain no success evidence. Uncertain Docker
responses are reconciled against actual immutable identity; ambiguous state,
concurrent env changes or failed recovery are reported explicitly, never hidden.
Do not retry an unrestored result or remove its seal/lock blindly. After successful
transition the original container remains a recoverable seal; reconstructing the
prior env requires only reversing this exact one-line value and verifying the
manifest's original env SHA before a separately approved rollback.

Abrupt process/host termination is not an automatic crash-recovery transaction:
inspect the retained immutable IDs, protected env SHA and lock before any manual
recovery. Source/local fixture PASS is not live Docker/HTTPS completion.
