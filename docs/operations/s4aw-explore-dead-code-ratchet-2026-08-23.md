# S4AW Explore dead-code ratchet

Status: locally verified, non-live.

## Canonical checks

Run Flutter commands sequentially from the repository root:

```sh
node --test \
  test/tool/explore_dead_code_ratchet_wiring.test.mjs \
  test/tool/explore_listing_card_dead_verification_getter_cleanup_wiring.test.mjs \
  test/tool/explore_async_context_wiring.test.mjs \
  test/tool/g5a_supply_enrichment_wiring.test.mjs \
  test/tool/analyzer_baseline_wiring.test.mjs \
  test/tool/validate_flutter_analyzer_debt.test.mjs \
  test/tool/validate_privacy_disclosures.test.mjs \
  test/tool/validate_retention_deletion_readiness.test.mjs
node tool/validate_privacy_disclosures.mjs
node tool/validate_retention_deletion_readiness.mjs
node tool/validate_g2_data_lifecycle.mjs
flutter test --reporter expanded \
  test/b10_release_truthfulness_test.dart \
  test/listing_display_truth_test.dart \
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
CI=true SIT_ALLOW_CANDIDATE_ROLLOVER=1 \
  bash scripts/technical_regression_check.sh
```

The focused source/analyzer/privacy/retention selection reports 79 passes and
the Flutter selection reports 125 passes. The analyzer validator accepts
exactly 59 findings at fingerprint
`9b3a4755f7e63848ba50a78a357115aa60d3cea8c8dee668113b2e33b1ccbe59`.
The complete standard gate passes on implementation commit `3df03c0`.

## Failure and release boundary

Do not restore the removed helpers, never-started timer machinery or
default-only parameter branches. Do not weaken the active long-press, search,
category filtering, item-details, listing-options, Wishlist/favorite, G5A,
privacy or retention contracts. Do not add lint suppression, retry, sleep,
reduced concurrency or an alternate temp root.

S4AW needed no cleanup or test accommodation: the standard-parallel gate
passed once with 999 MiB available before and 994 MiB after. `TD-RR-012`
nevertheless remains open because this warm-tree observation is not the
required deterministic release-host capacity and bounded-growth proof.

This package changes no live availability, quote, Payment, refund, delivery,
cancellation, support, privacy/retention classification, audit or
`needsReview` behavior. Continue reviewed reductions in the remaining 59
analyzer findings. P0B remains `HOLD` / `NO-GO`.
