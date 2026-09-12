# S3I guarded support-template publication - technical compliance record

Status: technically verified at exact implementation/evidence commit
`f8c596f2c555b1431720d8240f23dffe8770e936` and successful GitHub Actions run
`32525140426` on 21.08.2026.

## Implemented controls

- Exact hash-bound import and startup validation of all 55 Drive templates.
- Fail-closed placeholder completeness, server binding and Berlin date/time
  rendering.
- Sensitive-data and unsafe-claim blocking for free variables.
- Explicit GREEN template/status allowlist; YELLOW exact-hash four-eyes review;
  RED and money templates rejected from the generic path.
- Non-live and assignment-bound create/publication routes behind active auth and
  Staff-Step-up; review additionally requires admin role.
- Separate bounded rate limits and exact idempotent replay per operation.
- PostgreSQL-enforced immutable rendered truth, approval hash, independent
  reviewer, participant recipient, correction chain and append-only history.
- Authenticated in-app publication only, with `externalMessageSent=false` and
  no external adapter.
- User-safe case detail, Flutter fail-closed parsing, privacy export and
  retention inventory coverage.

## Verification

- Local backend run: 425 passed, zero failed, one PostgreSQL integration test
  skipped because no local PostgreSQL service is installed.
- Local full CI-mode technical regression: privacy, retention and permanent
  wiring gates passed; 345 Flutter tests passed with one documented skip; the
  separate Google-only test passed; Web build and loopback smoke passed; Android
  debug APK built.
- Exact GitHub run `32525140426`: all 426 Backend tests passed, including
  PostgreSQL 16 migration `038` and the full HTTP/database message workflow.
  Syntax, high-severity dependency gate, tracked-history secret scan, production
  and staging Compose validation and commit-labelled API image build passed.
- The same run passed 345 Flutter tests with one documented skip, the separate
  Google-only profile test, Web build, loopback Web smoke and Android debug
  build.
- GitGuardian passed. Draft PR #7 remained open and unmerged. Signed-candidate
  construction and API image publication stayed skipped.

The first remote run exposed one integration-fixture conflict: the message test
temporarily assigned a case that a later break-glass cross-case assertion
expected to remain unassigned. The fixture now restores that state explicitly;
the successful exact run permanently verifies both paths.

## Residual gates

- Templates with unavailable server facts remain unavailable rather than using
  client-supplied substitutes.
- RED, money, decision, refund and payout messages still require their dedicated
  approved workflows and evidence snapshots.
- External delivery, schedulers, live support operations, production, payment,
  Store and public/pilot activation remain outside S3I.
