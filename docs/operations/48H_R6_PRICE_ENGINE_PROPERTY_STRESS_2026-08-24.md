# 48H R6 regional Price Engine property and stress testing

Status: **VERIFIED — TARGETED, POSTGRESQL, FULL REGRESSION AND CODEQL GREEN**

R6 independently tested `SIT_REGIONAL_PRICE_ENGINE_V2` against the complete
Goal matrix. The retained deterministic suite covers all 90 category/value-band/
condition combinations, 1,818 integer rounding cases, all geography levels,
all source classes, HIGH/MEDIUM/LOW confidence, weighted median/MAD, effective
sample size and shrinkage, the three owner options, every duration boundary,
V5.2 fee ordering, demand thresholds/clamps, malformed input, synthetic-zero
learning and exact replay.

## Findings and permanent corrections

The red-first matrix reproduced three correctness gaps. First, 4,999 weak,
distant commercial references could collectively move the weighted median away
from one stronger, near completed-rental observation. R6 now calculates the
Pareto frontier across source trust, geography, item similarity and freshness.
Only observations that are no worse in every dimension and stronger in at
least one dimension dominate another cohort. The aggregate influence of all
dominated rows is capped below the frontier, while incomparable tradeoffs stay
independent.

Second, the documented 0.90 demand clamp was mathematically unreachable. The
versioned integer formula is now neutral at two authentic requests per active
listing and reaches the exact 0.90/1.10 bounds. It remains neutral until the
20-request/10-listing threshold and for all synthetic activity.

Third, the pure recommendation function silently ignored unknown input fields.
It now rejects a closed-schema request, so a client cannot smuggle an
authoritative price field past server recomputation. Owner override remains
allowed only as the explicit owner-selected price and still requires owner
confirmation.

The first exact GitHub Backend run then exposed one historical N7 fixture that
still expected the former unreachable 0.95 low-ratio result. The fixture is now
permanently rebound to the reachable R6 lower clamp of 0.90 and is source-bound
by the R6 validator. No timing, retry or CI-only accommodation was added.

Because the output algorithm changed, the engine version is
`R6-2026-08-24.1`. Additive migration 069 preserves historical N5 snapshots,
accepts the new version and refuses rollback when an R6 snapshot exists. It
does not rewrite or delete price evidence.

## Reproducible verification

The fixed seed `0x5a17c9e3` executed 2,000 cases containing 16,651 synthetic
observations twice with digest
`3e9fb6e3cd65b9efb8a6197de60c9b62812abfc9a93ca86ef3ebc1ba59462ed7`.
All outputs remained within category bounds, owner options stayed ordered,
synthetic learning stayed false, and no provider, real-money or production
operation existed. This is a deterministic domain stress result, not a
production-capacity or performance certification.

Twenty-eight engine/property tests and seven historical N5 validator tests
pass. A fresh repository-owned PostgreSQL 16 cluster applied all 69 migrations
twice, persisted the Blue-Ocean review with the new engine version and returned
`passed-and-cleaned`. The complete candidate-rollover technical regression also
passes in CI metadata mode, including the analyzer-zero gate, Flutter tests,
Web/Wasm build and loopback smoke, and the Android debug build. Exact GitHub
Regression `32746280246` passed at verified head
`f4dd649f74c0420faf0117afbd844563e91effda`, including PostgreSQL job
`97492755326`, Backend job `97492755400` and Flutter job `97492754898`.
CodeQL workflow `32746280233` and Advanced Security check `97493148349` also
passed with zero new code-scanning alerts. The API image was built but not
published; parallel stability and signed-candidate creation were not requested.
The separately visible GitGuardian failure is the documented pre-existing
250-commit PR-history finding, not an R6 regression; no credential detail was
inspected.

## Boundary and rollback

No real market observation, human identity, paid model, external AI provider,
Payment, Store, Cloud, Firebase, VPS, DNS, Production, pilot, public release,
PR merge or history rewrite was used. Rollback is the R6 down migration only
while no R6 snapshot exists; otherwise it fails closed. No timing, rate-limit,
parallelism or toolchain workaround was introduced. The next package after
full R6 closure is `R7`.
