# S3M support/account-deletion access separation - technical compliance record

Status: technically verified at exact implementation/evidence commit
`6d8eb4856e46d6ce171ce8caa20479884a3d3498` and successful GitHub Actions run
`32533886775` on 22.08.2026.

## Implemented controls

- Open support cases are disclosed as retained records rather than generic
  deletion blockers.
- Active legal holds remain fail-closed deletion blockers.
- The client requires a separate acknowledgement that records may remain while
  account access ends.
- Account deletion preserves pseudonymous support case and append-only audit
  truth but invalidates the user's sessions and authenticated access.
- New message creation and publication require an active recipient in the
  service workflow and in PostgreSQL migration `041`.
- Historical publication replay stays idempotent and does not create a new
  message or state transition.

## Verification

- Targeted local checks: 30 Backend/domain/migration tests and four cross-layer
  wiring tests passed.
- Local Privacy and Retention suites: 58 tests passed; both inventories and
  validators include migration `041`.
- Local P0B PSP suite: five tests passed and the gate remained `hold`.
- Local invited-pilot suite: six tests passed and the gate remained `hold` with
  zero of four prerequisites.
- Local Backend suite: 438 tests passed with the one PostgreSQL-only test
  skipped because no local PostgreSQL service is installed.
- Local Flutter suite: 348 tests passed with one documented skip; targeted Dart
  analysis reported no issues.
- The complete local CI-mode technical regression, including Web build,
  loopback smoke and Android debug build, passed.
- Exact GitHub run `32533886775`: all 439 Backend tests including PostgreSQL 16,
  the complete 348-test Flutter suite with one documented skip, Web build,
  loopback smoke and Android debug build passed.
- Draft PR #7 remained open and unmerged. Signed-candidate construction, API
  image publication and every live path stayed skipped.

## Residual gates

- Legal retention basis and duration, legal-hold policy, real operator roles,
  production deletion execution and external communication remain separate
  gates.
- Production, provider, payment, Store submission, public pilot and real-money
  paths remain disabled.
