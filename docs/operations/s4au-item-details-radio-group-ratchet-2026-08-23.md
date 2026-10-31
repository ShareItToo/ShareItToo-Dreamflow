# S4AU item-details RadioGroup ratchet

Status: locally verified, non-live.

## Canonical checks

Run Flutter commands sequentially from the repository root:

```sh
node --test \
  test/tool/item_details_radio_group_migration_wiring.test.mjs \
  test/tool/item_details_secondary_async_context_wiring.test.mjs \
  test/tool/item_details_reservation_async_context_wiring.test.mjs \
  test/tool/booking_detail_handover_return_async_context_wiring.test.mjs \
  test/tool/booking_detail_primary_async_context_wiring.test.mjs \
  test/tool/ongoing_owner_handover_maps_async_context_wiring.test.mjs \
  test/tool/ongoing_owner_request_decision_async_context_wiring.test.mjs \
  test/tool/ongoing_owner_time_overflow_async_context_wiring.test.mjs \
  test/tool/analyzer_baseline_wiring.test.mjs \
  test/tool/validate_privacy_disclosures.test.mjs
node tool/validate_privacy_disclosures.mjs
node tool/validate_retention_deletion_readiness.mjs
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
```

The focused source/analyzer/privacy selection reports 59 passes and the Flutter
selection reports 96 passes. The release validators retain their fail-closed
state, and the analyzer validator accepts exactly 86 findings at fingerprint
`d7a3e505c7549ebd2c9ab92b87ba05aba9171dc2341fb9770d3404239ea337bc`.
`deprecated_member_use` and `use_build_context_synchronously` are both zero.

## Failure and release boundary

Do not move value ownership back into `RadioListTile`, omit the explicit
disabled state for an unavailable Vermieter choice, or remove delivery
selection persistence. Do not reintroduce a deprecated API, lint suppression,
retry or timing accommodation.

The failed standard-parallel local clean-head gate is recorded under
`TD-RR-003`; serial or reduced concurrency is not an accepted gate. Retain
exact-commit CI and the repository's five-run default-parallel stress proof
before release readiness.

This ratchet changes no availability, delivery entitlement, quote, Payment,
cancellation, support, privacy classification or `needsReview` behavior.
Continue reviewed reductions in the remaining 86 analyzer findings. P0B
remains `HOLD` / `NO-GO`.
