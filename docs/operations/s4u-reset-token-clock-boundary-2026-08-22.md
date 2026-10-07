# S4U reset-token clock boundary

Status: locally verified, non-live.

## Canonical verification

Run from a clean exact-commit worktree with the normal repository-pinned Node,
pnpm and PostgreSQL 16 toolchain:

```sh
bash scripts/test_reset_token_clock_boundary.sh
```

Expected final output is a JSON result with five unit runs, two PostgreSQL
runs, `clock: single-issued-at` and the current commit. Both PostgreSQL runs
must report `passed-and-cleaned`; no `sit-postgres-*` temp root may remain.

## Failure handling

- Do not wait for transaction or wall-clock time to advance.
- Do not retry a failed iteration or increase the 30-minute limit.
- Do not weaken or skip migration `057`.
- Do not replace the repository-owned fresh PostgreSQL runner with a reused
  database, fixed port or manually prepared schema.
- Diagnose source timestamp drift, migration failure or runner lifecycle
  failure, commit the fix, then rerun the whole proof on that clean commit.

## Boundaries

The proof uses synthetic local accounts and isolated local PostgreSQL clusters.
It does not send email, contact production/staging, deploy, upload, sign,
pay/refund or change Payment, Store, Cloud/VPS/DNS or pilot state. Formal
`TD-RR-006` closure still requires green exact-commit CI on PostgreSQL 16.
