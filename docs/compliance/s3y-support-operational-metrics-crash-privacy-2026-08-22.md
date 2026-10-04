# S3Y support operational metrics and crash privacy - technical compliance record

Status: locally and CI verified on 22.08.2026 at exact implementation commit
`c4a02ec441e85137187352c71a479f6ad3462bd2`. This is technical non-live evidence,
not a claim that Firebase, production analytics or real support operations ran.

## Matrix result

- `SUP-165`: reopen rate uses a bounded closed-case cohort and late-update rate
  uses a labelled current active-case snapshot. The admin response contains
  aggregate counts and integer basis points only; no PII is sent to analytics.
- `SUP-166`: Crashlytics collection requires release mode plus the independent
  persisted crash-diagnostics opt-in. Default-off and unsent-report deletion
  remain intact.
- `SUP-167`: the controlled diagnostic accepts exactly four non-personal
  release-mapping keys, rejects unknown/user/case/account/contact keys and has
  no Firebase user identifier call.

## Enforced controls

- The metrics route requires authenticated active Administrator access and
  Staff Step-up and sends `Cache-Control: private, no-store`.
- Windows are explicit, bounded to at most 93 days and cannot extend into the
  future.
- Only `simulation` and `internal_testing` support truth is read.
- A reopened case must belong to the window's closed-case cohort and reopen
  after that cohort close.
- The SQL result has no row-level identifier or free text and no metric is
  forwarded externally.
- Crash collection has one release-plus-user-choice predicate used at
  initialization, runtime error recording and preference changes.
- Direct custom-key writes are centralized behind an exact allowlist;
  `setUserIdentifier` is absent.
- Privacy and Retention manifests stay `draft`, `approvalAllowed=false`; no
  new retention period, purge authority or provider approval is inferred.

## Verification observed so far

- Seven focused Backend/domain/static wiring tests pass.
- Seventeen focused Flutter Firebase-runtime tests pass.
- The Privacy, Retention, Firebase release and opt-in protection suites pass
  after binding the new source and helper contract.
- Node syntax checks for the new module and changed app routing pass.
- Complete Backend unit suite: 496 passed, zero failed and one intentional
  PostgreSQL-environment skip.
- Complete local technical regression: accepted 220-issue analyzer baseline,
  369 Flutter tests passed with one documented Google-profile skip, the
  separate Google-only test passed, Web build/loopback smoke passed and the
  Android debug APK built.
- Exact-head GitHub run `32562949550` passed all 497 Backend/PostgreSQL tests
  without skips and repeated the Flutter regression at PR merge snapshot
  `92c6737e87b2dbdb4540002bf272c66153f7c61e`: accepted 220-issue analyzer
  baseline, 369 Flutter passes with one documented Google-profile skip,
  separate Google-only pass, Web build/loopback smoke and Android debug APK.
- Signed-candidate construction and API-image publication were skipped; Draft
  PR #7 remained open, mergeable and unmerged.

No external analytics, Firebase Console change, live Crashlytics collection,
production data access, Store action, payment, signed build, deployment, PR
merge or public operation was performed.
