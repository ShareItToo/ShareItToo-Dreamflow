# S4BG PostgreSQL runner CI closeout

Status: technically verified, non-live.

## Canonical local checks

Run from the repository root:

```sh
node --test \
  backend/test/local_postgres_integration_runner.test.js \
  test/tool/postgres_runner_ci_wiring.test.mjs
pnpm --dir backend run test:postgres:local
CI=true SIT_ALLOW_CANDIDATE_ROLLOVER=1 \
  bash scripts/technical_regression_check.sh
```

The real runner must end with `status=passed-and-cleaned`, PostgreSQL major 16,
host `127.0.0.1`, database `sit_integration` and the canonical integration test.
No `sit-postgres-integration-*` root may remain in the system temp directory.

## CI acceptance

The independent job must use Ubuntu 24.04 and the pinned repository package
contract. It must not add a service, database URL, explicit port, environment
bin override, `sudo`, `apt`, Docker, lifecycle command, sleep or retry. A
failure stays failed and must be corrected in source before a new commit.

Retained evidence:

- failed first exact run: `32610811354`, default Unix-socket path incompatible
  with the unprivileged host;
- source correction head:
  `72adea23b38eb56528f257f1980b6d9c44c1c44e`;
- successful exact run: `32610904963`;
- fresh-cluster proof: 32 seconds and `passed-and-cleaned` on PostgreSQL 16;
- Backend: 1:20; Flutter: 6:21; signed candidate/publication skipped.

`TD-RR-004` is closed. Keep all twelve register contracts permanent. This is
not legal approval, provider readiness, Store submission, pilot activation or
permission for production, Payment, Cloud/VPS/DNS, signing, merge or paid
services. P0B remains `HOLD` / `NO-GO`.
