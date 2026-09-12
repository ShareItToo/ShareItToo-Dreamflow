# 48H R9 database migration, backup and restore

Status: **VERIFIED — LOCAL REGRESSION, GITHUB REGRESSION AND CODEQL GREEN**

R9 runs only against a repository-owned PostgreSQL 16 cluster bound to
`127.0.0.1`. It creates four temporary databases for the current source,
fresh restore target, representative older state and empty rollback control.
It does not connect to Production or VPS PostgreSQL.

## Migration and complete-schema proof

The source database starts with zero public tables. The canonical bootstrap and
all 69 checksum-bound migrations from `001_b3_foundation.up.sql` through
`069_regional_price_engine_r6_hardening.up.sql` apply successfully. A second
run changes no migration ledger row. The complete public schema fingerprint is
`ba28af73746f6456a96583951c5212b8784063ba6fac569d3d91b53667e8b497`,
covering 136 tables, 1,918 columns, 1,559 constraints, 517 indexes, 303
functions and 163 non-internal triggers.

## Backup, restore and integrity

The bounded fixture contains 12 synthetic accounts, six synthetic listings,
one support-policy snapshot, one Listing-AI draft and one R6 hardened price
snapshot. It contains no real person, real payment or stored synthetic
credential. A PostgreSQL custom-format archive is list-validated and restored
into a separately created empty database. Source and restored schema
fingerprints, migration inventory and data digests match exactly.

The restored database has zero unvalidated constraints, missing migration rows,
checksum mismatches or tested owner/draft/price-snapshot orphans. The retained
archive hash is
`c318ed2a0f797b1e765c8c949395894f41713fc0c5153954fa8eb255999590e0`;
the archive itself is deliberately removed with the temporary cluster.

## Older-state upgrade and rollback guards

A representative state at migration 027 contains four synthetic legacy users,
two listings and one persistent cart item. Upgrade through migration 069 and a
second migration run preserve every row and produce the same complete-schema
fingerprint as the fresh source.

The R6 down migration succeeds only in the empty rollback-control database and
is rolled back inside its surrounding transaction. Against restored retained
evidence, the Support 032, Listing-AI 066 and Price Engine 069 down migrations
all refuse with their exact fail-closed errors. The restored data digest stays
unchanged after all attempts.

The first GitHub Regression at evidence head
`c53a43981cc44777c276527801475136d109d1c3` confirmed the new PostgreSQL R9
job itself green, then found that the Flutter unit-test job imported `pg`
before executing a database run even though that job intentionally has no
Backend dependencies. The permanent correction loads `pg` only inside the
exact recovery execution. It does not install a hidden dependency in the
Flutter job and adds no retry, timing or parallelism accommodation.

Implementation head `c249221e64c0ede0d1918a431200069064dd3558`, three
runner contract tests, three CI wiring tests, five evidence-validator tests and
the artifact validator are green. The complete candidate-rollover technical
regression is also green in CI-metadata mode: analyzer zero, 393 Flutter passes
plus one documented skip, the separate Google-only profile, Web/Wasm, loopback
smoke and the 448-task Android debug build all pass. Exact verified head
`8bd608ebbdd798118867d80412a5948e3eee26cf` passed GitHub Regression
`32755197710`, including the repository-owned R9 recovery stage, CodeQL
workflow `32755197705` and Advanced Security check `97521988626`, with zero
open PR code-scanning alerts. The API image was built but not published;
explicit parallel stability and signed-candidate creation were not requested.
The separate GitGuardian failure remains the documented pre-existing
250-commit PR-history finding; no credential detail was inspected. No
Production, VPS, Cloud, Payment, real-user, real-money, PR-merge or
history-rewrite action is part of R9. R9 is closed and R10 begins.
