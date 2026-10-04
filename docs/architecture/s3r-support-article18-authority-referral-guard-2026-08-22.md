# S3R Article 18 authority-referral guard - architecture

Status: technically verified for non-live operation on 22.08.2026 at exact
implementation head `3497a887d31935560c1371a13e92fee2def21344` and successful
GitHub Actions run `32548790305`. No authority delivery, production or public
operation is enabled.

## Source basis

- Drive `13_SIT_SUPPORT_TEST_MATRIX_V1.md`, scenarios `SUP-121` and `SUP-122`.
- Current Drive Support, Trust & Safety and technical-control packets: safety
  first, one accountable human decision owner, data minimization, authenticated
  authority path and disclosure logging; no autonomous external send.
- SIT V5.2 legal/control material, subject to professional confirmation.
- Article 18 of Regulation (EU) 2022/2065 as the primary legal source for field
  design, not as an implementation-side legal conclusion.

## Candidate boundary

Migration `046` adds `support_cases.article18_candidate_flag`. New and legacy
non-live P0 Trust & Safety cases with subtype `threat_or_violence` or
`immediate_physical_danger` enter the candidate queue and retain both safety
and authority flags. The route intentionally over-triages ambiguous danger:
the flag means `human assessment required`, never `criminal offence found` or
`disclosure required`.

The database constraint rejects a candidate outside the exact taxonomy,
priority, flags and `simulation`/`internal_testing` modes. The authenticated
user projection hides internal routing flags. The elevated Administrator queue
returns only the bounded case reference, subtype, status, priority, operating
mode, owner role, checkpoint and latest assessment summary.

## Human assessment record

`support_article18_assessments` is append-only. The application and PostgreSQL
both require an active Administrator, matching active session and Staff Step-up,
real database-time proximity and an active P0 candidate. The record carries:

- the human determination and factual basis;
- symbolic evidence references rather than uploaded evidence;
- optional concerned Member State codes or an explicit fallback route;
- an allowlisted, data-minimized information scope;
- a reviewer-authorization evidence reference;
- exact human-only and external-delivery-disabled truth.

An `information_required` record may be superseded exactly once by a later
record that links it. A final `not_established` or `reporting_path_required`
record cannot be silently replaced. Idempotency replay requires every material
field to match.

The case event and global audit contain status, routing and counts but omit the
factual basis and evidence references. The retention inventory counts the
restricted table; automatic user self-service export deliberately omits it.

## HTTP and dispatch boundary

The candidate list and assessment endpoints require authentication, an active
Administrator and Staff Step-up and return `private, no-store`. A dedicated
dispatch endpoint proves both boundaries: middleware denies a normal support
agent, while the workflow always rejects even an Administrator with HTTP 503.
There is no network client, provider adapter, webhook, email, push, authority
address or `sent` state in the package.

Support intake and Article 18 assessment/dispatch use dedicated rate-limit
buckets. Their requests therefore cannot consume the generic sensitive-action
budget used by unrelated account-security operations.

## Residual gates

Before any external authority path can exist, SIT still needs the real named
legal/DSA owner, professional approval, competent-recipient and channel
verification, jurisdiction handling, data-minimization approval, retention and
legal-hold policy, secure transmission, disclosure log and incident operations.
These facts are missing and are not synthesized by code.

The down migration refuses to delete a non-empty assessment table. This
package creates no production, VPS, Cloud, DNS, payment, payout, Store,
signed-candidate, public-pilot or external-delivery change.

## Local verification

- Focused Article 18, support-domain/workflow and wiring run: 58 of 58 tests
  passed. The later privacy/retention-bound focused run passed 71 of 71.
- Complete Backend run with local test-only configuration: 468 total, 467
  passed, zero failed and one expected PostgreSQL skip because no local
  PostgreSQL service is installed. Backend source and shell syntax passed.
- The complete local technical regression passed: all fail-closed manifests
  and validators, the accepted analyzer baseline, 359 Flutter tests with one
  documented skip, the separate Google-only profile test, Web debug build,
  loopback smoke and Android debug build. No signed candidate was created.
- Exact GitHub Actions run `32548790305` passed 468 of 468 Backend tests with
  PostgreSQL 16.14 and all migrations through `046`. It also passed 359 Flutter
  tests with one documented skip, the separate Google-only profile test, Web
  smoke/build, Android debug build, dependency/history and Compose checks and
  the commit-labelled API image build. Signed-candidate construction and API
  image publication were skipped.

The implementation chain is `79a2baeabb7e2f09a82f9863f3bfc938f117ee80`,
`8d0bed5daac77a45b5cf10a9ab5d39ed75cedd0b`,
`cfb7ac0b72042edce8bd6f19e47b9b8814a0d573`,
`a25c0587a94c41da2625d15dbcdcf7ced0517475`,
`9fe30f81e7cb61cc13e5a4ce76687a7f745ebffb`,
`b0975360f52f52a52dc110cf3aa23b764514867f` and verified head
`3497a887d31935560c1371a13e92fee2def21344`.
