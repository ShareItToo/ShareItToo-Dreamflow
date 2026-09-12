# WP07 — Listing-AI price/catalog contract closure

Status: **COMPLETE** for the bounded private-pilot draft and review path.
External Staging Listing AI remains disabled. This package did not deploy,
publish a listing, touch a device or change Store, payment, provider, Firebase,
cloud, VPS, DNS or production state.

## Reproduced defect and decision

The WP06 follow-up reproduced two distinct failures in the existing broad
category routing:

- `cat3/Kameras` was accepted by the private catalog but had no category-level
  price route, so review failed with a scope error.
- `cat20/Präsentation` was routed to `ladders_hand_tools`, creating a
  semantically unrelated price recommendation.

No reliable market evidence exists in the approved SIT material for inventing
the missing mappings. WP07 therefore binds recommendations only to exact
category/subcategory pairs already supported by an existing deterministic
regional rule. All other allowed private-pilot pairs remain usable through an
explicit owner-entered daily price and show that SIT has no recommendation.
Pairs outside the private-pilot catalog fail closed.

Across the current catalog, all 79 allowed pairs are covered explicitly: 19
pairs have an exact deterministic rule and 60 use the truthful manual-owner
path. The manual path cannot publish without a positive price and explicit
owner price confirmation, never claims a recommendation, never creates a
regional-price snapshot and still requires the separate explicit final
publication action. Price evidence binds the WP07 rule version, price mode,
exact catalog pair and complete price input.

Implementation commit:
`3cbe5a3a3065f07a01ee4b463bb7f017ba248b72`.

## Verification

- Focused workflow, persistence and Android-wiring suite: 30/30 passed.
- A transient real PostgreSQL integration passed for the append-only review and
  snapshot behavior; the maintained deterministic store test retains that
  contract without changing the historical monolithic PostgreSQL ratchet.
- Complete maintained local technical regression passed, including 2,245 tool
  tests, Backend, Flutter profiles, analyzer with zero issues, Web/Wasm,
  loopback smoke and Android minSdk 24 build.
- Exact clean-checkout R10 at the implementation commit passed. The complete
  technical gate took 689 seconds and the forced second Android build 44
  seconds. Both 231,332,383-byte APKs were byte-identical with SHA-256
  `d9bd9e1590110875b99708dd16d06ab7e73a309909b337b28907dcd814d851ba`;
  all 794 extracted entries matched. The checkout started and ended clean,
  inventories were unchanged and temporary output was removed.
- GitHub Regression
  `https://github.com/walidwalidchraibi-dot/ShareItToo-Dreamflow/actions/runs/33943848415`
  passed, including the independent exact-head R10 job.
- GitHub CodeQL
  `https://github.com/walidwalidchraibi-dot/ShareItToo-Dreamflow/actions/runs/33943848391`
  passed; open code-scanning alerts: 0.
- PR #7 remains Draft, open, mergeable and unmerged.

The sanitized R10 execution report is
`docs/evidence/release-readiness/wp07-blue-ocean-price-routing-clean-20260905.json`;
SHA-256
`dee6d3fed7fbb1f9ed077c6954f1a0985c1489e13ccaca79fd1105630367f77c`.

## Ratchet refresh

The Android review copy changed deliberately so it no longer promises a price
recommendation for every catalog pair. That screen is intentionally included
in the privacy, retention, provider-readiness and RW principal/epoch source
inventories. Their failures were source-drift detections, not product
regressions.

Only current-source inventories and the direct privacy/retention/provider hash
chain were refreshed. Historical closure heads, historical exact-boundary
ratchets, live gates and their claims were preserved. All dedicated RW0,
RW4–RW10 and RW12–RW20 validators, privacy, retention and active-provider
readiness validators passed, followed by the 2,245-test tool suite and both
complete regressions. This keeps the ratchet deterministic rather than adding
a bypass or a permanent local workaround.

## Remaining boundaries

This proves price-path truthfulness and catalog coverage, not market accuracy
for the 60 manual-price pairs. The external Staging Listing-AI provider remains
disabled, `codex_local_dev` remains developer-only, V5.2 remains draft-blocked,
and Google sign-in and Stripe sandbox/test-money acceptance remain separate
provider-specific packages. The frozen Pixel candidate `1.0.0+2026090503` at
`96b97b55983111d9e0ae8d8fcc91e9e241a2cb6f` is unchanged and does not contain
WP07.

Sanitized closure evidence:
`docs/evidence/release-readiness/wp07-listing-ai-price-catalog-contract-20260905.json`.
