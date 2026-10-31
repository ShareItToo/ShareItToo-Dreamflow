# S4AH request-detail async-navigation ratchet - architecture

Status: locally verified on 22.08.2026 at implementation commit `c8c2a56`.
This is a non-live source-safety reduction for `TD-RR-010`; it changes no
production, Payment, Store, Cloud/VPS/DNS or pilot state.

## Request-detail navigation lifecycle boundary

The owner-acceptance callback awaited the canonical acceptance commit and then
used its captured request-detail `BuildContext` for navigation. A State-level
guard did not prove the lifetime of that exact context. The decline action had
the same boundary after its status mutation.

Both paths now check `context.mounted` immediately after their asynchronous
mutation and stop before navigation when the request-detail context has been
disposed. The existing pre-commit acceptance check remains in place. Contract,
quote, legal declaration, deadline, status-transition and notification logic
are unchanged; only navigation through a disposed context is discarded.

Three committed S4AH source contracts lock the exact acceptance and decline
boundaries and reject timing delays or lint suppression. Together with the
existing request-detail and V5.1 acceptance contracts, 20 assertions pass. Nine
focused private-pilot pricing and checkout Flutter tests retain the surrounding
quote and acceptance behavior.

## Analyzer ratchet and evidence

The exact analyzer snapshot moved only in the intended bucket:

- total `200 -> 198`;
- `use_build_context_synchronously` `78 -> 76`;
- `lib/screens/request_detail_screen.dart` bucket `2 -> 0`; and
- fingerprint
  `521233f5d8bfbbb086e2ed3cd3d33d43726c83e30cd9f963c65f4ed7171f0bbb`
  -> `d39144ea4cec745b18c765e2aedc84b5a4a270f1fb0088f274aab4b4e91e4958`.

All other code and path/code counts remained unchanged. The 20 combined source
contracts, nine related Flutter tests and the complete clean local metadata
gate passed at `c8c2a56087b330c67a6e1374905222ae1cc73606` with the exact
198-diagnostic snapshot, 384 Flutter tests plus one documented skip,
Google-only, Web build/smoke and one direct 448-task Android debug build.

This is another downward step for `TD-RR-010`, not closure. Further reviewed
source ratchets to zero plus exact-commit CI remain mandatory. P0B remains
`HOLD` / `NO-GO`.
