# S4BC message-thread dead-helper ratchet - architecture

Status: locally verified on 23.08.2026 at implementation commit `7cde3ea`.
This is a non-live source and analyzer-debt reduction for `TD-RR-010`; it
changes no production, Payment, Store, Cloud/VPS/DNS or pilot state.

## Reachability and behavior boundary

S4BC removes six private message-thread helpers with no runtime caller: the
obsolete enable-and-pick translation wrapper, its newly exposed transitive
language-picker orphan, unused role and saved-location labels, an unused
response-time estimator and an unused local date formatter. The response-time
helper could only have produced presentation text and never provided a server
fact, policy input or audit value.

The active translation menu and persisted settings remain intact. Active
handover/return location intent, saved-location matching, exact-address
protection, time proposal and confirmation dialogs, `needsReview` hold and
canonical support route also remain intact. The committed S4BC contract
prevents the dead helpers from returning while permanently protecting those
active boundaries in the complete technical gate.

No contract, quote, acceptance, Payment, cancellation/refund,
handover/return, damage, `needsReview`, audit or later Business/Global
behavior changes. The message-thread source remains bound by the privacy
release inventory at exact hash
`fb2959326856de1c57df83be9cac3245e8a72f7bef547308fb72c93da52cd120`.
The disclosure remains draft and fail-closed; no classification, approval or
release state changes.

## Analyzer ratchet and evidence

The exact analyzer snapshot moves only in the intended message-thread element
bucket:

- total `25 -> 20`;
- `unused_element` `14 -> 9`;
- `unused_element_parameter` remains `9`;
- `unused_field` remains `2`; and
- fingerprint
  `5df3477f297457e12680d8e9b3bdc7d12358eeb01782cae11408639a59c3e4a1`
  -> `d1122c6479986f9b5f7ae13e0267fce06b519aedf313cb44eb63dc1cb95cb917`.

The six removed declarations yield five net diagnostics because the language
picker was reachable only through the removed wrapper and became visible as a
transitive orphan during the same analyzer pass.

One hundred focused source/analyzer/privacy/retention/data-integrity contracts,
42 focused Flutter tests and all exact analyzer, privacy, retention and G2
lifecycle validators pass. The complete standard-parallel technical gate
passed in one execution at `7cde3ea`: 384 Flutter tests plus one documented
skip, the separate Google-only test, Web build and loopback smoke and one
direct 448-task Android debug build. S4BB exact CI run `32607027388` is green
at documentation commit `9fb93dc`.

No retry, reduced parallelism, timing delay, alternate temp root, cache purge,
network switch, Pixel dependency or smaller complete suite was used. The data
volume exposed 1139 MiB before and 1136 MiB after the complete gate. This
warm-tree observation does not close `TD-RR-012`; deterministic release-host
capacity and bounded-growth evidence remain required.

S4BC does not close `TD-RR-010`: the remaining 20 message-thread diagnostics
still require reviewed downward ratchets to zero plus exact-commit CI. P0B
remains `HOLD` / `NO-GO`.
