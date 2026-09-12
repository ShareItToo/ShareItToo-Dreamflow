# WP23 notification-route principal ownership

## Outcome

WP23 is complete for the exact signed Internal Staging candidate
`1.0.0+2026090606`, source commit
`637c80d0086f7ad1aa08fe5ba1df5c1624b3e545`. Notification and app-link
destinations are bound to the principal and session epoch that owned the
incoming link. A delayed Account-A result cannot render under Account B, and
route cleanup closes only the exact route instance created for A.

The candidate was installed on the physical Pixel 7 Pro as a replace-only
update from `2026090605`. The original installation time and app-data inode
were preserved, and the installed APK matched the private archive byte for
byte. A real terminated-process FCM notification then opened the exact
Notifications destination on cold start. One Back action closed that owned
destination while ShareItToo remained foregrounded.

## Cause and correction

The first physical cold-start probe exposed one bounded gap after the primary
principal/epoch implementation. Firebase retained the notification intent,
but an expired backend access token refreshed during startup and advanced the
session epoch after the app-link owner had been captured. The security guard
correctly rejected the now-stale owner, but that also discarded the legitimate
initial notification route.

Commit `637c80d0086f7ad1aa08fe5ba1df5c1624b3e545` settles an existing backend
session through `AuthService.accessToken()` after Firebase initialization and
before `runApp`. No UI or account switch can occur in that pre-UI interval, so
the initial route is captured against the settled epoch rather than rebound to
a successor account. The normal before/after principal checks remain active
for remote reads, result presentation and navigation. Backend-disabled and
signed-out starts do not perform this settlement.

Focused tests permanently require Firebase initialization, session settlement
and `runApp` in that order, cover session/no-session/backend-disabled behavior,
and preserve the principal/epoch checks and exact route ownership. No fixed
delay, timeout increase, retry-based success assumption, lower parallelism or
weakened assertion was introduced.

## Candidate and verification

- Package: `com.shareittoo.app`
- Version: `1.0.0+2026090606`
- Source: `637c80d0086f7ad1aa08fe5ba1df5c1624b3e545`
- AAB SHA-256: `d8e85a028f52bc8b0327b513ffde20d3d7edac5bfd0ec3c73daba1cdc5b03a23`
- APK SHA-256: `20f1f5ab7c49030e7412166c81b439d9824f1955dc0dac750d55f2f75a6129a2`
- Privacy report SHA-256: `376a880126374777d43820be2134701ec5af272bbaa1c29045cd02d9e8b61501`
- Canonical upload certificate SHA-256:
  `098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4`

The private archive contains exactly the AAB, APK, manifest and privacy report
with owner-only permissions. Package, version, source, Internal channel,
Staging API, Firebase configuration, signature, hashes and a finding-free
binary privacy scan pass. No artifact was uploaded.

The complete local candidate regression passes all repository tool tests,
Flutter suites, analyzer, Web/Wasm, loopback smoke and Android minSdk 24. The
current archive also passes a separate byte-level local validation. GitHub
Regression `34022203378` passes backend, PostgreSQL, Flutter and independent
clean-checkout reproducibility. CodeQL workflow `34022203376` completes
successfully on the same source commit.

## Physical proof and cleanup

The final Pixel probe used a fresh private two-role Staging fixture derived
from the protected verified accounts without changing that source vault. The
app process was absent while Android still reported `stopped=false`, preserving
the FCM-eligible terminated state. A new controlled system notification was
observed, its exact ShareItToo title was selected, and cold startup reached the
Notifications destination. The result remained owned by the original
principal after token refresh, and Back removed only that destination.

Cleanup server-confirmed the synthetic booking cancellation, ended the
listing, removed it from the public catalog and deleted the temporary private
vault. Monetary effect was zero, no payment endpoint was called, and no
account identity, credential, token, fixture identifier, raw device identifier
or private filesystem path is retained in repository evidence.

## Ratchet audit and follow-up

The runtime/test changes refresh source-inventory, privacy, retention and
historical evidence hash chains. The JSON changes were audited as binding-only
SHA-256 updates: no status, legal conclusion, provider decision or historical
test outcome changed. The validator constants changed only to the new exact
hashes.

The exact PR merge analysis also exposes ten open CodeQL alerts in older
backend and local diagnostic/build-tool paths. None of those paths changed in
either WP23 commit, so they are not folded into or falsely attributed to this
candidate correction. They remain a release-blocking security follow-up and
are the highest-priority next work package. A successful CodeQL workflow is not
treated as zero alerts.

OnePlus, Google Play, Production, public registration, live payment, external
providers, Firebase Console, Cloud/VPS/DNS and PR merge were not changed. PR #7
remains Draft, open, mergeable and unmerged.
