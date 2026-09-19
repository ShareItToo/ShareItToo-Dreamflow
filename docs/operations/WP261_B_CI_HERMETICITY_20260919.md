# WP261-B — CI hermeticity and migration inventory

## Scope

Repair the exact-head CI boundary after WP261-A without changing provider,
payment, Play, production, cloud or device state.

## Changes

- Generic backend regression no longer sets `TEST_DATABASE_URL`; database
  integration suites are explicitly skipped there and remain owned by the
  dedicated PostgreSQL runner.
- Relative migration fixture paths now resolve from the test module, and the
  staging candidate fixture uses the checked-out repository instead of a
  machine-specific absolute path.
- Migration 090 admits `booking.review`. Its down migration checks for review
  rows before dropping the constraint and raises `booking_review_commands_exist`
  without changing schema when rollback is unsafe.
- R9 current inventory is 90 migrations through
  `090_booking_review_command_type.up.sql`; the closure ratchet uses the
  accepted WP261-A successor baseline. WP158's one recorded AGENTS inventory
  repair restores its internally consistent captured digest; all other
  historical evidence edits remain fail-closed.
- Legacy no-header review retries use a stable booking/reviewer/direction key;
  explicit idempotency keys still bind the complete payload and reject drift.
- Historical WP112/WP115 source inventories now verify against their recorded
  runner Git commit rather than today's mutable checkout. WP158 verifies its
  stored inventory digest without rebinding to current source.
- CI synthetic credentials are generated at runtime; the history scanner
  baseline contains only the exact reviewed historical findings.
- Booking cancellation, reservation cleanup and payment event wiring tests now
  assert the current helper/owner-bound architecture instead of stale direct
  call shapes.

## Verification

- Consumer closure: PASS, 3 mutable manifests, 42 code consumers, 65 tests,
  90 migrations.
- Consumer matrix execution: 559/559 PASS.
- Closure and R9 focused suites: 21/21 PASS.
- Backend suite with `TEST_DATABASE_URL` unset: 1119 pass, 12 intentional
  skips, 0 failures.
- Dedicated PostgreSQL 16 runner: PASS; identity, MFA, foundation and
  foreign-key integration suites passed and cleaned up.
- Rollback guard static test: PASS.
- Secret scan: working tree clean; 35 reviewed historical findings, no current
  high-confidence secret.
- CI-ratchet focused suites: 85/85 PASS.
- Node syntax and `git diff --check`: PASS.

No external provider, payment, Store/Play, production, cloud, Firebase or
device mutation occurred.
