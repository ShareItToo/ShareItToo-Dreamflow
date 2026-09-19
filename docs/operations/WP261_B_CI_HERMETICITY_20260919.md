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
  accepted WP261-A successor baseline and keeps WP158 historical evidence
  immutable.
- Legacy no-header review retries use a stable booking/reviewer/direction key;
  explicit idempotency keys still bind the complete payload and reject drift.

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
- Node syntax and `git diff --check`: PASS.

No external provider, payment, Store/Play, production, cloud, Firebase or
device mutation occurred.
