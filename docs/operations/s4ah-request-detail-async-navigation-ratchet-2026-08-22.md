# S4AH request-detail async-navigation ratchet

Status: locally verified, non-live.

## Canonical checks

Run Flutter commands sequentially from the repository root:

```sh
node --test \
  test/tool/request_detail_async_context_wiring.test.mjs \
  test/tool/request_detail_dead_message_card_cleanup_wiring.test.mjs \
  test/tool/v51_owner_acceptance_server_price_wiring.test.mjs
flutter test --reporter expanded \
  test/private_pilot_pricing_test.dart \
  test/private_pilot_checkout_test.dart
flutter analyze 2>&1 \
  | node tool/validate_flutter_analyzer_debt.mjs --log -
```

The combined source selection reports 20 passes, the Flutter selection reports
nine passes, and the analyzer validator accepts exactly 198 findings at
fingerprint
`d39144ea4cec745b18c765e2aedc84b5a4a270f1fb0088f274aab4b4e91e4958`.

## Failure and release boundary

Do not replace either exact context check with a State-only guard, delay, retry
or lint suppression. Acceptance and decline may navigate only while the exact
request-detail context remains mounted after their asynchronous mutation.

This ratchet changes no contract, quote, declaration, deadline, status or
notification rule. It neither closes `TD-RR-010` nor authorizes live changes.
Continue reviewed source reductions to zero and retain exact-commit CI before
release readiness. P0B remains `HOLD` / `NO-GO`.
