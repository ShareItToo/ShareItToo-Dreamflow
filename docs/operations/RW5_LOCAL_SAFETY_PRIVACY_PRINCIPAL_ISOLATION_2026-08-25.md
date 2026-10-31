# RW5 local safety/privacy principal isolation

Date: 2026-08-25
Run mode: synthetic local implementation and verification only

## Supported checks

```bash
flutter analyze <RW5 changed Dart paths>
flutter test test/rw5_local_safety_privacy_principal_isolation_test.dart
flutter test \
  test/rw5_local_safety_privacy_principal_isolation_test.dart \
  test/messages_notification_settings_test.dart \
  test/blocked_users_screen_test.dart \
  test/user_reports_harassment_guard_test.dart \
  test/message_thread_screen_logic_test.dart \
  test/shared_message_thread_sync_test.dart \
  test/shared_persistence_sync_test.dart \
  test/reduced_wave0_product_journey_test.dart
node --test \
  test/tool/validate_g2_data_lifecycle.test.mjs \
  test/tool/validate_privacy_disclosures.test.mjs \
  test/tool/validate_retention_deletion_readiness.test.mjs \
  test/tool/rw5_local_safety_privacy_principal_isolation_wiring.test.mjs \
  test/tool/validate_rw5_local_safety_privacy_principal_isolation.test.mjs
node tool/validate_g2_data_lifecycle.mjs
node tool/validate_privacy_disclosures.mjs
node tool/validate_retention_deletion_readiness.mjs
node tool/validate_rw5_local_safety_privacy_principal_isolation.mjs
SIT_ALLOW_CANDIDATE_ROLLOVER=1 bash scripts/technical_regression_check.sh
```

Focused RW5 result: 12 passed. The first adjacent run passes 37 checks with one
expected profile-gated skip. Changed-file analysis passes with zero issues.
Lifecycle/privacy/retention and RW4/RW5 wiring pass 95 Node checks. The full
technical regression passes from a clean start, including the default 452-test
Flutter matrix with three documented profile skips, exact RW profiles,
Web/Wasm loopback smoke, Android debug assembly and the resource guard. Exact
implementation head `2dfb487cd3b4f4ebd59d184f1a5186f1da455672` passes GitHub
Regression `32809930879` and CodeQL `32809930884`, with zero open code-scanning
alerts.

## Operational behavior

- Account and guest state are selected by an opaque principal token.
- Unattributed legacy data is guest-only; muted legacy data requires an exact
  owner-to-principal match.
- A corrupt current bucket is quarantined and fails closed without blocking a
  different valid account.
- The 13th retained principal is rejected; no prior state is evicted.
- A session switch refreshes every affected open screen without a delay and
  clears stale values before loading.
- Privacy export and confirmed deletion operate on the current principal only.
- The backend remains authoritative when enabled.

## Recovery and rollback

If a local bucket fails validation, do not delete or rewrite the raw document.
Keep the closed UI, preserve quarantine evidence, and repair only through a
separately reviewed migration. A storage-capacity failure requires an explicit
data-lifecycle decision; silent LRU eviction is forbidden.

Rollback is the normal Git revert of the bounded RW5 implementation before a
successor depends on it. Do not reset, rebase or rewrite history. A rollback
must also revert the canonical lifecycle/privacy/retention claims together; it
must never restore silent corrupt-to-empty behavior.

## Open gates

RW5 does not inspect historical GitGuardian finding contents and does not close
that owner gate. BUILD_READY, Play upload, human pilot activation, PR #7 merge,
real provider/AI, real money and every production/VPS/DNS/Cloud gate remain
ungranted.
