# S4AL explore async-context ratchet - architecture

Status: locally verified on 22.08.2026 at implementation commit `79b0a1e`.
This is a non-live source-safety reduction for `TD-RR-010`; it changes no
production, Payment, Store, Cloud/VPS/DNS or pilot state.

## Explore Wishlist lifecycle boundaries

The Explore favorite action awaited the current Wishlist assignment and then
opened either add or manage UI through its State context. It now stops when the
State has been disposed before either branch. The manage branch also rechecks
the lifecycle after option selection before opening the move selector.

The add, move, remove and final saved-ID refresh operations are unchanged.
Wishlist data, public catalog filtering, listing truth, optional fail-open
supply enrichment and navigation remain identical; only late UI through a
disposed Explore screen is discarded.

Three committed S4AL source contracts lock the two lifecycle boundaries and
reject timing or lint accommodations. Together with the existing Wishlist,
Explore-card and supply-enrichment contracts, eleven assertions pass. Twenty-one
focused catalog, saved-item, display, accessibility, search-overlay and
navigation Flutter tests retain the surrounding behavior.

Because Explore is source-bound by both release privacy inventories, their
exact source hash is updated together with this reviewed source change. The
privacy disclosure remains `draft` and the retention execution gate remains
blocked; no classification, approval or release state changes.

## Analyzer ratchet and evidence

The exact analyzer snapshot moved only in the intended bucket:

- total `191 -> 188`;
- `use_build_context_synchronously` `69 -> 66`;
- `lib/screens/explore_screen.dart` context bucket `3 -> 0`; and
- fingerprint
  `7ff7384c92758c2aa50f5b10b07cbf52982bc97551552e56f725d64e98cddbe7`
  -> `fb539341b569d96de829b1d4f9c0c706e6c65066d2eaeb3f0b563dfe33e35cf2`.

All other code and path/code counts remained unchanged. The complete clean
local metadata gate passed at `79b0a1ebba1b2478deac6eb5b37196d9cad167b9`
with the exact 188-diagnostic snapshot, 384 Flutter tests plus one documented
skip, Google-only, Web build/smoke and one direct 448-task Android debug build.

This is another downward step for `TD-RR-010`, not closure. Further reviewed
source ratchets to zero plus exact-commit CI remain mandatory. P0B remains
`HOLD` / `NO-GO`.
