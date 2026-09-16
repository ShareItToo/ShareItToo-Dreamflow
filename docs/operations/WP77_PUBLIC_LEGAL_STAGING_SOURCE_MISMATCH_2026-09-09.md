# WP77 — Public Legal Runtime and Staging Source Mismatch

## Status

**BLOCKED FAIL-CLOSED — no remote mutation performed.**

WP77 began after the WP76 source commit and its complete local, Regression and
CodeQL gates passed. Its sole purpose was to correct the three approved public
legal runtime values through an exact, rollback-safe Staging path. The required
target-to-source proof does not exist, so the running service was left
unchanged.

## Read-only findings

The public root imprint and privacy routes returned HTTP 200 with legacy
operator facts; the desired current operator facts were absent. The root
`/api/health` route returned HTTP 500. In contrast, the Staging API health
route returned HTTP 200 while the Staging page routes returned HTTP 503. The
public routes and the independently healthy Staging API therefore cannot be
treated as one proven runtime target.

The authenticated Staging inventory did prove a healthy API and PostgreSQL
pair, restart count zero, a retained current image, a separately retained
previous image and the intended PostgreSQL data volume. It also confirmed that
none of the three approved legal runtime values currently match the desired
values. This is not sufficient to change them.

The active Staging container's Control-Panel-generated Compose-file reference
points to an ephemeral file that no longer exists. Its working directory has no
current source `.env`; the persistent `.env` found in the bounded deployment
area does not match the running legal values, and no documented release script
is present in the active working directory. Thus no single persistent source
can be proven both authoritative and bound to the running service.

A created, non-running PostgreSQL container from a different Compose project
also remains visible. It has a separate data volume and was not removed: its
ownership and recovery relevance are not proven.

## Exact blocker

`WP77_PUBLIC_LEGAL_RUNTIME_TARGET_AND_SOURCE_MISMATCH`

Do not use the failed Control-Panel recreate path, do not accept an implicit
`local` image fallback, and do not edit a merely similar `.env` or example
file. No container, data volume, Caddy configuration, DNS, provider, payment,
Store or Production state changed in this package.

## Safe continuation

Before the three legal values may be changed, a later bounded run must prove:

1. the exact runtime responsible for the public root legal routes;
2. its current image, release record, health, retained rollback image and data
   volume identity;
3. one persistent authoritative environment or Compose source whose current
   values match that runtime; and
4. a documented recreate path that preserves the data volume and refuses the
   `local` image fallback.

Only then may that exact source change
`PUBLIC_LEGAL_PROVIDER_NAME`, `PUBLIC_LEGAL_PROVIDER_ADDRESS` and
`PUBLIC_PRIVACY_EFFECTIVE_DATE`, preserving every other value. A fresh public
and runtime readback must then confirm the result. Until then, the public legal
correction remains blocked rather than guessed.
