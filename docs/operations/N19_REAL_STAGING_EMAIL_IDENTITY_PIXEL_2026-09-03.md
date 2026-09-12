# N19 real Staging email identity and Pixel account isolation

Status: **TWO EMAIL LINKS AND TWO REAL STAGING LOGINS PASSED / LIVE GATES
CLOSED** on 03.09.2026.

Two persistent Staging identities with synthetic owner-only mail aliases were
already accepted by the real Staging registration endpoint and Google
Workspace SMTP relay. The two matching messages were found through the
official connected Gmail read surface. Both single-use links were submitted
only to the exact TLS-protected Staging confirmation endpoint and returned the
successful confirmation page. No browser cookie, mailbox body, address,
password, token or link was emitted or stored in Git.

The private vault remains outside the repository with mode `0600` and now has
the explicit state `email-link-verified-ready-for-login`. It contains one
owner and one renter role. Addresses and credentials remain private.

The Pixel runs the exact signed Internal/Staging candidate
`com.shareittoo.app` `1.0.0+2026090305`, built from artifact source
`4bcc018eef7759d9f8fe64f75daba060abf0eb13`. Through the real app UI it
successfully logged in as owner, switched to renter, and switched back to
owner. Each profile showed only its expected synthetic role name; the previous
principal was absent. Both owner and renter sessions also survived a force-stop
and cold launch with the correct identity. The final protected session is the
owner role.

Private Pixel screenshots and UI hierarchies stay outside Git. Their hashes
are bound in
`docs/evidence/release-readiness/n19-real-staging-email-identity-pixel-2026090305.json`.
They contain no personal address or credential. The real registration form
submission itself was not tapped on the Pixel in this package: registration UI
wiring is covered by deterministic tests, while the real endpoint, SMTP,
confirmation and app login were exercised separately. That remaining manual
surface is stated as open rather than inherited.

Staging remains healthy on Backend source
`5d88295fa7fe313b83936783a0582a505b2ba486`; PostgreSQL, Google Workspace
SMTP relay, FCM and the support watchdog are healthy. Payment remains
memory-only with `livemode=false`; listing AI remains mock with zero provider
budget. No deployment was required.

N18 evidence HEAD `e80b1096c77422554c382b671ecdd910af55b96f`
passes exact GitHub Regression `33718146247`, CodeQL `33718146180`, clean
checkout and zero open alerts. N19's evidence layer passes the complete local
gate with 2,063 repository tool tests, Flutter, analyzer zero, Web/Wasm,
loopback smoke and Android build. PR #7 remains Draft and unmerged.

Open after N19 are the Pixel registration-form submission, Google sign-in,
password recovery, phone/KYC, Stripe sandbox, external listing AI and V5.2
owner approval. OnePlus, Play, Production, tester lists, public registration,
real money, Cloud/VPS/DNS and PR merge were unchanged.
