# S4O repository-owned PostgreSQL integration runner - architecture

Status: locally verified on 22.08.2026. The runner implementation is commit
`ed0f94cc3e5378ee38abfde0e03269a9b818e85e`; the complete technical gate is
green at package head `b4194411779163f41197cd3d8325fcdb7a61847b`. This is a
non-live release-readiness package for `TD-RR-004` and changes no product,
production, Payment, Store, Cloud/VPS/DNS or pilot state.

## Deterministic local contract

`tool/run_local_postgres_integration.mjs` owns the complete local lifecycle:

1. resolve all required PostgreSQL tools from one bin directory and require
   major version 16;
2. create a unique scoped cluster root under the operating-system temp area;
3. initialize host-only trust for `127.0.0.1` while rejecting local-socket
   authentication;
4. reserve an OS-selected loopback port and start PostgreSQL with `pg_ctl -w`;
5. require a positive `pg_isready` probe before creating an isolated
   `sit_integration` database;
6. run the canonical complete PostgreSQL foundation integration with the exact
   temporary connection URL; and
7. stop the server in `finally`, use an immediate stop only if fast stop fails,
   then remove only a prefix- and parent-validated runner temp root.

If both stop modes fail, the runner fails and retains the cluster rather than
deleting files beneath a possibly running server. The CLI report contains only
the version, loopback host, synthetic database name, test path and
passed/cleaned result; it exposes no credentials or filesystem paths.

From a normal supported Backend shell the stable command is:

```sh
cd backend
pnpm run test:postgres:local
```

No port, database, data directory, wait, cleanup or manual PostgreSQL command
is supplied by the caller.

## Reproducible proof

Six repository tests cover version parsing/pinning, unsafe cleanup rejection,
actual loopback-port allocation, successful lifecycle ordering, cleanup after
an intentionally failing integration child and fail-closed behavior for
PostgreSQL 15. The real runner was then invoked twice consecutively. Both
fresh clusters applied migrations through `063`, passed the canonical complete
integration and returned `passed-and-cleaned`; runner temp-root counts were
zero before and zero after.

The complete technical gate initially exposed two stale static contracts. The
Safety wiring test still expected inline limiters and the return-lifecycle
wiring test still expected fixed `7 x 24h` arithmetic. Commits
`7c26b5f711911b8e036ba4cc264c378a609de6ec` and
`b4194411779163f41197cd3d8325fcdb7a61847b` bind those checks to the already
verified central limiter and booking-calendar policies. No production behavior
was changed to satisfy them.

## Remaining release boundary

`TD-RR-004` is locally implemented and repeatedly proven but remains open
under the register closure rule until green CI is retained on the exact package
commit. `TD-RR-001` is also still open: these local runs used the temporary
Node-compatible runtime because normal shell Node/pnpm resolution has not yet
been repaired. Neither accommodation is an acceptable release prerequisite.

The local full gate used `CI=true` only for the repository's documented
metadata-only handoff validation. It is not evidence of GitHub CI, a signed
candidate, device coverage, Store upload or deployment.

## Local verification

- runner unit/contract tests: 6 passed;
- real fresh PostgreSQL 16 runner: 2/2 passed, temp roots `0 -> 0`;
- Backend: 593 passed, one expected no-database skip;
- full technical gate: passed;
- analyzer: accepted 220-issue baseline;
- Flutter: 379 passed and one documented skip at standard parallelism;
- separate Google-only profile, Web debug/loopback smoke and Android debug APK:
  passed;
- Privacy/Retention and P0B validators: passed and remained fail-closed;
- secret and diff checks: passed.

GitHub push and exact-commit CI are not claimed because the stored CLI
credential remains expired. Draft PR #7 remains unmerged.
