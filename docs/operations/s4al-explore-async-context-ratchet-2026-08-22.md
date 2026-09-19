# S4AL explore async-context ratchet

Status: locally verified, non-live.

## Canonical checks

Run Flutter commands sequentially from the repository root:

```sh
node --test \
  test/tool/explore_async_context_wiring.test.mjs \
  test/tool/wishlist_async_context_wiring.test.mjs \
  test/tool/explore_listing_card_dead_verification_getter_cleanup_wiring.test.mjs \
  test/tool/g5a_supply_enrichment_wiring.test.mjs
node tool/validate_privacy_disclosures.mjs
node tool/validate_retention_deletion_readiness.mjs
flutter test --reporter expanded \
  test/listing_catalog_flow_test.dart \
  test/g2a_saved_items_persistence_test.dart \
  test/g2a_rental_cart_screen_test.dart \
  test/g2l_saved_items_lifecycle_test.dart \
  test/listing_display_truth_test.dart \
  test/large_text_primary_surfaces_test.dart \
  test/search_overlay_async_lifecycle_contract_test.dart \
  test/g2a_navigation_contract_test.dart
flutter analyze 2>&1 \
  | node tool/validate_flutter_analyzer_debt.mjs --log -
```

The combined source selection reports eleven passes, the Flutter selection
reports 21 passes, both release privacy validators retain their fail-closed
state, and the analyzer validator accepts exactly 188 findings at fingerprint
`fb539341b569d96de829b1d4f9c0c706e6c65066d2eaeb3f0b563dfe33e35cf2`.

## Failure and release boundary

Do not replace either lifecycle check with a delay, retry or lint suppression.
Add/manage UI requires the owning State after Wishlist lookup, and move UI
requires it again after manage-option selection.

This ratchet changes no Wishlist data, public catalog, listing truth, supply
enrichment, privacy classification or retention decision. It neither closes
`TD-RR-010` nor authorizes live changes. Continue reviewed source reductions to
zero and retain exact-commit CI before release readiness. P0B remains `HOLD` /
`NO-GO`.
