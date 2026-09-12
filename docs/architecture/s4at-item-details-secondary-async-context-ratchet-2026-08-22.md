# S4AT item-details secondary async-context ratchet - architecture

Status: locally verified on 22.08.2026 at implementation commit `1a41bc4`.
This is a non-live source-lifecycle reduction for `TD-RR-010`; it changes no
production, Payment, Store, Cloud/VPS/DNS or pilot state.

## Final item-details context boundaries

The item-details sheet now rechecks its owning State after failed sharing,
availability lookup, calendar navigation, Wishlist dialogs and Wishlist writes
before it uses context, widget data or local State. The full-page share failure
path applies the same State boundary.

The listing overflow callback proves its exact supplied `BuildContext` after
the menu, clipboard write, current-user lookup, support flow, support-thread
creation and system-message write. The express countdown proves its State
after feedback before route removal, while the express fallback action proves
the exact callback context before closing its sheet.

Five committed S4AT contracts lock these boundaries, permanently register the
package in the complete technical gate and reject lint suppression, delays and
timers in the changed paths. Together with the preceding item-detail,
booking-detail and owner-detail contracts, the focused source selection reports
54 passes. Ninety-six focused booking, cancellation, checkout, confirmation,
status and notification Flutter tests retain surrounding behavior.

Because the item-detail source is bound by the release privacy inventory, its
exact source hash is updated to
`0f05c4a9e318f138d03d0cdcbf9870e01ff09915f70711e650cd14655cd086d8`.
The privacy disclosure remains `draft`; no classification, approval or release
state changes.

## Analyzer ratchet and evidence

The exact analyzer snapshot moved only in the intended bucket:

- total `132 -> 122`;
- `use_build_context_synchronously` `10 -> 0` and removal of that code bucket;
- `lib/widgets/item_details_overlay.dart` context bucket `10 -> 0`; and
- fingerprint
  `e31bffb605c07c467e020fd64f81aba3227f33dcaf216445e1d71e3e81a99cdc`
  -> `973a7abbc7427743d4b4073590aa0dfe3dfca12fd7edb938f457a5231060a96d`.

All other code and path/code counts remained unchanged. The 54 focused
source/analyzer/privacy contracts, privacy and retention validators, exact
analyzer validator and 96 focused Flutter tests pass at `1a41bc4`.

The exact clean-head technical gate used standard Flutter parallelism. It
reached 293 green Flutter results and then retained only an idle Flutter tool
and compiler, with no test worker and no further output for more than six
minutes. The process was terminated and the run is correctly recorded as
failed, not as release evidence. A diagnostic-only serial execution then
passed all 384 Flutter tests plus one documented skip in one uninterrupted
run. That diagnostic narrows the local failure to the parallel
compiler/worker path but is neither a retry acceptance nor a substitute gate.
No source, lint threshold or permanent command was changed to accommodate it.

The immediately preceding S4AS documentation head passed exact GitHub CI run
`32600284183`. Exact-commit S4AT CI and the retained default-parallel stress
evidence remain required under `TD-RR-003`.

S4AT clears the complete `use_build_context_synchronously` source debt, but
does not close `TD-RR-010`: 122 diagnostics in the remaining reviewed analyzer
categories still require downward ratchets to zero plus exact-commit CI. P0B
remains `HOLD` / `NO-GO`.
