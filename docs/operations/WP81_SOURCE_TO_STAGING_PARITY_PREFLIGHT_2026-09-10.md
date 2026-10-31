# WP81 — Source-to-Staging parity preflight

Status: **COMPLETE AS A READ-ONLY PREFLIGHT; SUCCESSOR DEPLOYMENT REMAINS
BLOCKED.**

## Exact historical candidate binding

The installed Pixel/Internal candidate `1.0.0+2026090905` is bound to source
`e1c182ea496f013989863155c13bfda649255a7e`. The Staging runtime evidence is
bound to `baf9267c8bff7533230f3234c1f543649df6e4aa`.

The commit ancestry and the complete runtime-relevant diff were re-evaluated:
there are zero changed paths under Backend source/schema, Flutter, Android,
iOS, package metadata or runtime assets between those two commits. Their exact
Backend and Flutter tree identities also match. Therefore the earlier Pixel
acceptance evidence remains correctly bound to that Staging runtime.

## Successor separation

The current source at the preflight baseline contains sixteen later runtime
paths: the V5.3 legal draft set, the operator-readiness gate and the three
legal Flutter surfaces. It is source-quality tested, but it is not an
installed candidate and must not inherit physical-device acceptance evidence.
A future signed candidate must be built from an exact new source head and
bound to an exact Staging runtime before it can receive independent acceptance
evidence.

## Deployment boundary

The checked-in release harness requires an image labelled with the exact full
commit, a `--no-build` rollout, health readback of that same commit, verified
automatic rollback, and named Staging PostgreSQL/upload volumes. Those are
necessary safeguards, not permission to deploy.

WP77 remains independently blocking: no persistent, authoritative remote
Compose/environment source is proven to bind to the running Staging service,
and no safe recreate proof exists. Consequently this package performed no
remote read, deployment, container/database, Store, device, provider, payment
or Production action. It does not retry the failed Control-Panel path and
does not treat a similarly named remote file as authoritative.

The next safe action is read-only reconstruction of the exact persistent
remote source and rollback-safe recreate path. Only then can a separately
authorized successor deployment be considered.

## Verification

Focused WP81 tests and the complete 2,560-test tool inventory pass. The full
local technical regression also passes: Flutter analysis/tests, Web/Wasm and
loopback smoke, Android debug build/minSdk 24 and the R11 Android security
surface audit all complete without a temporary timing or parallelism exception.
Exact-head GitHub Regression `34415756777` passes Backend, Flutter,
PostgreSQL and clean-checkout jobs; image publication is skipped. CodeQL
`34415756339` passes, and the current PR-merge scan has zero open alerts.
PR #7 remains Draft, open, clean and unmerged.

Machine-readable evidence:
`docs/evidence/release-readiness/wp81-source-to-staging-parity-preflight-20260910.json`.
