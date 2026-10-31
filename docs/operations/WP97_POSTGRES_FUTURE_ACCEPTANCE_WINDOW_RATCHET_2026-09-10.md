# WP97 — PostgreSQL Future-Acceptance-Window Ratchet

## Cause

The exact-source GitHub Regression `34463818811` correctly failed its
PostgreSQL and clean-checkout jobs. Its parallel booking-acceptance assertion
expects one `200` and one `409` for two overlapping pending bookings. Both
were instead `409` with `booking_period_unavailable`.

The fixture was still pinned to `2026-09-10T10:00:00.000Z`. The booking
workflow intentionally rejects an acceptance whose rental start is inside the
required notice period. Once that static fixture instant passed, both requests
were rejected before the intended overlap race could be exercised.

## Correction and ratchet

The PostgreSQL integration test now derives one shared, UTC-normalized booking
window 30 days in the future, lasting two days. Both pending bookings use the
same derived range, preserving the intended proof: exactly one concurrent
acceptance succeeds and the competing range is rejected with a `409`.

`backend/test/postgres_future_acceptance_window.test.js` guards the source
contract: the scenario must use the shared future helper and must not restore
the expired fixed start instant. The actual behavior remains covered by the
real local PostgreSQL integration runner; it passed after this change.

## Verification

- Source-contract ratchet: PASS.
- Pinned backend package manager (`pnpm@11.16.0`) local PostgreSQL integration:
  PASS, including the concurrent acceptance assertion, migrations and cleanup.
- Complete local technical regression: PASS, including the full tool inventory,
  analyzer, Web/Wasm, loopback smoke and Android debug build.
- Exact-head GitHub Regression `34465582435`: PASS on
  `068c843a2660e2a4c44a1715f4f8e51a67b41d24`; Flutter, backend, PostgreSQL and
  independent R10 clean-checkout reproducibility all passed. API-image
  publishing was correctly skipped.
- Exact-head GitHub CodeQL `34465582425`: PASS on the same commit.
- The PR #7 head and merge analyses have zero open Code-Scanning instances.
  Two old direct-branch instances (alerts 544 and 545, both from
  `0048ece49b7819fb09600465a027a4e0b530ccda`) remain listed while the PR stays
  Draft and unmerged; their current PR-merge instances are `fixed`. This is a
  GitHub historical-reference distinction, not a claim that the old records
  disappeared or that the PR was merged.

## Candidate-provenance decision

The exact-head archive validator requires a private archive whose embedded
commit exactly matches the green source. It therefore correctly rejected the
earlier WP96 archive after WP97. A new owner-only archive was built and
validated for `068c843a2660e2a4c44a1715f4f8e51a67b41d24`:

- version `1.0.0+2026091001`, Internal/Staging;
- AAB SHA-256 `3d3adea9437a97f45cf5652e2766948b23d39f507af445d151dfbc9afe6c8dd0`;
- APK SHA-256 `a87eb30dd8717ef8b35ce7d519b4dd4f769c1dc176ee18ad76912f6bcbd3071d`;
- canonical signing certificate unchanged and verified;
- archive, package identity, privacy scan and ZIP/signature checks: PASS.

The same versionCode exists only in two local owner-only archives and has never
been uploaded or released. This is not a Play versionCode reuse. The WP96
archive is preserved as historical build evidence; the WP97 archive is the
only current candidate artifact.

## Boundaries

This changes test fixtures and their deterministic guard only. No production
application behavior, database migration, staging runtime, Android artifact,
Google Play state, provider, payment, account, device, tester list or pull
request state changes here. The owner-only WP96 archive remains bound to its
own source commit and cannot be promoted until the new exact-head gates pass.
