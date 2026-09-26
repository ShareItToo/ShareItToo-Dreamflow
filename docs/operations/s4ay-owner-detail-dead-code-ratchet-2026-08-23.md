# S4AY owner-detail dead-code ratchet

Status: locally verified, non-live.

## Canonical checks

Run Flutter commands sequentially from the repository root:

```sh
node --test \
  test/tool/ongoing_owner*.test.mjs \
  test/tool/return_handover_stepper_dead_datetime_formatter_cleanup_wiring.test.mjs \
  test/tool/booking_detail_legacy_ui_cleanup_wiring.test.mjs \
  test/tool/v51_ride_compensation_runtime_removed_wiring.test.mjs \
  test/tool/v51_owner_detail_transport_disabled_wiring.test.mjs \
  test/tool/v51_condition_evidence_wiring.test.mjs \
  test/tool/v51_return_lifecycle_wiring.test.mjs \
  test/tool/v51_owner_acceptance_server_price_wiring.test.mjs \
  test/tool/fixed_default_parameter_cleanup_wiring.test.mjs \
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
154 passes and the Flutter selection reports 125 passes. The analyzer validator
accepts exactly 48 findings at fingerprint
`7eaccc800db8e802b7f487fb836d26ba1a2b4d8fa60ccf1451387070ee3fcc36`.
The complete standard gate passes on implementation commit `a61cb4d`.

## Failure and release boundary

Do not restore the write-only review field, unused Maps launcher, local code
calculators, obsolete handover-photo wrapper, manual-handover notice, duplicate
QR overlay or its transitive toast orphan. Do not weaken the active
confirmed-location launcher, server challenge, counterparty verifier, stepper
QR, evidence, authenticated transition, cancellation or review contracts. Do
not add lint suppression, retry, sleep, reduced concurrency or an alternate
temp root.

S4AY needed no cleanup, network switch or test accommodation: the
standard-parallel gate passed once with 979 MiB available before and 978 MiB
after. `TD-RR-012` nevertheless remains open because this warm-tree observation
is not the required deterministic release-host proof.

This package changes no live availability, quote, Payment, refund, delivery,
cancellation, support, privacy/retention classification, audit or
`needsReview` behavior. Continue reviewed reductions in the remaining 48
analyzer findings. P0B remains `HOLD` / `NO-GO`.
