# S4BS/S4BT support status and decision operations

Status: technically verified, non-live.

## Permanent checks

The complete regression runner permanently invokes
`test/tool/support_status_machine_v1_alignment_wiring.test.mjs`. The contract
binds the source file ID and hash, exact 11-status/18-transition graph,
migration registration, removal of active `implementation_pending` behavior
and both decision paths. Its own registration is also guarded.

The backend suite covers direct green/yellow authorization, exact immutable
hash approval, direct-path idempotency and the unchanged pending red path.
Fresh PostgreSQL integration applies migrations through `065`, executes a
direct green decision and proves that database constraints reject a direct red
self-approval.

## Local acceptance

From the repository root, the retained checks are:

```sh
node --test test/tool/support_status_machine_v1_alignment_wiring.test.mjs
pnpm --dir backend test
pnpm --dir backend run test:postgres:local
CI=true SIT_ALLOW_CANDIDATE_ROLLOVER=1 \
  bash scripts/technical_regression_check.sh
```

The exact S4BT implementation head passed 605 backend tests, with one expected
no-database skip in the complete run, and the fresh isolated PostgreSQL 16
runner ended `passed-and-cleaned`. Privacy, Retention, P0B and external-gate
validators remained fail-closed.

The full local gate passed analyzer zero, 385 Flutter tests plus one documented
skip, Google-only, Web/WebAssembly and loopback smoke, and one 448-task Android
debug build. The capacity gate ended with 1,206,456 KiB free and no generated
growth. No rate-limit, timing, retry or test-parallelism workaround became an
acceptance condition.

## CI evidence

- Alignment commit `daf7a79e6bdb36926dce46fea37756af0fb89b58`:
  GitHub Actions run `32620871777` passed PostgreSQL in 34 seconds, Backend in
  1:57 and Flutter/Web/Android in 6:51.
- Complete decision-path commit
  `5e6f99cf074b66d3dd9119f30903894bcb224350`: GitHub Actions run
  `32621468236` passed PostgreSQL in 35 seconds, Backend in 1:30 and
  Flutter/Web/Android in 6:37.

Signed-candidate construction and publication remain skipped. Draft PR #7
remains open and unmerged.

## Deployment and rollback hold

Do not run migrations against a live database under this package. Before any
future authorized rollout, first inventory non-canonical support rows and
simulate both migrations on a production-like snapshot. Any preflight failure
is a data-review gate, not permission to update rows manually.

The technically prepared external-gate register remains 10/10 prepared and
0/10 externally ready. P0B remains `HOLD` / `NO-GO`; no external gate was
activated.
