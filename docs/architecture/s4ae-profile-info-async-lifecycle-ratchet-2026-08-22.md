# S4AE profile-info async-lifecycle ratchet - architecture

Status: locally verified on 22.08.2026 at implementation commit `42a2982`.
This is a non-live source-safety reduction for `TD-RR-010`; it changes no
production, Payment, Store, Cloud/VPS/DNS or pilot state.

## Profile lifecycle boundary

After a successful profile save, the screen awaited its success toast and then
used the same context to close the route without proving that the screen still
existed. A separate unflagged path could also call `setState` from a late
profile-load error after disposal.

The save path now rechecks the owning State immediately after the toast before
navigation. The load failure path checks the same lifecycle before clearing its
loading State. A completed profile save remains completed; only late UI work is
discarded.

Three committed source contracts lock both lifecycle boundaries and reject
timing delays or lint suppression. Fifteen focused public-profile and large-text
tests retain the surrounding profile contract.

## Analyzer ratchet and evidence

The exact analyzer snapshot moved only in the intended bucket:

- total `204 -> 203`;
- `use_build_context_synchronously` `82 -> 81`;
- `lib/screens/profile_info_screen.dart` bucket `1 -> 0`; and
- fingerprint
  `54a8b14c150f43d5a4ae03176c9075c6ca1a9043e7c173eb8a5b7fa4265393ae`
  -> `6a859c38b4b87688200eecb4320e070409d552aa52318aa25f778a6472c71614`.

All other code and path/code counts remained unchanged. The three focused
contracts, 15 related Flutter tests and the complete clean implementation-head
local metadata gate passed at `42a2982109db3b7a9c784f74ed82f9caa7a247cc`
with the exact 203-diagnostic snapshot, 384 Flutter tests plus one documented
skip, Google-only, Web build/smoke and one direct Android debug build with 448
tasks.

This is another downward step for `TD-RR-010`, not closure. Further reviewed
source ratchets to zero plus exact-commit CI remain mandatory. P0B remains
`HOLD` / `NO-GO`.
