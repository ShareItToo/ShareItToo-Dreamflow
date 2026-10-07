# WP132 — Exact-current report and block lifecycle

## Result

WP132 is **complete** on the physical Pixel for signed Internal/Staging
candidate `com.shareittoo.app` `1.0.0+2026091309`, source
`abf911d1c944a4e5874269111985d0cc4736546e`.

The renter submitted one report through the exact listing UI, blocked the
exact owner from the owner-bound public-profile action, and then observed both
public listings from that owner disappear together. The already-cancelled
message thread also disappeared for the renter. The exact owner remained
globally public: the visibility change was scoped to the blocking principal.

The renter then opened the real account-settings Blocked Users screen, found
the owner-bound entry, unblocked it, observed server-confirmed empty block
truth, and found both listings again through exact run-bound searches.

## Findings closed by the physical runs

The repeated fail-closed runs exposed application defects rather than being
papered over with waits:

- the search-result safety menu and public-profile menu lacked stable Android
  accessibility actions;
- public profile loading could reuse account-scoped catalog work and could
  present an unavailable profile as empty truth;
- public discovery could wait behind an unrelated owner-catalog request;
- remote search recomputation could race rapid input and category selection;
- category selection could leave the query editor focused;
- an empty exact search did not retain its section truth;
- the diagnostic initially confused query text with a listing card and later
  stopped on the parent settings surface instead of entering Blocked Users.

Candidate `2026091309` contains the application corrections. The final
diagnostic correction is tooling-only and is committed at
`32366382b0ffcce477b5101d6529edd0f9ccff90`; no candidate rebuild was needed.

## Cleanup and portfolio

All three isolated listings are ended and absent from the public catalog. The
temporary block is removed, both exact role sessions are revoked, and the
protected Pixel owner is restored. The single moderation report remains as
intentional audit history. No contract or reservation was created, the payment
endpoint was never called, and monetary effect is zero.

`support-report-block` moves to PASS. Because the signed candidate changes
shared search behavior, `search-filter-favorites-wishlists` remains PARTIAL
until its complete exact-candidate saved-state replay. The conservative
portfolio therefore remains **16 PASS / 8 PARTIAL / 8 OPEN** instead of
silently inheriting broader search proof.

Machine-readable evidence:
`docs/evidence/release-readiness/wp132-current-candidate-report-block-20260913.json`.

## Verification

- Exact physical Pixel lifecycle: passed and restored.
- Focused Node and Flutter suites: passed.
- Full local technical regression: passed, including analyzer, Web/Wasm,
  loopback smoke and Android build.
- GitHub Regression and CodeQL: required on the exact WP132 closure HEAD
  before remote closure.

No Production, Google Play, Firebase, payment provider, real money, OnePlus or
PR-merge state changed. No credential, identity, private path, fixture
identifier, UI hierarchy or raw device identifier is committed.
