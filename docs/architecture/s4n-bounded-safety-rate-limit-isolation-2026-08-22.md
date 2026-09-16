# S4N bounded Safety rate-limit isolation - architecture

Status: locally verified on 22.08.2026 at exact implementation commit
`6da227ba2abaf3d5aa75e6f0f235b31bf655eb4f`. This package closes the
non-live technical gap in Drive Support Matrix scenario `SUP-109`. It does not
authorize production, Payment, Store, Cloud/VPS/DNS, deployment, pilot
activation or a support decision.

## Problem and invariant

Safety intake previously had a larger dedicated bucket, but every request first
consumed the general application bucket. Exhausting that general bucket could
therefore make genuine urgent intake unreachable even while the Safety bucket
still had capacity. Merely increasing or disabling a limiter would have hidden
the defect and weakened abuse protection.

The server now owns three immutable policies: 240 general requests per minute,
10 ordinary support-intake requests per 15 minutes and 30 Safety-intake
requests per 15 minutes. Only an exact protected Safety case submitted to
`POST /v1/support/cases` or the exact participant handover-exception endpoint
skips the general bucket. Its dedicated 30-attempt limiter executes before
authentication and database work, so the route remains bounded even for an
unauthenticated or invalid request.

The limiter's preliminary body classification grants no status, database
mutation, authorization or support outcome. The established authentication,
participant, domain, evidence and simulation-only controls still decide
whether an intake can be created.

## Isolation and deterministic proof

`createCoreRateLimiters()` creates independent in-memory stores for every
application instance. Loopback tests use one fixed request source and assert
the real thresholds exactly: ordinary support accepts 10 then returns 429,
Safety accepts 30 then returns 429, and the general route accepts 240 then
returns 429. After general exhaustion, genuine Safety and handover-exception
intake remain available through their dedicated bucket while ordinary support
remains blocked.

The complete threshold sequence is repeated through a second fresh
application. It uses no sleep, timer extension, reset hook, IP rotation,
production-limit change or reduced test parallelism. Two fresh PostgreSQL 16
integration runs and the complete Backend and Flutter regressions also pass.

## Technical-debt boundary

This package provides the repository-owned factory, the real-threshold tests
and repeated isolated local evidence required by part of `TD-RR-002`. That debt
is not closed: the historical monolithic PostgreSQL HTTP fixture still contains
distinct request-source accommodations, and exact-commit CI is unavailable.
Release readiness therefore still requires removal of those accommodations,
two clean complete regressions without them and green CI on the exact commit.

The temporary Node runtime and manual PostgreSQL lifecycle remain open under
`TD-RR-001` and `TD-RR-004`; they are development accommodations, not release
prerequisites. `TD-RR-003` also remains open pending retained stress and
exact-commit CI evidence despite repeated standard-parallel Flutter passes.

## Local verification

- focused Backend rate-limit, support and handover checks: 39 passed;
- Privacy/Retention protection: 68 tests and both actual validators passed;
- P0B protection: 37 tests and all six actual validators passed; PSP remains
  `0/8 HOLD`, invited pilot remains `0/4 HOLD` / `NO-GO`;
- two consecutive fresh PostgreSQL 16 integrations passed through migration
  `063`;
- Backend package runner: 587 passed, one expected no-database skip;
- Flutter: 379 passed and one documented Google-profile skip at standard
  parallelism; the separate Google-only profile passed;
- analyzer: accepted 220-issue baseline with no forbidden new issue class;
- Web debug build and loopback smoke, Android debug APK, syntax, diff and
  secret checks passed.

GitHub push and exact-commit CI are not claimed because the stored CLI
credential remains expired. Draft PR #7 remains unmerged.
