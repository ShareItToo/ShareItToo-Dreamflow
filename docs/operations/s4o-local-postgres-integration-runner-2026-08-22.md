# S4O local PostgreSQL integration runner

Status: locally verified, non-live. Required PostgreSQL major: 16.

## Command

From a normal pinned Node/pnpm Backend shell:

```sh
cd backend
pnpm run test:postgres:local
```

The command needs local PostgreSQL 16 binaries. It discovers a complete toolset
from `PATH` and standard Homebrew/Linux locations. A non-standard installation
may provide only its bin directory through `SIT_POSTGRES_BIN_DIR`. The runner
rejects a mixed or non-16 toolchain.

## Expected success

The canonical integration test prints one pass, followed by a compact report:

```json
{"status":"passed-and-cleaned","postgresMajor":16,"host":"127.0.0.1","database":"sit_integration","integrationTest":"backend/test/postgres_foundation.integration.test.js"}
```

No port, credential or filesystem path is retained in the report. Every run
uses a new cluster, an OS-selected loopback port and a new isolated database.

## Failure and cleanup

- PostgreSQL version mismatch fails before cluster initialization.
- Failed readiness or integration makes the command fail.
- Normal success and failure both execute the same `finally` cleanup.
- Fast shutdown is attempted first, then immediate shutdown.
- If PostgreSQL cannot be proven stopped, the runner fails and retains its
  scoped cluster instead of deleting a potentially live server's files.
- Cleanup refuses any directory whose exact parent and `sit-postgres-integration-`
  prefix do not match the runner allocation.

Do not replace a failed run with sleeps, a fixed port, IP rotation, skipped
migrations or manual database reuse. Diagnose the reported version/start/test
failure. `TD-RR-004` remains open until exact-commit CI evidence is retained.

## Boundaries

This tool starts only a local loopback PostgreSQL process and runs synthetic
tests. It does not connect to production/staging, deploy, contact providers,
read live user data or change Payment, Store, Cloud/VPS/DNS or pilot state.
