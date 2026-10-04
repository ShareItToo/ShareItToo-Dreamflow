# S4AT item-details secondary async-context ratchet

Status: locally verified, non-live.

## Canonical checks

Run Flutter commands sequentially from the repository root:

```sh
node --test \
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

The focused source/analyzer/privacy selection reports 54 passes and the Flutter
selection reports 96 passes. The release validators retain their fail-closed
state, and the analyzer validator accepts exactly 122 findings at fingerprint
`973a7abbc7427743d4b4073590aa0dfe3dfca12fd7edb938f457a5231060a96d`.
`use_build_context_synchronously` and every owner-detail, booking-detail and
item-overlay context bucket are zero.

## Failure and release boundary

Do not replace an exact State or callback-context check with a delay, retry,
stored context or lint suppression. The cleared context bucket cannot be
raised, moved or replaced.

The failed standard-parallel local clean-head gate and the green serial
diagnosis are recorded under `TD-RR-003`; concurrency one is not an accepted
gate. Retain exact-commit CI and the repository's five-run default-parallel
stress proof before release readiness.

This ratchet changes no request persistence, availability, Wishlist behavior,
support intake, Payment, confirmation destination, privacy classification or
`needsReview` behavior. Continue reviewed reductions in the remaining 122
analyzer findings. P0B remains `HOLD` / `NO-GO`.
