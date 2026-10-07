# S4BI PostgreSQL single-client serialization - architecture

Status: technically verified on 23.08.2026 at implementation head
`76cb6368af8e8d50e4db7d6e11ac38b2211ffe1c`. This package removes a
forward-compatibility defect in transaction-scoped PostgreSQL reads. It
changes no product policy, database schema, API response, production, Payment,
Store, Cloud/VPS/DNS or pilot state.

## Defect and fail-closed proof

The PostgreSQL-16 integration exposed the client-library deprecation that
`client.query()` must not be called while the same client is already executing
another query. Those calls were grouped with `Promise.all` in six workflows,
although a single PostgreSQL client cannot execute them concurrently. `pg` 8
serialized them internally after warning; `pg` 9 removes that compatibility.

The diagnostic command retained the full canonical integration and converted
the warning to an error:

```sh
NODE_OPTIONS=--throw-deprecation pnpm --dir backend run test:postgres:local
```

It failed deterministically at the first booking-availability batch and still
left zero scoped runner roots. No warning suppression, dependency pin,
additional connection, retry or reduced test path was accepted.

## Source invariant

The affected reads in booking availability, rental cart, compliance review,
moderation, booking-group handover and privacy export now await each query in
explicit order while retaining the same transaction, parameters and result
mapping. Privacy export uses thunks so query construction cannot start work
before the preceding operation finishes. This retains one consistent export
snapshot and avoids increasing connection demand.

The repository-owned fresh-cluster runner now always starts the canonical test
child with `--throw-deprecation`. A separate static contract rejects
`Promise.all` in all six transactional workflow files and locks exactly one
hard-deprecation flag into the canonical runner. A future same-client batch or
new deprecation therefore fails before release evidence can be accepted.

## Verification

Eight focused runner and source contracts pass. The real local PostgreSQL-16
fresh-cluster runner passes with `passed-and-cleaned` and zero remaining temp
roots. Backend passes 605 tests with 604 successes and the single documented
no-database skip; audit reports zero vulnerabilities, syntax and the retained
secret baseline pass, and exact Privacy/Retention hashes and their 58 focused
contracts pass.

The unchanged complete local gate passes in one execution with analyzer zero,
384 Flutter tests plus one documented skip, Google-only, Web build/smoke and
one direct 448-task Android debug build. Capacity changes from 1,171,580 KiB
free and 3,196,480 KiB generated to 1,172,440 KiB free and 3,196,480 KiB
generated: zero generated-footprint growth.

Exact CI run `32612314131` passes at the implementation head; its independent
PostgreSQL-16 fresh-cluster job completes in 31 seconds under the mandatory
hard-deprecation contract, Backend completes in 1:19 and Flutter/Web/Android in
6:23; signed-candidate and publication work remain skipped. This closes
`TD-RR-013`. P0B remains `HOLD` / `NO-GO`, and all ten external readiness gates
remain false.
