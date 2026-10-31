# RW1 reduced Wave-0 accessibility and resilience matrix

Status: **VERIFIED — REGRESSION AND CODEQL GREEN**

## Decision

RW0 proved the reduced non-binding Stage-A journey at ordinary test geometry.
RW1 retains that same product boundary while testing the participant-facing
surfaces at a 320 dp viewport and 200 percent text. This is the highest-value
independent launch-hardening package because hidden overflows can make a
technically correct journey unusable without changing any backend or live
gate.

## Exact matrix

| Surface | Stress | Retained proof |
| --- | --- | --- |
| Listing options | Compact viewport, 200 percent text, long option sets | Primary and feedback dialogs scroll; close and every option remain reachable |
| Keyboard and routes | Three Tab traversals, route dismissal and recreation | Focus advances across multiple nodes; reopening and closing leaves no lifecycle error |
| Search and Gemerkt | Compact three-column result plus selection popup | Named 48 dp save action and the complete Merkliste selection remain operable |
| Rapid interaction | Two immediate save activations | Exactly one selection route and one final local assignment |
| Listing form | Exact Stage-A/Blue-Ocean profile, compact viewport and 200 percent text | Category, price, discount, policy, declaration and publication controls do not overflow |
| Mietkorb | Local non-reserving item, compact viewport and 200 percent text | Unified scroll, stacked actions and all three 48 dp item actions remain reachable |

## Red-first findings closed

1. The two listing-option dialogs used unbounded non-scrollable columns and the
   primary dialog overflowed by 1,061 pixels. Both now use a safe-height
   scroll panel; option rows expose an explicit tap action and at least 48 dp.
2. The shared SIT custom popup overflowed by 1,790 pixels during the search-to-
   Merkliste flow. Glass cards now scroll only when their content exceeds the
   available safe area.
3. The compact Mietkorb overflowed by 938 pixels horizontally and 818 pixels
   vertically. Compact/large-text layouts now use one outer scroll surface and
   stack project/synchronization actions without changing cart state.
4. The exact listing form exposed five compact large-text overflows in the
   subcategory selector, price title, discount control, SIT tip and
   cancellation title. These controls now expand, wrap or stack while
   retaining their original facts and actions.
5. Listing-option rows previously relied on implicit semantics and could be
   shorter than the 48 dp interaction minimum. Their accessible name, button
   role, tap action and minimum target are now explicit.

## Boundaries

RW1 uses synthetic local data only. It does not build or install a candidate,
touch the Pixel, activate a pilot, contact a tester/provider, call external AI,
change Payment, Firebase/Play, Production, VPS, DNS or Cloud, merge PR #7,
inspect credentials or rewrite history. Existing corrupt-store and restart
proofs from RW0 remain part of the combined regression rather than being
reinterpreted as live offline certification.

The complete candidate-rollover technical regression passed unchanged after
the fixes, including the full Flutter suite, the exact RW0 and RW1 profiles,
Web/Wasm smoke, Android debug assembly and the repository resource guard.
Implementation commit `eef58764ec9057748c2124689a40e9d96553acc6`
identified one independent clean-checkout validator defect at the UTC date
boundary. The clean execution itself passed; only the validator's hard-coded
historical date rejected the new valid execution date. Correction commit
`13bf29bce7911bf95e339ff61744c678aeafdce4` accepts real ISO calendar dates for
execution evidence while retaining the historical artifact's exact date.
At that exact correction head, GitHub Regression `32795007748` and CodeQL
`32795007746` passed, including the unchanged clean-checkout proof, with zero
open code-scanning alerts. No retry, timing relaxation or local-only workaround
is part of the retained path.
