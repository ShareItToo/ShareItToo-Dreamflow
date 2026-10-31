# S4S Flutter standard-parallel stability - architecture

Status: locally verified on 22.08.2026 at implementation commit `cea3a1f`.
This is a non-live release-readiness package for `TD-RR-003`; it changes no
production behavior, Payment, Store, Cloud/VPS/DNS or pilot state.

## Failure mode removed

Earlier focused Flutter verification sometimes forced concurrency one. That can
hide timer, animation, global-state or cleanup leakage and therefore cannot be a
release prerequisite. Two ordinary parallel runs in S4L were positive evidence,
but they did not provide a retained repeated stress contract.

S4S adds a repository-owned proof that always runs the complete Flutter suite
five times with Flutter's default parallelism. It rejects
`SIT_FLUTTER_TEST_CONCURRENCY`, a dirty worktree and an unavailable normal-shell
Flutter command before starting. The exact commit is captured once and emitted
in the final machine-readable result.

## No timing accommodation

The proof contains no `--concurrency`, sleep, retry or failure rerun. A failing
iteration stops the command immediately, so a later successful run cannot mask
a flake. A committed wiring contract checks all of these conditions and is part
of every complete technical regression.

The GitHub workflow exposes the same proof only through the explicit boolean
`run_flutter_parallel_stress` input. Its default is false so the five-suite cost
is never added silently to ordinary pull-request or push CI. When requested, it
runs after the normal complete regression on the same checked-out commit.

## Local evidence and remaining boundary

At implementation commit `cea3a1f404f90cc4ae1ed8dd86c453245f97e331`, five
consecutive complete Flutter suites passed at default parallelism. Every run
finished with 379 passes and one documented skip; the command emitted:

```json
{"status":"passed","runs":5,"parallelism":"flutter-default","commit":"cea3a1f404f90cc4ae1ed8dd86c453245f97e331"}
```

The temp-fixture root remained empty after the stress proof. This implements
the local retained-stress portion of `TD-RR-003`. Formal closure still requires
green exact-commit CI with the explicit stress input, because local output is
not CI evidence. No release-readiness, signed candidate, deployment or live
provider claim follows from this result.
