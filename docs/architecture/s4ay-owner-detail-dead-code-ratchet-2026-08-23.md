# S4AY owner-detail dead-code ratchet - architecture

Status: locally verified on 23.08.2026 at implementation commit `a61cb4d`.
This is a non-live source and analyzer-debt reduction for `TD-RR-010`; it
changes no production, Payment, Store, Cloud/VPS/DNS or pilot state.

## Reachability boundary

S4AY removes seven analyzer-confirmed unreferenced owner-detail elements: the
write-only review-submission field and its redundant lookup, the unused Maps
search launcher, two local code calculators, the obsolete handover-photo
wrapper, the unreachable manual-handover notice and the duplicate QR overlay.
Removing the Maps launcher exposed its private toast helper as a transitive
orphan, which is removed in the same bounded package.

The active confirmed-location URL launcher remains. Pickup still issues the
server-bound confirmation challenge and passes its code and QR payload to the
handover stepper. Return still verifies the counterparty challenge, requires
the authenticated owner, active return flow, four return photos and any gallery
acknowledgement before the guarded transition. The stepper remains the single
active QR presentation owner. Cancellation and owner-to-renter review roles
remain unchanged.

The committed S4AY contract prevents every removed name from returning while
proving these active challenge, evidence, transition, QR and review boundaries.
It is permanently registered in the complete technical gate. The updated
legacy contracts now bind active method boundaries instead of relying on the
removed QR or Maps helpers.

The screen is bound by the privacy release inventory. Its exact source hash is
updated to
`f3672c4ff1bfe89f5d9baeb4e9b101eb1d5fb5a7db0f4071c2f13999c8c618e4`.
The disclosure remains draft and fail-closed; no classification, approval or
release state changes.

## Analyzer ratchet and evidence

The exact analyzer snapshot moved only in the intended screen bucket:

- total `55 -> 48`;
- `unused_element` `32 -> 26`;
- `unused_element_parameter` remains `17`;
- `unused_field` `6 -> 5`;
- the owner-detail analyzer bucket moves to zero; and
- fingerprint
  `22b02e5374806254f66a71c19e7d550452e815389419c95d31d76efbb65bdf9a`
  -> `7eaccc800db8e802b7f487fb836d26ba1a2b4d8fa60ccf1451387070ee3fcc36`.

The 154 focused source/analyzer/privacy/retention/data-integrity contracts,
exact analyzer, privacy, retention and G2 lifecycle validators and 125 focused
Flutter tests pass. The complete standard-parallel technical gate passed in
one execution at `a61cb4d`: 384 Flutter tests plus one documented skip, the
separate Google-only test, Web build and loopback smoke and one direct 448-task
Android debug build. S4AX exact CI run `32604489719` is green at documentation
commit `0c3ecad`.

No retry, reduced parallelism, timing delay, alternate temp root, cache purge,
network switch or smaller complete suite was used for the S4AY gate. The data
volume exposed 979 MiB before the run and 978 MiB after it. This warm-tree
observation does not close `TD-RR-012`; deterministic release-host capacity and
bounded-growth evidence remain required.

S4AY does not close `TD-RR-010`: 48 diagnostics in booking detail and message
thread still require reviewed downward ratchets to zero plus exact-commit CI.
P0B remains `HOLD` / `NO-GO`.
