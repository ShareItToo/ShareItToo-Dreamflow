# S4AO owner-request result async-context ratchet - architecture

Status: locally verified on 22.08.2026 at implementation commit `5c09b02`.
This is a non-live source-safety reduction for `TD-RR-010`; it changes no
production, Payment, Store, Cloud/VPS/DNS or pilot state.

## Request-result lifecycle boundaries

The owner-detail decline and acceptance actions both refresh the owning screen
before presenting their result popup. The body context retained across that
refresh could already belong to a disposed subtree even while the State itself
remained mounted. Each path now proves the exact body context after refresh and
before scheduling or presenting later UI.

The existing three-second product auto-close timers remain unchanged. Their
callbacks now check that same exact body context before resolving its root
navigator. Acceptance, decline, timeline, refresh, popup destinations and timer
durations are unchanged.

Three committed S4AO source contracts lock the two decision paths, their exact
context checks and the two existing product timers. Together with the preceding
owner-detail, analyzer and privacy contracts, the focused source selection
reports 29 passes. Ninety-six focused booking, acceptance, cancellation,
handover/return, checkout and notification Flutter tests retain the surrounding
behavior.

Because the owner-detail screen is source-bound by the release privacy
inventory, its exact source hash is updated together with this reviewed source
change. The privacy disclosure remains `draft`; no classification, approval or
release state changes.

## Analyzer ratchet and evidence

The exact analyzer snapshot moved only in the intended bucket:

- total `175 -> 171`;
- `use_build_context_synchronously` `53 -> 49`;
- `lib/screens/ongoing_owner_detail_screen.dart` context bucket `10 -> 6`; and
- fingerprint
  `499e95593296df94e8d4da41c46ef05f1bc1469b30e16efebf45d53ecb3b7a18`
  -> `ac39562a92090ae5a2f2ccbec5b89dc889c526142213b42963f98689ba203836`.

All other code and path/code counts remained unchanged. The complete clean
local metadata gate passed at `5c09b025009e43c88b8d66a5cbc831c40227fff4`
with the exact 171-diagnostic snapshot, 384 Flutter tests plus one documented
skip, Google-only, Web build/smoke and one direct 448-task Android debug build.

This is another downward step for `TD-RR-010`, not closure. Further reviewed
source ratchets to zero plus exact-commit CI remain mandatory. P0B remains
`HOLD` / `NO-GO`.
