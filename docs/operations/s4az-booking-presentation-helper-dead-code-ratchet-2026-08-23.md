# S4AZ booking presentation-helper dead-code ratchet

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
144 passes and the Flutter selection reports 125 passes. The analyzer validator
accepts exactly 42 findings at fingerprint
`6d103704bca501bbbea5b2faf8eea97d722dfa481e8d11a2536d82cb5c17276d`.
The complete standard gate passes on implementation commit `c283b59`.

## Failure and release boundary

Do not restore the dead phone, ICS calendar, legacy handover-code or deadline
format helpers or the unused completion-card closure. Do not weaken active map
navigation, booking-bound code, server challenge, cancellation policy,
completion facts, review, financial-document, evidence or lifecycle contracts.
Do not add lint suppression, retry, sleep, reduced concurrency or an alternate
temp root.

S4AZ needed no cleanup, network switch or test accommodation: the
standard-parallel gate passed once with 972 MiB available before and 963 MiB
after. `TD-RR-012` nevertheless remains open because this warm-tree observation
is not the required deterministic release-host proof.

This package changes no live availability, quote, Payment, refund, delivery,
cancellation, support, privacy/retention classification, audit or
`needsReview` behavior. Continue reviewed reductions in the remaining 42
analyzer findings. P0B remains `HOLD` / `NO-GO`.
