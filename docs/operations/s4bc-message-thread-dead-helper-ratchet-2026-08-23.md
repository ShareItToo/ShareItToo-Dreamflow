# S4BC message-thread dead-helper ratchet

Status: locally verified, non-live.

## Canonical checks

Run Flutter commands sequentially from the repository root:

```sh
node --test \
  test/tool/message_thread_dead_helper_ratchet_wiring.test.mjs \
  test/tool/message_thread_async_context_wiring.test.mjs \
  test/tool/validate_messaging_launch_scope.test.mjs \
  test/tool/booking_address_reveal_wiring.test.mjs \
  test/tool/validate_android_photo_picker_policy.test.mjs \
  test/tool/v51_condition_evidence_wiring.test.mjs \
  test/tool/support_legacy_migration_wiring.test.mjs \
  test/tool/analyzer_baseline_wiring.test.mjs \
  test/tool/validate_flutter_analyzer_debt.test.mjs \
  test/tool/validate_privacy_disclosures.test.mjs \
  test/tool/validate_retention_deletion_readiness.test.mjs \
  test/tool/validate_g2_data_lifecycle.test.mjs
node tool/validate_privacy_disclosures.mjs
node tool/validate_retention_deletion_readiness.mjs
node tool/validate_g2_data_lifecycle.mjs
flutter test --reporter expanded \
  test/message_thread_screen_logic_test.dart \
  test/private_pilot_chat_policy_test.dart \
  test/shared_message_thread_sync_test.dart \
  test/support_flow_safety_triage_test.dart
flutter analyze 2>&1 \
  | node tool/validate_flutter_analyzer_debt.mjs --log -
CI=true SIT_ALLOW_CANDIDATE_ROLLOVER=1 \
  bash scripts/technical_regression_check.sh
```

The focused source/analyzer/privacy/retention/data-integrity selection reports
100 passes and the Flutter selection reports 42 passes. The analyzer validator
accepts exactly 20 findings at fingerprint
`d1122c6479986f9b5f7ae13e0267fce06b519aedf313cb44eb63dc1cb95cb917`.
The complete standard gate passes on implementation commit `7cde3ea`.

## Failure and release boundary

Do not restore the dead enable-translation wrapper, private language-picker,
role/location label helpers, estimated response-time copy or local date
formatter. Do not weaken the active translation menu, persisted translation
settings, protected location acceptance/reuse, time coordination,
`needsReview` hold, support route or privacy source inventory. Do not add lint
suppression, retry, sleep, reduced concurrency or an alternate temp root.

S4BC needed no cleanup, network switch, Pixel or test accommodation: the
standard-parallel gate passed once with 1139 MiB available before and 1136 MiB
after. `TD-RR-012` remains open because this warm-tree observation is not the
required deterministic release-host proof.

This package changes no live availability, quote, Payment, refund, delivery,
cancellation, support, privacy/retention classification, audit or
`needsReview` behavior. Continue reviewed reductions in the remaining 20
message-thread analyzer findings. P0B remains `HOLD` / `NO-GO`.
