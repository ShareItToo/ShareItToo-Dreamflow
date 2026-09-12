# S4BE Flutter analyzer-zero ratchet

Status: locally verified, non-live.

## Canonical checks

Run Flutter commands sequentially from the repository root:

```sh
node --test \
  test/tool/message_thread_dead_helper_ratchet_wiring.test.mjs \
  test/tool/message_thread_legacy_ui_ratchet_wiring.test.mjs \
  test/tool/message_thread_analyzer_zero_ratchet_wiring.test.mjs \
  test/tool/message_thread_async_context_wiring.test.mjs \
  test/tool/validate_messaging_launch_scope.test.mjs \
  test/tool/booking_address_reveal_wiring.test.mjs \
  test/tool/validate_android_photo_picker_policy.test.mjs \
  test/tool/v51_condition_evidence_wiring.test.mjs \
  test/tool/support_legacy_migration_wiring.test.mjs \
  test/tool/analyzer_baseline_wiring.test.mjs \
  test/tool/validate_flutter_analyzer_debt.test.mjs \
  test/tool/validate_privacy_disclosures.test.mjs \
  test/tool/validate_retention_deletion_readiness.test.mjs \
  test/tool/validate_g2_data_lifecycle.test.mjs
node tool/validate_privacy_disclosures.mjs
node tool/validate_retention_deletion_readiness.mjs
node tool/validate_g2_data_lifecycle.mjs
flutter test --reporter expanded \
  test/message_thread_screen_logic_test.dart \
  test/private_pilot_chat_policy_test.dart \
  test/shared_message_thread_sync_test.dart \
  test/support_flow_safety_triage_test.dart
flutter analyze
CI=true SIT_ALLOW_CANDIDATE_ROLLOVER=1 \
  bash scripts/technical_regression_check.sh
```

The focused source/analyzer/privacy/retention/data-integrity selection reports
111 passes and the Flutter selection reports 42 passes. Native
`No issues found!` output is normalized to the exact empty snapshot at
fingerprint
`01ba4719c80b6fe911b091a7c05124b64eeece964e09c058ef8f9805daca546b`.
The complete standard gate passes on implementation commit `2fd646b`.
Exact CI run `32608792863` is green at documentation commit `4d914ed`:
Backend passed in 1:31, Flutter passed in 6:36 and publishing was skipped.

## Failure and release boundary

Do not restore the disconnected composition animation-controller/tween chain
or the never-selected location loading branch. Do not weaken the active focus
transitions, listener lifecycle, exact empty analyzer snapshot, privacy source
inventory or fail-closed analyzer parsing. Do not add lint suppression, retry,
sleep, reduced concurrency or an alternate temp root.

S4BE needed no cleanup, network switch, Pixel or test accommodation: the
standard-parallel gate passed once with 1135 MiB available before and 1144 MiB
after. `TD-RR-012` remains open because this warm-tree observation is not the
required deterministic release-host proof.

This package changes no live availability, quote, Payment, refund, delivery,
cancellation, support, privacy/retention classification, audit or
`needsReview` behavior. Exact S4BE CI is green, so `TD-RR-010` is closed while
the exact-zero gate remains permanent. P0B remains `HOLD` / `NO-GO`.
