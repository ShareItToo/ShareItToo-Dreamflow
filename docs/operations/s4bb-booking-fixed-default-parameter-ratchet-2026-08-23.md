# S4BB booking fixed-default parameter ratchet

Status: locally verified, non-live.

## Canonical checks

Run Flutter commands sequentially from the repository root:

```sh
node --test \
  test/tool/booking_detail*.test.mjs \
  test/tool/v51_financial_document_client_wiring.test.mjs \
  test/tool/v51_condition_evidence_wiring.test.mjs \
  test/tool/v51_return_lifecycle_wiring.test.mjs \
  test/tool/v51_booking_detail_server_price_snapshot_wiring.test.mjs \
  test/tool/v51_withdrawal_and_cancellation_wiring.test.mjs \
  test/tool/v52_actual_loss_wiring.test.mjs \
  test/tool/v51_ride_compensation_runtime_removed_wiring.test.mjs \
  test/tool/return_handover_stepper_dead_datetime_formatter_cleanup_wiring.test.mjs \
  test/tool/analyzer_baseline_wiring.test.mjs \
  test/tool/validate_flutter_analyzer_debt.test.mjs \
  test/tool/validate_privacy_disclosures.test.mjs \
  test/tool/validate_retention_deletion_readiness.test.mjs \
  test/tool/validate_g2_data_lifecycle.test.mjs
node tool/validate_privacy_disclosures.mjs
node tool/validate_retention_deletion_readiness.mjs
node tool/validate_g2_data_lifecycle.mjs
flutter test --reporter expanded \
  test/b10_release_truthfulness_test.dart \
  test/listing_display_truth_test.dart \
  test/data_service_booking_rules_test.dart \
  test/message_thread_screen_logic_test.dart \
  test/booking_flow_policy_test.dart \
  test/private_pilot_cancellation_policy_test.dart \
  test/private_pilot_checkout_test.dart \
  test/secure_booking_confirmation_test.dart \
  test/booking_status_copy_test.dart \
  test/notification_cta_resolver_test.dart
flutter analyze 2>&1 \
  | node tool/validate_flutter_analyzer_debt.mjs --log -
CI=true SIT_ALLOW_CANDIDATE_ROLLOVER=1 \
  bash scripts/technical_regression_check.sh
```

The focused source/analyzer/privacy/retention/booking/legal selection reports
158 passes and the Flutter selection reports 125 passes. The analyzer
validator accepts exactly 25 findings at fingerprint
`5df3477f297457e12680d8e9b3bdc7d12358eeb01782cae11408639a59c3e4a1`.
The complete standard gate passes on implementation commit `efa5a8d`.

## Failure and release boundary

Do not restore the never-selected pickup/return visibility, address override,
Maps-action, pickup-row or initially-open cancellation variants. Do not weaken
the active address privacy surfaces, exact-address reveal, approximate maps,
Maps actions or central cancellation copy. Do not add lint suppression, retry,
sleep, reduced concurrency or an alternate temp root.

S4BB needed no cleanup, network switch or test accommodation: the
standard-parallel gate passed once with 977 MiB available before and 1147 MiB
after. `TD-RR-012` nevertheless remains open because this warm-tree
observation is not the required deterministic release-host proof.

This package changes no live availability, quote, Payment, refund, delivery,
cancellation, support, privacy/retention classification, audit or
`needsReview` behavior. Continue reviewed reductions in the remaining 25
message-thread analyzer findings. P0B remains `HOLD` / `NO-GO`.
