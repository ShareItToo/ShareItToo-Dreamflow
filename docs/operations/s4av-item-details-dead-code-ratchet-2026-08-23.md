# S4AV item-details dead-code ratchet

Status: locally verified, non-live.

## Canonical checks

Run Flutter commands sequentially from the repository root:

```sh
node --test \
  test/tool/item_details_dead_code_ratchet_wiring.test.mjs \
  test/tool/item_details_dead_tag_chips_cleanup_wiring.test.mjs \
  test/tool/v51_item_details_transport_fail_closed_wiring.test.mjs \
  test/tool/item_details_radio_group_migration_wiring.test.mjs \
  test/tool/item_details_secondary_async_context_wiring.test.mjs \
  test/tool/item_details_reservation_async_context_wiring.test.mjs \
  test/tool/booking_detail_handover_return_async_context_wiring.test.mjs \
  test/tool/booking_detail_primary_async_context_wiring.test.mjs \
  test/tool/ongoing_owner_handover_maps_async_context_wiring.test.mjs \
  test/tool/ongoing_owner_request_decision_async_context_wiring.test.mjs \
  test/tool/ongoing_owner_time_overflow_async_context_wiring.test.mjs \
  test/tool/analyzer_baseline_wiring.test.mjs \
  test/tool/validate_flutter_analyzer_debt.test.mjs \
  test/tool/validate_privacy_disclosures.test.mjs
node tool/validate_privacy_disclosures.mjs
node tool/validate_retention_deletion_readiness.mjs
node tool/validate_g2_data_lifecycle.mjs
flutter test --reporter expanded \
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

The focused source/analyzer/privacy selection reports 77 passes and the
Flutter selection reports 96 passes. The analyzer validator accepts exactly 71
findings at fingerprint
`7f6ed0bc3a558b236e102fa82dd30da133c3b1cbdf6bde81d5aeb3d52c11a980`.
The complete standard gate passes on implementation commit `4632aac`.

## Failure and release boundary

Do not restore the uncalled sheet request path or the removed private helpers.
Do not weaken the active Page-/Bottom-Reservation, Delivery, Cancellation,
privacy or `needsReview` contracts. Do not add lint suppression, retry, sleep,
reduced concurrency or an alternate temp root.

The first focused Flutter selection failed with `No space left on device` when
the data volume had only 238 MiB free. Regenerable build/package caches were
cleared once, after which the identical focused command and complete standard
gate passed. `TD-RR-012` keeps this incident open until a normal release-host
run proves manual cache cleanup is not a recurring prerequisite.

This package changes no live availability, quote, Payment, refund, delivery,
cancellation, support, privacy classification, audit or `needsReview`
behavior. Continue reviewed reductions in the remaining 71 analyzer findings.
P0B remains `HOLD` / `NO-GO`.
