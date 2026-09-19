# S4AK search-results async-context ratchet - architecture

Status: locally verified on 22.08.2026 at implementation commit `204e60f`.
This is a non-live source-safety reduction for `TD-RR-010`; it changes no
production, Payment, Store, Cloud/VPS/DNS or pilot state.

## Search-result Wishlist lifecycle boundaries

The search-result favorite action awaited the current Wishlist assignment and
then opened either add or manage UI through its State context. It now stops when
the State has been disposed before either branch. The manage branch also
rechecks the lifecycle after option selection before opening the move selector.

The add, move, remove and final saved-ID refresh operations are unchanged.
Wishlist data, filters, catalog results and item navigation remain identical;
only late UI through a disposed search-results screen is discarded.

Three committed S4AK source contracts lock the two lifecycle boundaries and
reject timing or lint accommodations. Together with the existing Wishlist-sheet
contracts, five assertions pass. Nine focused catalog, saved-item, cart, search
overlay and navigation Flutter tests retain the surrounding behavior.

## Analyzer ratchet and evidence

The exact analyzer snapshot moved only in the intended bucket:

- total `194 -> 191`;
- `use_build_context_synchronously` `72 -> 69`;
- `lib/screens/search_results_screen.dart` bucket `3 -> 0`; and
- fingerprint
  `8d1861725889696144f3a632187bdc795d5abe599b33139f5bc3d95d60c65e98`
  -> `7ff7384c92758c2aa50f5b10b07cbf52982bc97551552e56f725d64e98cddbe7`.

All other code and path/code counts remained unchanged. The complete clean
local metadata gate passed at `204e60f08c7fd366c919db73f6d6a7be0445a0f5`
with the exact 191-diagnostic snapshot, 384 Flutter tests plus one documented
skip, Google-only, Web build/smoke and one direct 448-task Android debug build.

This is another downward step for `TD-RR-010`, not closure. Further reviewed
source ratchets to zero plus exact-commit CI remain mandatory. P0B remains
`HOLD` / `NO-GO`.
