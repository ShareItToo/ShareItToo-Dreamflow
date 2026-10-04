# S4S Flutter parallel stability

Status: locally verified, non-live.

## Canonical verification

Run only from a clean exact-commit worktree with the normal repository-pinned
Flutter toolchain:

```sh
bash scripts/test_flutter_parallel_stability.sh
```

The command runs the complete Flutter test suite five times at Flutter's
default parallelism and prints a final JSON result bound to the exact commit.
Any failed iteration fails the command immediately.

For exact-commit GitHub evidence, manually dispatch the regression workflow
with `run_flutter_parallel_stress=true`. The default remains false to keep
ordinary CI cost bounded.

## Failure handling

- Do not add `--concurrency=1` or set `SIT_FLUTTER_TEST_CONCURRENCY`.
- Do not add sleeps, retries or a pass-on-rerun policy.
- Do not reduce the suite or run only a historically stable subset.
- Diagnose and fix the leaking timer, animation, global state or fixture owner
  when any iteration fails, then rerun the whole five-iteration proof on a clean
  new exact commit.
- Treat a dirty-worktree rejection as a provenance failure, not as a reason to
  weaken the guard.

## Boundaries

The command uses only local test data and does not contact production or
staging, deploy, upload, sign, pay/refund or change Payment, Store,
Cloud/VPS/DNS or pilot state. The local part of `TD-RR-003` is implemented;
formal closure requires retained green exact-commit CI using the same proof.
