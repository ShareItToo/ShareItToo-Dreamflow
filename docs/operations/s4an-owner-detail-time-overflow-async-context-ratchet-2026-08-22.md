# S4AN owner-detail time/overflow async-context ratchet

Status: locally verified, non-live.

## Canonical checks

Run Flutter commands sequentially from the repository root:

```sh
node --test \
  test/tool/ongoing_owner_time_overflow_async_context_wiring.test.mjs \
  test/tool/validate_p0b_pilot_dossier.test.mjs \
  test/tool/analyzer_baseline_wiring.test.mjs \
  test/tool/validate_privacy_disclosures.test.mjs
node tool/validate_p0b_pilot_dossier.mjs
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
state, and the analyzer validator accepts exactly 175 findings at fingerprint
`499e95593296df94e8d4da41c46ef05f1bc1469b30e16efebf45d53ecb3b7a18`.

## Failure and release boundary

Do not replace any lifecycle check with a delay, retry or lint suppression.
Every later popup, toast or navigator access requires the owning State or exact
builder context after its immediately preceding asynchronous dependency.

This ratchet changes no appointment, cancellation, timeline, quote, booking,
handover/return, item-detail, privacy classification or navigation rule. It
neither closes `TD-RR-010` nor authorizes live changes. Continue reviewed source
reductions to zero and retain exact-commit CI before release readiness. P0B
remains `HOLD` / `NO-GO`.
