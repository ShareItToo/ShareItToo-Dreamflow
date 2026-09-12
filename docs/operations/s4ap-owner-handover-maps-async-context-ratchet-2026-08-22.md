# S4AP owner handover/maps async-context ratchet

Status: locally verified, non-live.

## Canonical checks

Run Flutter commands sequentially from the repository root:

```sh
node --test \
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

The focused source/analyzer/privacy selection reports 34 passes and the Flutter
selection reports 96 passes. The release validators retain their fail-closed
state, and the analyzer validator accepts exactly 165 findings at fingerprint
`0e3a17c307ad7158bf910a2e2c96a574bdbda8fcf0b9682935c1b3007322feca`.

## Failure and release boundary

Do not replace any exact State/context check with a delay, retry or lint
suppression. The cleared owner-detail context bucket must stay at zero; its
findings cannot be moved, replaced or reintroduced.

This ratchet changes no time confirmation, Maps destination, challenge,
stepper, completion, booking, `needsReview` or privacy classification. It does
not close `TD-RR-010` or authorize live changes. Continue reviewed source
reductions in the remaining booking-detail and item-overlay context buckets and
retain exact-commit CI before release readiness. P0B remains `HOLD` / `NO-GO`.
