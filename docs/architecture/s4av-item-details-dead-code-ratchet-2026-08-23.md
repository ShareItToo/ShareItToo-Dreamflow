# S4AV item-details dead-code ratchet - architecture

Status: locally verified on 23.08.2026 at implementation commit `4632aac`.
This is a non-live source and analyzer-debt reduction for `TD-RR-010`; it
changes no production, Payment, Store, Cloud/VPS/DNS or pilot state.

## Reachability boundary

S4AV removes the analyzer-confirmed unreferenced request duplicate and private
presentation helpers from `item_details_overlay.dart`. The removed sheet
`_sendRequest` path had no caller. The active page request and bottom-action
reservation paths retain availability checks, guest and owner guards, private
pilot checkout, request persistence and mounted root-navigator confirmation.

The removed delivery-chip and cancellation-section widgets were also
unreferenced. The active delivery-entitlement branches, no-delivery paragraph
and `_CancellationPolicyBookingCard` remain. Category resolution, profile and
Wishlist navigation, immutable quote handling, cancellation policy,
`needsReview` and audit behavior are unchanged.

The committed S4AV contract prevents all twelve removed helper names and the
duplicate sheet request from returning, while proving the active booking,
delivery and cancellation boundaries. The preceding reservation,
async-context, RadioGroup, transport and dead-tag contracts remain green and
the new contract is permanently registered in the complete technical gate.

Because the item-detail source is bound by the release privacy inventory, its
exact source hash is updated to
`04063d4a2029f5da201a4fb431b3fa655c46aa7541808fbce3f3a461f2b9a183`.
The privacy disclosure remains `draft`; no classification, approval or release
state changes.

## Analyzer ratchet and evidence

The exact analyzer snapshot moved only in the intended unused-code buckets:

- total `86 -> 71`;
- `unused_element` `56 -> 43`;
- `unused_element_parameter` `24 -> 22`;
- `unused_field` remains `6`;
- both item-overlay unused-code buckets move to zero; and
- fingerprint
  `d7a3e505c7549ebd2c9ab92b87ba05aba9171dc2341fb9770d3404239ea337bc`
  -> `7f6ed0bc3a558b236e102fa82dd30da133c3b1cbdf6bde81d5aeb3d52c11a980`.

The 77 focused source/analyzer/privacy contracts, exact analyzer, privacy,
retention and G2 lifecycle validators and 96 focused Flutter tests pass. The
complete standard-parallel technical gate passed in one execution at
`4632aac`: 384 Flutter tests plus one documented skip, the separate Google-only
test, Web build and loopback smoke and one direct 448-task Android debug build.

Before that accepted run, the first focused Flutter selection failed after 15
tests because the macOS data volume had only 238 MiB free. Only regenerable
Flutter and package-manager caches were removed; the same unchanged 96-test
command then passed. No retry, reduced parallelism, timing delay, alternate
temp root or smaller suite is accepted as release evidence. The capacity
incident remains open as `TD-RR-012` until deterministic release-host evidence
proves cache cleanup is not a standing prerequisite.

S4AV does not close `TD-RR-010`: 71 diagnostics in the remaining unused-code
categories still require reviewed downward ratchets to zero plus exact-commit
CI. P0B remains `HOLD` / `NO-GO`.
