# S4AX DataService dead demo-code ratchet - architecture

Status: locally verified on 23.08.2026 at implementation commit `0fcf3dd`.
This is a non-live source and analyzer-debt reduction for `TD-RR-010`; it
changes no production, Payment, Store, Cloud/VPS/DNS or pilot state.

## Reachability boundary

S4AX removes four analyzer-confirmed unreferenced DataService demo remnants:
the old starter-notification seed, the empty demo-request initializer, the
standalone demo-message-thread builder and the unused showcase category
resolver. Its now-unreferenced notification prefix is removed with it.

The active debug-only QA fixture path remains separately guarded by
`kDebugMode`, the explicit QA switch and the exact current user. Showcase reset
still loads categories before building its five items, so the existing
initialization side effect remains. Real request persistence, express timeout
sweeps, participant-bound threads and canonical-receipt support threads are
unchanged.

The committed S4AX contract prevents all removed demo paths from returning
while proving the active QA, category initialization, request, timeout and
support boundaries. It is permanently registered in the complete technical
gate.

Because DataService is bound by both release inventories, its exact source
hash is updated to
`8685e197925feb985816ced1c4bfc5828bcbe1088071187dc801f7ce5842e954`.
The privacy disclosure and retention/deletion readiness remain draft; no
classification, approval or release state changes.

## Analyzer ratchet and evidence

The exact analyzer snapshot moved only in the intended unused-code bucket:

- total `59 -> 55`;
- `unused_element` `36 -> 32`;
- `unused_element_parameter` remains `17`;
- `unused_field` remains `6`;
- the DataService analyzer bucket moves to zero; and
- fingerprint
  `9b3a4755f7e63848ba50a78a357115aa60d3cea8c8dee668113b2e33b1ccbe59`
  -> `22b02e5374806254f66a71c19e7d550452e815389419c95d31d76efbb65bdf9a`.

The 98 focused source/analyzer/privacy/retention/data-integrity contracts,
exact analyzer, privacy, retention and G2 lifecycle validators and 125 focused
Flutter tests pass. The complete standard-parallel technical gate passed in
one execution at `0fcf3dd`: 384 Flutter tests plus one documented skip, the
separate Google-only test, Web build and loopback smoke and one direct 448-task
Android debug build. S4AW exact CI run `32603729530` is green at documentation
commit `3fba545`.

No retry, reduced parallelism, timing delay, alternate temp root, cache purge or
smaller suite was used for the S4AX gate. The data volume exposed 980 MiB before
the run and 984 MiB after it. This warm-tree observation does not close
`TD-RR-012`; deterministic release-host capacity and bounded-growth evidence
remain required.

S4AX does not close `TD-RR-010`: 55 diagnostics in the remaining screen-only
unused-code categories still require reviewed downward ratchets to zero plus
exact-commit CI. P0B remains `HOLD` / `NO-GO`.
