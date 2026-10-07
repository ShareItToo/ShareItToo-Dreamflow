# S4AG public-profile async-context ratchet - architecture

Status: locally verified on 22.08.2026 at implementation commit `4f8a150`.
This is a non-live source-safety reduction for `TD-RR-010`; it changes no
production, Payment, Store, Cloud/VPS/DNS or pilot state.

## Public-profile menu lifecycle boundary

The profile menu's share action awaited clipboard access and then used the
screen `BuildContext` for success UI. Its State-level guard did not prove the
lifetime of that exact captured context. The block action also entered an
asynchronous confirmation flow from the same callback after another branch in
the callback could await work.

Sharing now checks `context.mounted` immediately after clipboard access before
opening its toast. Blocking checks the same context immediately before entering
the block flow. The block service and confirmation behavior are unchanged;
only UI work through a disposed screen is discarded.

Three committed source contracts lock both exact context boundaries and reject
timing delays or lint suppression. Sixteen focused public-profile, blocking and
large-text Flutter tests retain the surrounding behavior and accessibility.

## Analyzer ratchet and evidence

The exact analyzer snapshot moved only in the intended bucket:

- total `202 -> 200`;
- `use_build_context_synchronously` `80 -> 78`;
- `lib/screens/public_profile_screen.dart` bucket `2 -> 0`; and
- fingerprint
  `450b3cf87867dd26e7a02cfd38633f569063f543671fc585ee1d45a7d8127a05`
  -> `521233f5d8bfbbb086e2ed3cd3d33d43726c83e30cd9f963c65f4ed7171f0bbb`.

All other code and path/code counts remained unchanged. The three focused
source contracts, 16 related Flutter tests and the complete clean local
metadata gate passed at `4f8a150f7ca4e8e7fff9b0e8c2f2307633c50d6f` with the
exact 200-diagnostic snapshot, 384 Flutter tests plus one documented skip,
Google-only, Web build/smoke and one direct 448-task Android debug build.

This is another downward step for `TD-RR-010`, not closure. Further reviewed
source ratchets to zero plus exact-commit CI remain mandatory. P0B remains
`HOLD` / `NO-GO`.
