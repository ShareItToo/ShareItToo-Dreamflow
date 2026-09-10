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
- Exact-head GitHub Regression, clean-checkout reproducibility and CodeQL:
  pending after the corrective commit is pushed.

## Boundaries

This changes test fixtures and their deterministic guard only. No production
application behavior, database migration, staging runtime, Android artifact,
Google Play state, provider, payment, account, device, tester list or pull
request state changes here. The owner-only WP96 archive remains bound to its
own source commit and cannot be promoted until the new exact-head gates pass.
