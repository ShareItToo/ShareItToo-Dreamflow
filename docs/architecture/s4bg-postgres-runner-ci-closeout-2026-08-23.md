# S4BG PostgreSQL runner CI closeout - architecture

Status: technically verified on 23.08.2026 at implementation head
`72adea23b38eb56528f257f1980b6d9c44c1c44e`. This is a non-live CI and
test-runner package. It changes no application contract, production, Payment,
Store, Cloud/VPS/DNS or pilot state.

## Independent fresh-cluster proof

The regression workflow now owns a separate `postgres-runner-proof` job on the
pinned Ubuntu 24.04 hosted image. The job has no database service, no supplied
database URL, no caller-selected port, no lifecycle commands and no
`SIT_POSTGRES_BIN_DIR`. It installs the locked Backend dependencies with the
existing Node 22 and pnpm 11.16 contract, then invokes exactly:

```sh
pnpm run test:postgres:local
```

The repository runner itself verifies PostgreSQL major 16, initializes a
unique scoped cluster, rejects local Unix-socket authentication, trusts only
its isolated host-auth test path, chooses an available loopback TCP port,
creates the fixed test database and executes the canonical PostgreSQL
integration. Its guarded `finally` path stops the server and removes only the
validated scoped temp root. API-image publication now also depends on this
proof, although publication remains skipped on the draft PR.

## Failed proof and source correction

The first exact CI run `32610811354` failed in the new job. Ubuntu PostgreSQL
tried to create its compiled-default Unix socket under `/var/run/postgresql`,
where the unprivileged hosted runner cannot write. The failure remained failed;
no retry, elevated permission, package install, alternate database service or
manual lifecycle command was accepted.

The source correction binds the fresh cluster to its already intended
loopback-TCP transport and explicitly disables Unix-socket creation. This is a
cross-platform runner invariant, not a CI-only branch. The runner's contract
test permanently requires that option.

## Evidence and closure

Nine focused runner/CI contracts pass locally. The real repository runner also
passes locally on PostgreSQL 16 and leaves zero scoped temp roots. The complete
local technical gate passes at the CI-wiring content with analyzer zero, 384
Flutter tests plus one documented skip, Google-only, Web build/smoke and one
direct 448-task Android build.

Exact CI run `32610904963` is green at the final implementation head:

- `postgres-runner-proof`: 32 seconds, Node 22.23.2, pnpm 11.16.0,
  `passed-and-cleaned`, PostgreSQL major 16 and canonical integration;
- Backend: 1:20;
- Flutter: 6:21; and
- signed candidate and publication: skipped.

This closes `TD-RR-004`. All twelve release-readiness Technical-Debt entries
are now closed with retained deterministic evidence. This does not close any
professional legal, real staffing, iOS/device, PSP, privacy/retention, Store,
pilot-activation or other external gate. P0B remains `HOLD` / `NO-GO`.
