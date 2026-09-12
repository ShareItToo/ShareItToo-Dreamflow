# WP53 — Listing report runtime closure

Status: **COMPLETE AND VALIDATED LOCALLY AND ON GITHUB**.

## Frozen scope

- Worktree: `/Users/walidchraibi/Worktrees/SIT-master-workflow-20260808`.
- Branch: `codex/master-workflow-20260808`.
- WP52 closure HEAD: `1afdceddd5623e067849001348ab6acbc96d8096`.
- WP53 implementation HEAD: `e8bb56e78f999935e25093efaec9bf88a561f4dd`.

WP53 closes one reachable product gap found by the current-candidate portfolio
audit: the listing-options action `Melden` displayed a placeholder even though
the authenticated Backend already supports exact `targetType=listing` reports.
No Backend schema, API route, deployment or external provider was changed.

## Implemented contract

- The listing action opens the real report screen with the exact listing ID,
  title and owner ID.
- The remote request uses the existing authenticated reporting endpoint with
  `targetType=listing` and the exact listing ID as `targetId`.
- Local QA storage retains the same target type and target ID instead of
  collapsing the report into a user-only record.
- Listing reports expose only listing-relevant reasons; harassment and handover
  remain user/transaction report paths.
- Principal and epoch are captured before the first asynchronous action and
  rechecked before the remote call and after acceptance. A delayed Account-A
  result cannot be rendered as Account-B truth.
- Structured rejection, transport-unknown, accepted-remote/local-failure and
  principal-changed outcomes retain the existing typed safety semantics. The UI
  does not merge them through a generic catch.

## Evidence ratchets

The runtime change legitimately changed the source hashes embedded in privacy,
retention and historical RW evidence. The privacy and retention documents were
not semantically changed: only exact source inventory hashes moved. Their new
hashes required the active infrastructure/mail hold evidence and the dependent
RW0–RW20 evidence chain to be refreshed in topological order.

All affected validators were updated to expect the new cryptographic bindings.
No expected behavior, allowed scope, gate, threshold, provider decision,
retention decision or historical result was weakened. The first complete run
correctly failed on stale source bindings; after exact convergence every
affected validator and all repository tool tests passed.

## Verification

- Focused analyzer on the four changed runtime files: zero issues.
- Focused Flutter safety and product-journey tests: 27 pass, one existing
  profile-dependent skip.
- Focused Node wiring tests: 12 pass.
- All 2,448 repository tool tests pass.
- Complete local regression passes with the full Flutter suite, Backend,
  PostgreSQL, analyzer, Web/Wasm, loopback smoke and Android minSdk 24/build.
- GitHub Regression `34155471330` passes at the exact implementation HEAD,
  including the repository-owned clean-checkout reproducibility proof.
- GitHub CodeQL `34155471300` passes at the exact implementation HEAD; open
  code-scanning alerts are zero.

No temporary timing, cache, rate-limit or parallelism workaround was introduced.
The maintained dedicated Mac-mini build cache remains a reproducible build
environment, not an application or release prerequisite.

## External and device boundary

WP53 changed no Staging or Production Backend, Firebase Console, Store, payment,
provider, Cloud/VPS/DNS, tester list, Play track, Pixel, OnePlus or PR-merge
state. The installed Pixel candidate `1.0.0+2026090610` therefore does not yet
contain this change. A strictly newer signed Internal Staging candidate and a
bounded physical Pixel acceptance run are required before this report flow can
be claimed on-device.
