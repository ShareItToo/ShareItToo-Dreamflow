# S4AM message-thread async-context ratchet

Status: locally verified, non-live.

## Canonical checks

Run Flutter commands sequentially from the repository root:

```sh
node --test \
  test/tool/message_thread_async_context_wiring.test.mjs \
  test/tool/v51_owner_acceptance_server_price_wiring.test.mjs \
  test/tool/validate_privacy_disclosures.test.mjs
node tool/validate_privacy_disclosures.mjs
node tool/validate_retention_deletion_readiness.mjs
flutter test --reporter expanded \
  test/message_thread_screen_logic_test.dart \
  test/private_pilot_chat_policy_test.dart \
  test/data_service_booking_rules_test.dart \
  test/qa_bootstrap_service_test.dart \
  test/b10_release_truthfulness_test.dart \
  test/private_pilot_checkout_test.dart \
  test/booking_flow_policy_test.dart \
  test/secure_booking_confirmation_test.dart
flutter analyze 2>&1 \
  | node tool/validate_flutter_analyzer_debt.mjs --log -
```

The message-thread and acceptance source selection reports 18 passes, the
privacy contract selection reports 17 passes, the Flutter selection reports 96
passes, the release privacy validators retain their fail-closed state, and the
analyzer validator accepts exactly 182 findings at fingerprint
`44ca5afd2e1eb86cdac3fda478dbc76bde2de2682e903d506acf929c589908a8`.

## Failure and release boundary

Do not replace any lifecycle check with a delay, retry or lint suppression.
Every later dialog, popup or navigator access requires the owning State after
its immediately preceding asynchronous data dependency.

This ratchet changes no chat state, acceptance, quote, appointment,
handover/return, profile, privacy classification or navigation rule. It neither
closes `TD-RR-010` nor authorizes live changes. Continue reviewed source
reductions to zero and retain exact-commit CI before release readiness. P0B
remains `HOLD` / `NO-GO`.
