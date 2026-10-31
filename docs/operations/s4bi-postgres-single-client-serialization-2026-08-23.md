# S4BI PostgreSQL single-client serialization

Status: technically verified, non-live.

## Canonical checks

Run from the repository root:

```sh
node --test \
  backend/test/local_postgres_integration_runner.test.js \
  backend/test/postgres_single_client_query_contract.test.js
pnpm --dir backend run test:postgres:local
CI=true SIT_ALLOW_CANDIDATE_ROLLOVER=1 \
  bash scripts/technical_regression_check.sh
```

The repository runner itself supplies `--throw-deprecation` to the canonical
PostgreSQL integration child. The result must be `passed-and-cleaned`, and no
`sit-postgres-integration-*` root may remain. Do not replace this with
`NODE_NO_WARNINGS`, a warning listener, an older `pg` pin, a retry, a reduced
suite or additional database clients.

The structural contract must continue to cover:

- booking availability;
- rental-cart projection;
- compliance review;
- moderation;
- booking-group handover; and
- privacy export.

All transaction-scoped calls on one checked-out client execute in explicit
order. A deliberate reintroduction of `Promise.all` in any covered source must
make the contract red.

## Retained evidence

- red diagnostic: canonical runner failed under `--throw-deprecation` at the
  first same-client booking-availability batch and cleaned its temp root;
- implementation head:
  `76cb6368af8e8d50e4db7d6e11ac38b2211ffe1c`;
- local runner: PostgreSQL major 16, `passed-and-cleaned`, zero temp roots;
- complete local gate: analyzer zero, 384 Flutter passes plus one documented
  skip, Web smoke/build, 448-task Android build and zero generated growth;
- exact CI `32612314131`: independent runner 31 seconds, Backend 1:19,
  Flutter/Web/Android 6:23, signing/publication skipped.

`TD-RR-013` is closed, with all 13/13 deterministic exit contracts retained.
This is not provider configuration, legal approval, Store submission, pilot
activation or permission for production, Payment, Cloud/VPS/DNS, signing,
merge or paid services. P0B remains `HOLD` / `NO-GO`.
