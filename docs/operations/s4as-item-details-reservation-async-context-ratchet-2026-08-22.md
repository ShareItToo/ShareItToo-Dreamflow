# S4AS item-details reservation async-context ratchet

Status: locally verified, non-live.

## Canonical checks

Run Flutter commands sequentially from the repository root:

```sh
node --test \
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

The focused source/analyzer/privacy selection reports 49 passes and the Flutter
selection reports 96 passes. The release validators retain their fail-closed
state, and the analyzer validator accepts exactly 132 findings at fingerprint
`e31bffb605c07c467e020fd64f81aba3227f33dcaf216445e1d71e3e81a99cdc`.

## Failure and release boundary

Do not replace an exact State, caller-context or root-navigator check with a
delay, retry, stored context or lint suppression. In particular, the removed
120- and 80-millisecond waits cannot return as reservation-flow prerequisites.
The reduced item-overlay bucket cannot be raised, moved or replaced.

This ratchet changes no request persistence, availability, checkout, Payment,
confirmation destination, privacy classification or `needsReview` behavior.
It does not close `TD-RR-010` or authorize live changes. Continue reviewed
source reductions in the remaining ten item-overlay context findings and retain
exact-commit CI before release readiness. P0B remains `HOLD` / `NO-GO`.
