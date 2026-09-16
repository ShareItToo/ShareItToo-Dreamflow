# S4BA booking dead manual-pickup ratchet - architecture

Status: locally verified on 23.08.2026 at implementation commit `ebd0cf3`.
This is a non-live source and analyzer-debt reduction for `TD-RR-010`; it
changes no production, Payment, Store, Cloud/VPS/DNS or pilot state.

## Reachability and lifecycle boundary

S4BA removes the analyzer-confirmed unreachable direct pickup QR/manual-code
branch from renter booking detail, including its unused failure counter,
manual-entry state and controller, direct scanner and confirmation methods,
local photo/active-flow guards and their transitive status getter. None of
these elements had a UI or other runtime caller.

The active renter pickup remains one server-verified
`ReturnHandoverStepperSheet` flow. It keeps the owner-presenter pickup
challenge, authenticated renter verification, gallery evidence
acknowledgement and guarded pickup transition. The stepper still hard-gates
four role-bound evidence photos before codes. Active owner-side return QR and
manual-code controls remain present, renter-presenter bound and protected by
the verified return transition. The one-time handover banner remains loaded.

The committed S4BA contract prevents the removed chain from returning while
proving these active pickup, return and evidence boundaries. It is permanently
registered in the complete technical gate. No contract, quote, acceptance,
Payment, cancellation/refund, handover/return, damage, `needsReview`, audit or
later Business/Global behavior changes.

The screen is bound by the privacy release inventory. Its exact source hash is
updated to
`497e6a7169f803caf619673bd55a2228956881b4b6ab759a6a05fcb5d040dfd2`.
The disclosure remains draft and fail-closed; no classification, approval or
release state changes.

## Analyzer ratchet and evidence

The exact analyzer snapshot moved only in the intended booking-detail
element/field buckets:

- total `42 -> 33`;
- `unused_element` `20 -> 14`;
- `unused_element_parameter` remains `17`;
- `unused_field` `5 -> 2`;
- booking-detail `unused_element` `6 -> 0`;
- booking-detail `unused_field` `3 -> 0`; and
- fingerprint
  `6d103704bca501bbbea5b2faf8eea97d722dfa481e8d11a2536d82cb5c17276d`
  -> `808b5a846be35cf8e73a4be8f9e1906a63f125804cdab318c79f1e6dd6989b61`.

The 153 focused source/analyzer/privacy/retention/booking/legal contracts,
exact analyzer, privacy, retention and G2 lifecycle validators and 125 focused
Flutter tests pass. The complete standard-parallel technical gate passed in
one execution at `ebd0cf3`: 384 Flutter tests plus one documented skip, the
separate Google-only test, Web build and loopback smoke and one direct
448-task Android debug build. S4AZ exact CI run `32605753622` is green at
documentation commit `a33b944`.

No retry, reduced parallelism, timing delay, alternate temp root, cache purge,
network switch or smaller complete suite was used for the S4BA gate. The data
volume exposed 981 MiB before the run and 975 MiB after it. This warm-tree
observation does not close `TD-RR-012`; deterministic release-host capacity
and bounded-growth evidence remain required.

S4BA does not close `TD-RR-010`: 33 diagnostics in booking detail and message
thread still require reviewed downward ratchets to zero plus exact-commit CI.
P0B remains `HOLD` / `NO-GO`.
