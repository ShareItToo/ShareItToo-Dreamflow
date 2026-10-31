# S4AF listing-photo async-lifecycle ratchet - architecture

Status: locally verified on 22.08.2026 at implementation commit `a2d0ac1`,
with exact privacy/retention source binding and full gate at `eb413d1`.
This is a non-live source-safety reduction for `TD-RR-010`; it changes no
production, Payment, Store, Cloud/VPS/DNS or pilot state.

## Photo-preview lifecycle boundary

The picked-photo thumbnail awaited file bytes and then used its original
`BuildContext` to open a preview dialog. If the thumbnail was removed during
that asynchronous read, the continuation could target a disposed context.

The preview now checks that exact local context immediately after the file
read and stops before `showDialog` when the thumbnail no longer exists. The
completed file read is harmless; only late UI work is discarded. A committed
source contract scopes itself to `_PickedThumb`, locks the ordering and rejects
timing delays or lint suppression. The existing Android photo-picker policy
contract keeps the surrounding image-only selection boundary intact.

Because this reviewed source is hash-bound by the privacy and retention
inventories, both manifests were updated to its exact SHA-256. Their disclosure,
retention and release states remain unchanged, draft and fail-closed.

## Analyzer ratchet and evidence

The exact analyzer snapshot moved only in the intended bucket:

- total `203 -> 202`;
- `use_build_context_synchronously` `81 -> 80`;
- `lib/screens/create_listing_screen.dart` bucket `1 -> 0`; and
- fingerprint
  `6a859c38b4b87688200eecb4320e070409d552aa52318aa25f778a6472c71614`
  -> `450b3cf87867dd26e7a02cfd38633f569063f543671fc585ee1d45a7d8127a05`.

All other code and path/code counts remained unchanged. Four focused
photo/lifecycle contracts and the complete clean local metadata gate passed at
`eb413d1e61e05c3e2e001a0a73bf02c6aafafb8d` with the exact 202-diagnostic
snapshot, 384 Flutter tests plus one documented skip, Google-only, Web
build/smoke and one direct 448-task Android debug build.

This is another downward step for `TD-RR-010`, not closure. Further reviewed
source ratchets to zero plus exact-commit CI remain mandatory. P0B remains
`HOLD` / `NO-GO`.
