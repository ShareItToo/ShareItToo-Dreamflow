# S4AP owner handover/maps async-context ratchet - architecture

Status: locally verified on 22.08.2026 at implementation commit `921d185`.
This is a non-live source-safety reduction for `TD-RR-010`; it changes no
production, Payment, Store, Cloud/VPS/DNS or pilot state.

## Final owner-detail lifecycle boundaries

The six remaining owner-detail findings covered four boundaries:

- pickup and return starters after asynchronous confirmation-time lookup;
- Google Maps failure feedback after URL-launch completion or failure;
- authenticated owner resolution before return-completion UI; and
- secure pickup-challenge issuance before opening the handover stepper.

Both starters and the pickup challenge now prove their exact caller context
after the relevant lookup. The Maps helper records the launch result and proves
its exact caller context before either failure-feedback path. Return completion
uses the owning State lifecycle because its `context` is the State context.
Time confirmation, Maps destination, challenge, stepper, completion and
`needsReview` behavior remain unchanged.

Five committed S4AP source contracts lock these boundaries and reject timing or
lint accommodations in the changed helpers. Together with the preceding
owner-detail, analyzer and privacy contracts, the focused source selection
reports 34 passes. Ninety-six focused booking, cancellation, handover/return,
checkout, confirmation and notification Flutter tests retain the surrounding
behavior.

Because the owner-detail screen is source-bound by the release privacy
inventory, its exact source hash is updated together with this reviewed source
change. The privacy disclosure remains `draft`; no classification, approval or
release state changes.

## Analyzer ratchet and evidence

The exact analyzer snapshot moved only in the intended bucket:

- total `171 -> 165`;
- `use_build_context_synchronously` `49 -> 43`;
- `lib/screens/ongoing_owner_detail_screen.dart` context bucket `6 -> 0`; and
- fingerprint
  `ac39562a92090ae5a2f2ccbec5b89dc889c526142213b42963f98689ba203836`
  -> `0e3a17c307ad7158bf910a2e2c96a574bdbda8fcf0b9682935c1b3007322feca`.

All other code and path/code counts remained unchanged. The complete clean
local metadata gate passed at `921d18510f4fb328fd60856060825358b4f678b9`
with the exact 165-diagnostic snapshot, 384 Flutter tests plus one documented
skip, Google-only, Web build/smoke and one direct 448-task Android debug build.

This clears the owner-detail context bucket but does not close `TD-RR-010`.
Further reviewed source ratchets to zero plus exact-commit CI remain mandatory.
P0B remains `HOLD` / `NO-GO`.
