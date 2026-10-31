# S4AJ owner-requests async-context ratchet

Status: locally verified, non-live.

## Canonical checks

Run Flutter commands sequentially from the repository root:

```sh
node --test \
  test/tool/owner_requests_async_context_wiring.test.mjs \
  test/tool/bookings_screen_dead_ui_cleanup_wiring.test.mjs \
  test/tool/v51_owner_acceptance_server_price_wiring.test.mjs
flutter test --reporter expanded \
  test/owner_requests_remote_hydration_test.dart \
  test/private_pilot_pricing_test.dart \
  test/private_pilot_checkout_test.dart \
  test/review_prompt_sheet_logic_test.dart
flutter analyze 2>&1 \
  | node tool/validate_flutter_analyzer_debt.mjs --log -
```

The combined source selection reports 21 passes, the Flutter selection reports
15 passes, and the analyzer validator accepts exactly 194 findings at
fingerprint
`8d1861725889696144f3a632187bdc795d5abe599b33139f5bc3d95d60c65e98`.

## Failure and release boundary

Do not replace either lifecycle check with a delay, retry or lint suppression.
Decline result UI requires the owning State after mutation and refresh; inline
review requires the same State after current-user lookup. Existing product
auto-close timers are behavior, not a test or release workaround.

This ratchet changes no acceptance, decline, review, quote or status rule. It
neither closes `TD-RR-010` nor authorizes live changes. Continue reviewed source
reductions to zero and retain exact-commit CI before release readiness. P0B
remains `HOLD` / `NO-GO`.
