# WP136 — Bookings unread-snapshot and Pixel closure

Status: **COMPLETE ON THE EXACT SIGNED PIXEL CANDIDATE, LOCALLY AND ON GITHUB**.

## Defect and correction

The authenticated Bookings surface did not settle on predecessor candidate
`1.0.0+2026091310`. The affected synthetic account had 136 valid historical
request rows. After the page had already fetched its authoritative list, the
unread counter iterated those rows and called the single-request authorization
path for every row. That path fetched the full remote request set again. The
result was one full request load per visible row and an apparent infinite load
on the physical Pixel.

`getUnreadCountForCategory` now captures the exact operational principal once,
validates every supplied authoritative snapshot row for that principal, reads
and decodes the local read markers once, counts synchronously, and reasserts the
same principal before returning. A foreign snapshot row, corrupt marker state
or Account-A-to-B transition fails closed. No timeout, retry, reduced fixture
or test-only bypass was introduced.

Deterministic tests cover a 500-row snapshot, exact unread count, foreign-row
rejection, corrupt-marker rejection and the structural prohibition against the
old per-row remote authorization path. The historical WP134 support validator
was separately pinned to its closure commit so a legitimate candidate rollover
cannot relabel old evidence or fail for the wrong reason.

## Exact candidate and physical proof

Signed Internal/Staging candidate `com.shareittoo.app`
`1.0.0+2026091311` was built from
`7b0479c8ee679c3e428f5aad9999d582c1c8455f`. Its AAB SHA-256 is
`59df237569ac71b226b3199a33d3b01b946359f894f5c9ddf09c1e7063ce1cc6`;
its APK SHA-256 is
`0488a10dd0aab85cf18ba4ea8c37193b1fdc2334bb7092efb9c0d23311a3da88`.
The canonical upload certificate, package/version, Firebase Staging binding,
privacy scan and closed non-binding `heilbronn_wave0` envelope pass.

The Pixel 7 Pro was replace-updated from `2026091310` to `2026091311`.
Installed APK bytes and certificate match the immutable archive; original
install time and application-data identity were preserved.

Two separate, already E-mail-verified synthetic Staging roles then completed
the real product journey: owner draft and publication through the Pixel UI,
server/public-catalog confirmation, renter discovery, non-binding request and
acceptance, Bookings surface, chat, foreground/background/terminated-process
FCM, Account-A-to-B isolation, booking cancellation, listing retirement and
protected-owner restoration. The Bookings surface settled successfully on the
same historical account population that exposed the defect. No active test
listing or booking remains.

## Verification and boundaries

The candidate source passes focused regression, the full local technical gate,
analyzer with zero issues, Web/Wasm, loopback smoke and Android minSdk 24.
Exact-source GitHub Regression `34748319125`, including independent clean
checkout, and CodeQL `34748319084` pass; open code-scanning alerts are zero.

No OnePlus, Google Play, Production, Firebase Console, Backend deployment,
payment endpoint, real money, public registration or PR merge was touched.
Machine-readable evidence:
`docs/evidence/release-readiness/wp136-bookings-unread-snapshot-pixel-closure-20260913.json`.
