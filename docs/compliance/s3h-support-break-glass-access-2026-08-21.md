# S3H support break-glass access - technical compliance record

Status: technically verified at exact implementation/evidence commit
`cfb9a3377c432efb2d3c76620c35cb24623dd5e6` and successful GitHub Actions run
`32520795019` on 21.08.2026.

## Implemented controls

- Reversible migration `037` creates immutable, case-bound emergency access
  grants with database-enforced P0, non-live, actor, session, step-up and
  five-minute limits.
- Missing reason, invalid reason, unsafe justification, non-P0, closed, live or
  already-assigned cases fail closed.
- The access token is HMAC-derived for exact idempotent replay and only its
  SHA-256 digest is persisted.
- Support detail access remains assigned-owner-only unless the exact bounded
  grant validates. Queue access is not widened.
- Grant creation and review use separate five-attempt/15-minute HTTP limits,
  preserving the exact idempotent P0 replay without consuming the generic
  account-action budget. The exact token header is CORS-allowlisted.
- Creation, denial and successful use are audited without token or internal
  justification disclosure.
- Automatic review is due at grant expiry. Completion requires a different
  active administrator and records that administrator's exact authenticated
  session and current Staff-Step-up elevation.
- Grant core, completed review and revocation truth are immutable; deletion and
  rollback with records present are blocked.
- User export exposes a safe transparency projection while excluding staff
  identifiers, internal reasons, notes and credential material. The retention
  inventory classifies the full table as `securityAudit` while all retention
  decisions remain open.

## Source binding

- Support test matrix `SUP-024`/`SUP-025`: Drive ID
  `1CcCqdsEVveiqoKJqZlA_iHKfZhttU5Le`, modified
  `2026-08-20T22:29:02.738Z`.
- Support technical/data-model/audit PDF: Drive ID
  `19rXQidltzp3jvEWqnz4zgppTnTgL0iCl`.
- Native Support Master Policy: Drive ID
  `15Ep_utCHp3B_b7z3_dLoVydvlTNYv8bHTRGvxMLDtts`.
- Architecture decision:
  `docs/architecture/s3h-support-break-glass-access-2026-08-21.md`.

## Verification state

- Focused domain, workflow, support access, retention and wiring tests pass
  locally. The complete local technical regression also passed.
- Privacy and retention validators and their negative-test suites pass while
  both manifests remain draft and fail closed.
- Exact-commit GitHub CI run `32520795019` passed all 415 Backend tests,
  including PostgreSQL 16 migration and HTTP integration, with no skip or
  failure. Dependency/high-severity audit, tracked-history secret scan,
  production/staging Compose validation and commit-labelled API image build
  passed.
- The same run reported 220 analyzer findings against the accepted baseline of
  223, passed 343 Flutter tests with one documented skip, passed the separate
  Google-only profile test, built Web, passed the loopback Web smoke and built
  the Android debug APK.
- The pull request remains draft and unmerged. The signed-candidate and
  publication paths remained skipped; no release artifact was authorized.

The first remote pass exposed three integration-only defects which were fixed
before the successful exact run: a shared generic rate-limit budget blocked an
idempotent replay, the reserved PostgreSQL keyword `grant` was used as an SQL
alias, and the cross-case negative test targeted a normally assigned case.
Dedicated limits, safe SQL aliases and a genuinely unassigned existing target
now have permanent regression coverage.

## Persistent exclusions

- No canonical incident object or incident-wide access has been invented.
- No external message, automatic case reassignment, operational escalation or
  employment consequence is executed.
- No production, Cloud, VPS, Store, DNS, payment, refund, payout, public pilot,
  signed candidate or publication action is authorized by S3H.
