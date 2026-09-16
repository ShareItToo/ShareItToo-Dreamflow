# S4BB booking fixed-default parameter ratchet - architecture

Status: locally verified on 23.08.2026 at implementation commit `efa5a8d`.
This is a non-live source and analyzer-debt reduction for `TD-RR-010`; it
changes no production, Payment, Store, Cloud/VPS/DNS or pilot state.

## Fixed behavior boundary

S4BB removes seven optional `_ModernDetailsCard` variants that no call site
ever selected and the never-selected `_CancellationPolicyCard.initiallyOpen`
variant. The modern card now represents the former defaults directly: when its
location section is enabled, both pickup and return use the supplied location
and retain Maps and navigation actions. The cancellation policy remains
collapsed initially and can still be expanded and collapsed by the user.

Both active booking-detail call sites continue to set `showLocations: false`.
They render address truth and Maps separately through the existing protected
pickup/return privacy surfaces, including approximate maps and the
server-controlled exact-address reveal. Central `CancellationPolicyText`
remains the only source for the visible cancellation header and body.

The committed S4BB contract prevents all eight never-selected defaults from
returning while proving the location and cancellation semantics above. It is
permanently registered in the complete technical gate. No contract, quote,
acceptance, Payment, cancellation/refund, handover/return, damage,
`needsReview`, audit or later Business/Global behavior changes.

The screen is bound by the privacy release inventory. Its exact source hash is
updated to
`3be64b5afea855255b290aef2edb8687f4e739de8e6e99b35669b24b2a302f25`.
The disclosure remains draft and fail-closed; no classification, approval or
release state changes.

## Analyzer ratchet and evidence

The exact analyzer snapshot moved only in the intended booking-detail
parameter bucket:

- total `33 -> 25`;
- `unused_element` remains `14`;
- `unused_element_parameter` `17 -> 9`;
- `unused_field` remains `2`;
- booking-detail `unused_element_parameter` `8 -> 0`; and
- fingerprint
  `808b5a846be35cf8e73a4be8f9e1906a63f125804cdab318c79f1e6dd6989b61`
  -> `5df3477f297457e12680d8e9b3bdc7d12358eeb01782cae11408639a59c3e4a1`.

Booking detail now has zero analyzer diagnostics. All remaining 25 findings are
confined to message thread.

The 158 focused source/analyzer/privacy/retention/booking/legal contracts,
exact analyzer, privacy, retention and G2 lifecycle validators and 125 focused
Flutter tests pass. The complete standard-parallel technical gate passed in
one execution at `efa5a8d`: 384 Flutter tests plus one documented skip, the
separate Google-only test, Web build and loopback smoke and one direct
448-task Android debug build. S4BA exact CI run `32606427366` is green at
documentation commit `6bd223f`.

No retry, reduced parallelism, timing delay, alternate temp root, cache purge,
network switch or smaller complete suite was used for the S4BB gate. The data
volume exposed 977 MiB before the run and 1147 MiB after it. This warm-tree
observation does not close `TD-RR-012`; deterministic release-host capacity
and bounded-growth evidence remain required.

S4BB does not close `TD-RR-010`: the remaining 25 message-thread diagnostics
still require reviewed downward ratchets to zero plus exact-commit CI. P0B
remains `HOLD` / `NO-GO`.
