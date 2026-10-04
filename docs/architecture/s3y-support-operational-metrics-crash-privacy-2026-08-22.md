# S3Y support operational metrics and crash privacy - architecture

Status: locally and CI verified on 22.08.2026 at exact implementation commit
`c4a02ec441e85137187352c71a479f6ad3462bd2`. This is a non-live implementation for
Drive scenarios `SUP-165` through `SUP-167` and changes no production,
Firebase Console, Store, payment, Cloud/VPS/DNS or public rollout state.

## Source basis

- Drive `13_SIT_SUPPORT_TEST_MATRIX_V1.md`, scenarios `SUP-165` through
  `SUP-167`.
- The append-only support transition ledger and current support-case deadline
  state.
- The existing default-off Crashlytics preference and bounded internal staging
  diagnostic.

## Metric definitions

The Administrator-only endpoint
`GET /v1/admin/support/operational-metrics` is protected by authentication,
active-account validation, Administrator role and Staff Step-up. Responses are
private and non-cacheable. The date window defaults to 30 days, is
start-inclusive/end-exclusive and is capped at 93 days; future and malformed
windows fail closed.

The reopen rate is a cohort rate. Its denominator is the distinct set of
simulation/internal-testing cases transitioned to `closed` inside the window.
Its numerator is the subset of that same cohort with a later `reopened`
transition before the window end. A reopen of a case closed before the window
therefore cannot inflate the rate.

The late-update rate is an explicitly point-in-time operational snapshot. Its
denominator is all current active simulation/internal-testing cases; its
numerator is the subset whose `next_update_at` is due at the reported `asOf`
time. Both rates are returned as integer basis points with a defined zero when
the denominator is empty.

## Data minimization

The database returns four aggregate counts only. It does not select or return
reporter/affected user IDs, summaries, messages, structured event payloads or
actor IDs. No case ID leaves the aggregate query. The response states
`aggregateOnly=true`, `containsPersonalData=false` and
`externalAnalyticsSent=false`; the endpoint does not call an analytics or
provider transport and adds no stored dataset or migration.

## Crash diagnostics controls

Crashlytics collection now uses one testable predicate everywhere: release
mode and the independent persisted user choice must both be true. Disabling
the choice continues to disable collection and delete unsent reports.

The controlled staging diagnostic may write only four release-mapping keys:
commit, build number, release channel and the bounded diagnostic run ID. A
single helper rejects every other key before the SDK call. No
`setUserIdentifier` call exists, and static protection fails if a second direct
`setCustomKey` call bypasses the helper.

## Verification and residual boundary

Focused Backend/domain/wiring and Flutter Firebase-runtime tests pass. Privacy,
Retention and Firebase release validators bind the new aggregate source and
the strengthened consent helper while the manifests remain draft and
fail-closed. The complete local Backend unit run passes 496 tests with one expected
PostgreSQL-environment skip. The complete local technical regression passes the
accepted 220-issue analyzer baseline, 369 Flutter tests with one documented
Google-profile skip, the separate Google-only test, Web build/loopback smoke
and Android debug APK. Exact-head GitHub run `32562949550` passed all 497
Backend/PostgreSQL tests without skips and repeated the Flutter regression for
PR merge snapshot `92c6737e87b2dbdb4540002bf272c66153f7c61e` with the same
220-issue accepted analyzer baseline, 369 Flutter passes plus one documented
skip, separate Google-only pass, Web build/loopback smoke and Android debug
APK. Signed-candidate construction and API-image publication were skipped;
Draft PR #7 remained open, mergeable and unmerged.

No live Firebase traffic, Crashlytics report, external analytics event, real
support case, production read, Store action, signed artifact, deployment,
payment, PR merge or public communication is part of S3Y.
