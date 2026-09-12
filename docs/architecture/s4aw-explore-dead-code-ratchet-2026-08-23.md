# S4AW Explore dead-code ratchet - architecture

Status: locally verified on 23.08.2026 at implementation commit `3df03c0`.
This is a non-live source and analyzer-debt reduction for `TD-RR-010`; it
changes no production, Payment, Store, Cloud/VPS/DNS or pilot state.

## Reachability boundary

S4AW removes analyzer-confirmed unreferenced helpers, never-started timer
machinery and default-only presentation parameters from `explore_screen.dart`.
The active `_HoverTileState` and `_SquareTitleOnlyCardState` long-press timers
remain. Search, category-header filtering, item details, listing options,
Wishlist/favorite behavior and the G5A supply-enrichment boundary are
unchanged.

The committed S4AW contract prevents the removed helpers, timer members and
unreachable parameter branches from returning while proving the active
long-press owners and Explore destinations. The earlier listing-card dead
getter and Explore async-context contracts remain green, and the new contract
is permanently registered in the complete technical gate.

Because the Explore source is bound by both release inventories, its exact
source hash is updated to
`96f57d15e7c6a1665492e9faba2a07f43e8996200103a9f4712fc66dc0bfd1dd`.
The privacy disclosure and retention/deletion readiness remain draft; no
classification, approval or release state changes.

## Analyzer ratchet and evidence

The exact analyzer snapshot moved only in the intended unused-code buckets:

- total `71 -> 59`;
- `unused_element` `43 -> 36`;
- `unused_element_parameter` `22 -> 17`;
- `unused_field` remains `6`;
- both Explore unused-code buckets move to zero; and
- fingerprint
  `7f6ed0bc3a558b236e102fa82dd30da133c3b1cbdf6bde81d5aeb3d52c11a980`
  -> `9b3a4755f7e63848ba50a78a357115aa60d3cea8c8dee668113b2e33b1ccbe59`.

The 79 focused source/analyzer/privacy/retention contracts, exact analyzer,
privacy, retention and G2 lifecycle validators and 125 focused Flutter tests
pass. The complete standard-parallel technical gate passed in one execution at
`3df03c0`: 384 Flutter tests plus one documented skip, the separate Google-only
test, Web build and loopback smoke and one direct 448-task Android debug build.
S4AV exact CI run `32602922839` is green at documentation commit `9593cd7`.

No retry, reduced parallelism, timing delay, alternate temp root, cache purge or
smaller suite was used for the S4AW gate. The data volume exposed 999 MiB before
the run and 994 MiB after it. This successful warm-tree observation does not
close `TD-RR-012`; release-host capacity and bounded-growth evidence remain
required so manual cleanup cannot become a standing prerequisite.

S4AW does not close `TD-RR-010`: 59 diagnostics in the remaining unused-code
categories still require reviewed downward ratchets to zero plus exact-commit
CI. P0B remains `HOLD` / `NO-GO`.
