# ADR-078: Own the local PostgreSQL integration lifecycle in the repository

- Status: Accepted locally for non-live verification
- Date: 2026-08-22
- Implementation: `ed0f94cc3e5378ee38abfde0e03269a9b818e85e`
- Verified package head: `b4194411779163f41197cd3d8325fcdb7a61847b`

## Context

Local integration evidence previously depended on manually selecting a port,
creating a cluster/database, exporting a URL, stopping PostgreSQL and moving
fixtures to Trash. Those steps were repeatable by an operator but not a
deterministic release contract.

## Decision

Provide one version-pinned Node CLI invoked through the Backend package. It
must allocate a fresh cluster and loopback port, require explicit readiness,
create an isolated synthetic database, execute the canonical full integration
and clean up in `finally` on success or failure. Cleanup is allowed only for
the exact validated temp root. A server that cannot be stopped causes a hard
failure and retained evidence, never unsafe deletion.

Tests must exercise both the success and deliberate child-failure paths. Two
consecutive real runs with no caller-supplied port, database or lifecycle
steps are required local evidence.

## Consequences

- Manual PostgreSQL orchestration is no longer needed for the supported local
  command.
- PostgreSQL versions other than 16 fail closed.
- CI can retain its pinned PostgreSQL 16 service while executing the same
  canonical integration and runner contract tests.
- `TD-RR-004` remains open until the exact package commit is green in CI.
- Normal Node/pnpm resolution remains separately open under `TD-RR-001`.
- No external or live state changes.
