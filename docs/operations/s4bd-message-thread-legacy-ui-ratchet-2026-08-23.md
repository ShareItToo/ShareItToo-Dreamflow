# S4BD message-thread legacy-UI ratchet

Status: locally verified, non-live.

## Canonical checks

Run Flutter commands sequentially from the repository root:

```sh
node --test \
  test/tool/message_thread_dead_helper_ratchet_wiring.test.mjs \
  test/tool/message_thread_legacy_ui_ratchet_wiring.test.mjs \
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
105 passes and the Flutter selection reports 42 passes. The analyzer validator
accepts exactly three findings at fingerprint
`e68b4a8268abd0c878ad30d07122b584e4e92a0cc8f4621c83267f17e07133cf`.
The complete standard gate passes on implementation commit `7c93081`.

## Failure and release boundary

Do not restore the removed legacy metadata, info, trust, action-bar, composer,
time-agreement, transaction-CTA or inline-icon widgets. Do not weaken the
active transaction composer, combined booking/time row, input actions,
confirmed-time gates, countdown, booking summary or privacy source inventory.
Do not add lint suppression, retry, sleep, reduced concurrency or an alternate
temp root.

S4BD needed no cleanup, network switch, Pixel or test accommodation: the
standard-parallel gate passed once with 1136 MiB available before and 1143 MiB
after. `TD-RR-012` remains open because this warm-tree observation is not the
required deterministic release-host proof.

This package changes no live availability, quote, Payment, refund, delivery,
cancellation, support, privacy/retention classification, audit or
`needsReview` behavior. Continue with the final three analyzer findings. P0B
remains `HOLD` / `NO-GO`.
