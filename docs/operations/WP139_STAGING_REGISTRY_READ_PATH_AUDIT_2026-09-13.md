# WP139 — Staging private-registry read-path audit

Status: **COMPLETE AS A READ-ONLY AUDIT; AUTHENTICATED METADATA READ PASSES,
LEAST-PRIVILEGE SCOPE AND FRESH LAYER PULL REMAIN OPEN**.

## Why this package came next

The conservative WP138 portfolio left four product areas PARTIAL and eight
OPEN. Most product gaps are intentionally held behind V5.2, Stripe or another
external owner decision. The durable private-registry pull was the highest
value infrastructure gap that could first be narrowed without touching the
Android candidate, Staging runtime or an external account configuration.

WP64 had deployed from an exact checked-out source tree only because the
server authorization available at that time could not read the private GHCR
package. That local-build route remains valid historical Staging evidence, but
it is not accepted as a permanent release dependency.

## Exact read-only result

GitHub workflow-dispatch run `34755213368` passed Backend, PostgreSQL, Flutter
and independent clean-checkout verification, then published exact source
`fb04892331758e19b2b3835026ed8174e382dfb7` as
`ghcr.io/shareittoo/shareittoo-api:fb04892331758e19b2b3835026ed8174e382dfb7`.
The dedicated Staging connection then resolved the private image with the
server's already-present Docker authorization:

- manifest digest
  `sha256:abd9a7c5b58ee875d10b3818d457db4101943d8b329bcbf963d19dcf24e71e6e`;
- platform `linux/amd64`;
- OCI revision `fb04892331758e19b2b3835026ed8174e382dfb7`;
- OCI version `0.1.0-fb0489233175`;
- eleven layers, 94,258,580 compressed bytes.

Both authenticated manifest and image-config reads passed. The protected
Docker configuration exists as owner `root`, mode `0600`. Its credential value
was not read, decoded, copied or emitted. Anonymous manifest and anonymous
token requests both returned `401`; the local GitHub CLI package API returned
`403`, consistent with its missing package-read scope.

The Staging API remained on
`df39a14b7a19afe467842461a28f1e77fec8445e`, digest
`sha256:4d440d9481369b477b9495f5cefa419783f974ff35438c3490e54b42322ddfd6`,
with restart count zero. The new target was not present in the Docker image
cache before or after the audit.

## Why the requirement remains OPEN

The successful registry reads prove that the existing server authorization
can currently obtain the private manifest and config blob. They do not prove
that the stored credential has only the minimum `read:packages` scope. WP139
intentionally did not inspect or infer credential contents.

The target's ordered layer set also differs from the running image's layer set,
despite the Dockerfile-copied runtime source inputs being unchanged. A cached
image therefore cannot substitute for a fresh target-layer transfer. WP139 did
not run `docker pull`: the target is deliberately still uncached, and no VPS
cache or runtime mutation is disguised as a read-only check.

GitHub's current official Container registry documentation states that a
private image download uses a personal access token (classic) with at least
`read:packages`. Closure therefore requires one bounded action:

1. verify in the owner account that the existing server credential is
   package-read-only, or replace it with a dedicated `read:packages`-only
   credential;
2. pull the exact uncached tag by the digest above without switching or
   recreating the running container;
3. re-read the downloaded digest and OCI labels, verify the running container
   and restart count are unchanged, and retain only sanitized evidence.

Until that action is explicitly authorized and passes, portfolio requirement
`durable-private-registry-pull` remains **OPEN**. The portfolio therefore stays
at **20 PASS, 4 PARTIAL and 8 OPEN**.

## Verification and boundaries

The new repository-owned audit is fixed to read-only commands and rejects
digest or label drift. Six focused audit/evidence checks pass. The complete
local technical regression passes in the supported combined CI-metadata and
candidate-rollover mode, including analyzer, Flutter, Web/Wasm, loopback and
Android. Implementation Regression `34755676668`, including independent clean
checkout, and CodeQL `34755676684` both pass.

No credential, Docker login, package visibility, VPS configuration, VPS image
cache, Staging runtime, Production, Store, Firebase, payment, DNS, device or PR
merge state changed. The only external write was publication of the exact
commit-tagged private CI image through the already-established GitHub job.

Machine-readable evidence:
`docs/evidence/release-readiness/wp139-staging-registry-read-path-audit-20260913.json`.
