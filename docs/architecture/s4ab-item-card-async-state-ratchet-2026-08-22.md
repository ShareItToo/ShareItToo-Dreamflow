# S4AB item-card async-state ratchet - architecture

Status: locally verified on 22.08.2026 at implementation commit `84dcc07`.
This is a non-live source-safety reduction for `TD-RR-010`; it changes no
production, Payment, Store, Cloud/VPS/DNS or pilot state.

## Card lifecycle boundary

The listing card's private Wishlist button could outlive any of its asynchronous
local-storage or dialog operations. Initial state loading updated the State
after an await without a mounted check. First assignment could update the card,
read localization from its context and open a toast after the card disappeared.
The manage flow could also reopen the Move dialog after disposal.

The implementation now requires the State to remain mounted after each load,
selection, assignment, move and removal boundary before any later State or
context access. The Move path also snapshots and validates the current list ID
instead of force-unwrapping mutable State after the management dialog returns.
A disposed card simply ignores the late UI result; persisted operations that
already completed are not rolled back or falsely reported as pending.

Four committed source contracts lock each lifecycle boundary and reject timing
delays or lint suppression. Five existing Gemerkt/Mietkorb persistence,
accessibility and account-deletion tests retain the user-facing data contract.

## Analyzer ratchet and evidence

The exact analyzer snapshot moved only in the intended bucket:

- total `210 -> 207`;
- `use_build_context_synchronously` `88 -> 85`;
- `lib/widgets/item_card.dart` bucket `3 -> 0`; and
- fingerprint
  `2896706b188c8ff524911d8a16505c9a91a77a0183a03739e6ed34e664ce243b`
  -> `2001fe6ae09a6e04b63b37b140b88dde0327940540c74a60ff35e7efd987bfe8`.

All other code and path/code counts remained unchanged. The focused contracts,
five related Flutter tests and the complete clean implementation-head local
metadata gate passed at `84dcc078bbd0d1f32d19b2a1ec83f7eb7504e561` with the
exact 207-diagnostic snapshot, 384 Flutter tests plus one documented skip,
Google-only, Web build/smoke and Android debug. SIT temp roots remained zero.

This is another downward step for `TD-RR-010`, not closure. Further reviewed
source ratchets to zero plus exact-commit CI remain mandatory. P0B remains
`HOLD` / `NO-GO`.
