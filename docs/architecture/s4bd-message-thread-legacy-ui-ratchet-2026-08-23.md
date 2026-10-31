# S4BD message-thread legacy-UI ratchet - architecture

Status: locally verified on 23.08.2026 at implementation commit `7c93081`.
This is a non-live source and analyzer-debt reduction for `TD-RR-010`; it
changes no production, Payment, Store, Cloud/VPS/DNS or pilot state.

## Reachability and active-composer boundary

S4BD removes the complete analyzer-confirmed unreachable message-thread
Legacy-UI tree: nine unused widgets and two helper widgets reachable only from
that dead tree. This includes obsolete metadata/info/trust surfaces, two old
action-bar variants, the old composer and icon button, the old time-agreement
buttons and an obsolete inline icon. No removed class had a runtime call site.

The active `_TransactionComposer`, `_CombinedActionRow` and `_GlassInputBar`
remain unchanged. They retain the booking-state and confirmed-time gates,
handover/return time proposals, primary/secondary booking actions, confirmed
handover countdown and text, camera, selected-image, location and time actions.
The compact booking summary, status badge and active interaction primitives
also remain. A permanent source contract protects these boundaries and rejects
reintroduction of the removed tree.

No contract, quote, acceptance, Payment, cancellation/refund,
handover/return, damage, `needsReview`, audit or later Business/Global
behavior changes. The message-thread source remains bound by the privacy
release inventory at exact hash
`4a4710f75b73195c1fe1c8521e1d743db586442ade6f56861f53aa12e731ee32`.
The disclosure remains draft and fail-closed; no classification, approval or
release state changes.

## Analyzer ratchet and evidence

The exact analyzer snapshot moves only in the intended message-thread element
and element-parameter buckets:

- total `20 -> 3`;
- `unused_element` `9 -> 0`;
- `unused_element_parameter` `9 -> 1`;
- `unused_field` remains `2`; and
- fingerprint
  `d1122c6479986f9b5f7ae13e0267fce06b519aedf313cb44eb63dc1cb95cb917`
  -> `e68b4a8268abd0c878ad30d07122b584e4e92a0cc8f4621c83267f17e07133cf`.

One hundred five focused source/analyzer/privacy/retention/data-integrity
contracts, 42 focused Flutter tests and all exact analyzer, privacy, retention
and G2 lifecycle validators pass. The complete standard-parallel technical
gate passed in one execution at `7c93081`: 384 Flutter tests plus one
documented skip, the separate Google-only test, Web build and loopback smoke
and one direct 448-task Android debug build. S4BC exact CI run `32607663394`
is green at documentation commit `e420b04`.

No retry, reduced parallelism, timing delay, alternate temp root, cache purge,
network switch, Pixel dependency or smaller complete suite was used. The data
volume exposed 1136 MiB before and 1143 MiB after the complete gate. This
warm-tree observation does not close `TD-RR-012`; deterministic release-host
capacity and bounded-growth evidence remain required.

S4BD does not close `TD-RR-010`: two unused animation values and one
never-selected location-map loading variant remain for the final reviewed
ratchet plus exact-commit CI. P0B remains `HOLD` / `NO-GO`.
