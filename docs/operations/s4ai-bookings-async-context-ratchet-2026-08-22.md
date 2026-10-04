# S4AI bookings async-context ratchet

Status: locally verified, non-live.

## Canonical checks

Run Flutter commands sequentially from the repository root:

```sh
node --test \
  test/tool/bookings_async_context_wiring.test.mjs \
  test/tool/bookings_screen_dead_ui_cleanup_wiring.test.mjs \
  test/tool/booking_address_reveal_wiring.test.mjs \
  test/tool/v51_booking_detail_server_price_snapshot_wiring.test.mjs \
  test/tool/v52_contract_checkout_wiring.test.mjs
flutter test --reporter expanded \
  test/booking_status_copy_test.dart \
  test/data_service_booking_rules_test.dart \
  test/review_prompt_sheet_logic_test.dart
flutter analyze 2>&1 \
  | node tool/validate_flutter_analyzer_debt.mjs --log -
```

The combined source selection reports 20 passes, the Flutter selection reports
55 passes, and the analyzer validator accepts exactly 196 findings at
fingerprint
`80c9450eda2af563072e34fe4fc0a2fa31e166def4e6d5c6ac28d2930be0080e`.

The privacy and retention validators must remain draft, fail-closed and green
after the source hash refresh. They do not authorize a Console save or Store
submission.

## Failure and release boundary

Do not replace either lifecycle check with a delay, retry or lint suppression.
Booking-card navigation requires its exact builder context after the read
mutation; inline review requires its owning State after current-user lookup.

This ratchet changes no booking state, read semantics, review eligibility,
quote or navigation destination. It neither closes `TD-RR-010` nor authorizes
live changes. Continue reviewed source reductions to zero and retain
exact-commit CI before release readiness. P0B remains `HOLD` / `NO-GO`.
