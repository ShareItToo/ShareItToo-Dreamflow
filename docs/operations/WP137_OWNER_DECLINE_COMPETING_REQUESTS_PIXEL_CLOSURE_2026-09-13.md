# WP137 — Owner decline with competing requests on Pixel

Status: **COMPLETE ON THE EXACT SIGNED PIXEL CANDIDATE, LOCALLY AND ON GITHUB**.

## Scope and result

WP137 closes the remaining exact-candidate decline gap without changing app
source, candidate bytes or Staging infrastructure. Three distinct, already
verified synthetic Staging principals were bound to one isolated listing. Two
renters created overlapping, explicitly non-binding and payment-free requests.

The owner opened the real `Mietanfragen` product surface on the physical Pixel
7 Pro, opened one request detail, confirmed `Ablehnen`, observed the success
surface and the declined request under completed rentals, then returned to the
request list. Exactly one competing request remained pending. Independent
server reads proved exactly one declined request, exactly one still-requested
request, strict renter isolation and the declined renter's notification.

The diagnostic determines the declined request from authoritative server
truth rather than relying on display names or list ordering. Its cleanup runs
after both success and failure: both requests ended terminally, the isolated
listing was ended and removed from the public catalog, and the protected Pixel
owner was restored. Recovery metadata and optional UI captures are owner-only
and remain outside Git; even symlink-resolved diagnostic output is forbidden
from entering the repository.

## Exact candidate and verification

The unchanged signed Internal/Staging candidate is `com.shareittoo.app`
`1.0.0+2026091311`, built from
`7b0479c8ee679c3e428f5aad9999d582c1c8455f`. Its APK SHA-256 is
`0488a10dd0aab85cf18ba4ea8c37193b1fdc2334bb7092efb9c0d23311a3da88`
and its AAB SHA-256 is
`59df237569ac71b226b3199a33d3b01b946359f894f5c9ddf09c1e7063ce1cc6`.
Installed bytes and candidate source match on the Pixel.

The runner's three deterministic contract tests pass. The full local technical
gate, analyzer with zero issues, Web/Wasm, loopback smoke and Android minSdk 24
build pass. Implementation commit
`1ae97c0c653446791867373f3dffe85308b5132d` passes GitHub Regression
`34750784804`, including independent clean checkout, and CodeQL `34750784788`;
open code-scanning alerts are zero.

This promotes only `offer-request-accept-decline` from PARTIAL to PASS. The
conservative portfolio is now **19 PASS, 5 PARTIAL and 8 OPEN**.

## Boundaries

No OnePlus, Google Play, Production, Firebase Console, Backend deployment,
payment endpoint, Stripe live mode, money, binding contract, reservation,
public registration or PR merge was touched. No test listing or request remains
active. Machine-readable evidence:
`docs/evidence/release-readiness/wp137-owner-decline-competing-requests-pixel-closure-20260913.json`.
