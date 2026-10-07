# S4R PostgreSQL rate-limit scenario isolation

Status: locally verified, non-live.

## Canonical verification

From the repository root:

```sh
node --test \
  backend/test/postgres_rate_limit_isolation_contract.test.js \
  backend/test/rate_limit_policy.test.js
pnpm --dir backend run test:postgres:local
```

The focused command proves the immutable 10/30/240 policies, urgent-Safety
isolation, fresh application stores and the monolithic-source contract. The
PostgreSQL command must then pass against a fresh PostgreSQL 16 cluster and
clean it without manual database lifecycle commands.

Before release readiness, run the PostgreSQL command twice and retain two
complete standard-parallel technical regressions on the same commit.

## Failure handling

- Do not add or rotate a source address to recover a failing unrelated
  scenario.
- Do not wait for a window, reset a limiter store, increase a product limit or
  bypass middleware.
- Add a fresh application boundary only when scenarios are independent; keep
  their database truth continuous when the integration requires it.
- Keep source diversity only where it is the explicit security input, such as
  the distributed account-lock assertion.
- Treat a new `X-Forwarded-For` occurrence as a contract failure requiring
  security review.

## Boundaries

The runner starts only local loopback application and PostgreSQL processes with
synthetic data. It does not contact production/staging, deploy, upload, sign,
pay/refund or change Payment, Store, Cloud/VPS/DNS or pilot state.
`TD-RR-002` remains formally open until exact-commit CI retains the same proof.
