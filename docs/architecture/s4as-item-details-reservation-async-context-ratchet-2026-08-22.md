# S4AS item-details reservation async-context ratchet - architecture

Status: locally verified on 22.08.2026 at implementation commit `be95424`.
This is a non-live source-safety and determinism reduction for `TD-RR-010`; it
changes no production, Payment, Store, Cloud/VPS/DNS or pilot state.

## Deterministic reservation completion

All three item-detail reservation entry points now prove their active UI owner
after asynchronous work and use the mounted root `NavigatorState` for the
post-request transition. The full-page path additionally rechecks its State
after clearing the saved range and delivery selection. The bottom action path
proves both its State and the exact supplied context after user, availability,
update and create operations. The confirmation helper proves its exact
navigator context after owner and request-range lookups.

The former three 120-millisecond waits between root-route removal and the
confirmation dialog are removed. The confirmation dialog's booking action also
opens the booking route directly through the still-mounted root navigator
instead of depending on an 80-millisecond wait after closing the dialog. Route
operations therefore depend on navigator lifecycle, not elapsed time.

Request persistence still completes before the post-send UI; a stored request
is not relabeled as failed if only the later UI flow fails. Guest restriction,
availability, edit, private-pilot checkout, saved-selection cleanup,
confirmation copy and booking destination behavior remain unchanged.

Four committed S4AS source contracts lock the State, exact-context and root
navigator boundaries and reject delays, timers or lint suppression throughout
the changed reservation completion paths. Together with the preceding booking
and owner-detail contracts, the focused source selection reports 49 passes.
Ninety-six focused booking, cancellation, checkout, confirmation, status and
notification Flutter tests retain the surrounding behavior.

Because the item-detail source is bound by the release privacy inventory, its
exact source hash is updated to
`4ee6c2eaea47a03f4470a4bb7c44ae5acbf0dd6e71303a34ded106521b6a250e`.
The privacy disclosure remains `draft`; no classification, approval or release
state changes.

## Analyzer ratchet and evidence

The exact analyzer snapshot moved only in the intended bucket:

- total `143 -> 132`;
- `use_build_context_synchronously` `21 -> 10`;
- `lib/widgets/item_details_overlay.dart` context bucket `21 -> 10`; and
- fingerprint
  `69d1e3e1fc149c4c1812c165f00f39bf3c2aa1935ebb45a44676c3bdae804831`
  -> `e31bffb605c07c467e020fd64f81aba3227f33dcaf216445e1d71e3e81a99cdc`.

All other code and path/code counts remained unchanged. The immediately
preceding application-source-identical tree passed the complete local metadata
gate with the exact 132-diagnostic snapshot, 384 Flutter tests plus one
documented skip, Google-only, Web build/smoke and one direct 448-task Android
debug build. After the S4AS contract was registered permanently, the clean-head
run at `be95424e83fdc0cf6878f837f224d92af16a1e78` emitted no further Flutter
output after 293 green results while the compiler process was idle. A terminal
interrupt was requested; the same command then continued through Google-only,
Web and the 448-task Android build and returned success. Because that output
control event occurred, this exact clean-head run is not accepted as
deterministic release evidence. No retry, reduced parallelism, timeout or
alternate test command was used; exact-commit GitHub CI remains required.

This package does not close `TD-RR-010`. The remaining ten item-overlay context
findings require a further reviewed source ratchet to zero plus exact-commit CI.
P0B remains `HOLD` / `NO-GO`.
