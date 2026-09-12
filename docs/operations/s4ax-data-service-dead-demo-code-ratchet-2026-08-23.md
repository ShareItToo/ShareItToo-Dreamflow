# S4AX DataService dead demo-code ratchet

Status: locally verified, non-live.

## Canonical checks

Run Flutter commands sequentially from the repository root:

```sh
node --test \
  test/tool/data_service_dead_demo_code_ratchet_wiring.test.mjs \
  test/tool/g5a_supply_enrichment_wiring.test.mjs \
  test/tool/v51_condition_evidence_wiring.test.mjs \
  test/tool/v51_owner_acceptance_server_price_wiring.test.mjs \
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

The focused source/analyzer/privacy/retention/data-integrity selection reports
98 passes and the Flutter selection reports 125 passes. The analyzer validator
accepts exactly 55 findings at fingerprint
`22b02e5374806254f66a71c19e7d550452e815389419c95d31d76efbb65bdf9a`.
The complete standard gate passes on implementation commit `0fcf3dd`.

## Failure and release boundary

Do not restore the old starter-notification seed, empty demo-request
initializer, demo-message-thread builder, unused category resolver or its
orphaned prefix. Do not weaken the current-user-bound debug QA fixtures,
category initialization, request persistence, express timeout, participant
thread, canonical support, privacy or retention contracts. Do not add lint
suppression, retry, sleep, reduced concurrency or an alternate temp root.

S4AX needed no cleanup or test accommodation: the standard-parallel gate
passed once with 980 MiB available before and 984 MiB after. `TD-RR-012`
nevertheless remains open because this warm-tree observation is not the
required deterministic release-host proof.

This package changes no live availability, quote, Payment, refund, delivery,
cancellation, support, privacy/retention classification, audit or
`needsReview` behavior. Continue reviewed reductions in the remaining 55
analyzer findings. P0B remains `HOLD` / `NO-GO`.
