# S4AZ booking presentation-helper dead-code ratchet - architecture

Status: locally verified on 23.08.2026 at implementation commit `c283b59`.
This is a non-live source and analyzer-debt reduction for `TD-RR-010`; it
changes no production, Payment, Store, Cloud/VPS/DNS or pilot state.

## Reachability boundary

S4AZ removes six analyzer-confirmed unreferenced booking-detail helpers: the
dead phone action, obsolete ICS calendar builder, unused legacy handover-code
calculator, duplicate unused deadline formatters in the screen and
cancellation card and an unused completion-card text closure. Removing the ICS
builder also removes its now-unused `dart:convert` import.

Both active Google Maps search and directions launchers remain. The pickup code
still derives from the booking-bound confirmation helper, while secure
challenge issue and verification remain server-backed. The visible cancellation
card still uses `CancellationPolicyText`, and the completion summary still
renders status, review hold and refund facts through `_FactRow`.

The committed S4AZ contract prevents every removed helper from returning while
proving these active map, challenge, cancellation and completion boundaries.
It is permanently registered in the complete technical gate.

The screen is bound by the privacy release inventory. Its exact source hash is
updated to
`0aa3ed1acf04ea30b230211f8e97271c75be2748e7f060c34bd3f8d489a85920`.
The disclosure remains draft and fail-closed; no classification, approval or
release state changes.

## Analyzer ratchet and evidence

The exact analyzer snapshot moved only in the intended screen bucket:

- total `48 -> 42`;
- `unused_element` `26 -> 20`;
- `unused_element_parameter` remains `17`;
- `unused_field` remains `5`;
- booking-detail `unused_element` `12 -> 6`; and
- fingerprint
  `7eaccc800db8e802b7f487fb836d26ba1a2b4d8fa60ccf1451387070ee3fcc36`
  -> `6d103704bca501bbbea5b2faf8eea97d722dfa481e8d11a2536d82cb5c17276d`.

The 144 focused source/analyzer/privacy/retention/booking/legal contracts,
exact analyzer, privacy, retention and G2 lifecycle validators and 125 focused
Flutter tests pass. The complete standard-parallel technical gate passed in
one execution at `c283b59`: 384 Flutter tests plus one documented skip, the
separate Google-only test, Web build and loopback smoke and one direct 448-task
Android debug build. S4AY exact CI run `32605179796` is green at documentation
commit `dd36af7`.

No retry, reduced parallelism, timing delay, alternate temp root, cache purge,
network switch or smaller complete suite was used for the S4AZ gate. The data
volume exposed 972 MiB before the run and 963 MiB after it. This warm-tree
observation does not close `TD-RR-012`; deterministic release-host capacity and
bounded-growth evidence remain required.

S4AZ does not close `TD-RR-010`: 42 diagnostics in booking detail and message
thread still require reviewed downward ratchets to zero plus exact-commit CI.
P0B remains `HOLD` / `NO-GO`.
