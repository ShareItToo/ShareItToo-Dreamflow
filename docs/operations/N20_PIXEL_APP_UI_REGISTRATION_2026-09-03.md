# N20 Pixel app-UI registration closure

Status: **PIXEL APP REGISTRATION, EMAIL CONFIRMATION, LOGIN AND COLD START
PASSED / LIVE GATES CLOSED** on 03.09.2026.

A fresh persistent Staging identity with a synthetic owner-only mail alias was
created through the registration form of the installed physical Pixel app.
The form submitted name, email, password and password confirmation only after
all four visible age, private-use, terms and privacy controls were checked.
The real Staging Backend accepted the request and the app showed the pending
email handoff.

The new message was found through the official connected Gmail read surface.
Its single-use URL was submitted only to the exact TLS-protected Staging
confirmation origin and returned HTTP 200 with the successful confirmation
page. No browser cookie, mailbox content, address, password, token or URL was
printed or stored in Git.

The exact newly registered account then logged in through the real app UI.
Its exact synthetic display name was visible, the guest principal was absent,
and the same account survived a force-stop and cold launch. Private screenshot
and UI-hierarchy evidence remains outside Git; only SHA-256 digests are bound
in the machine evidence. Visual review confirms that no personal address or
credential is visible. The established protected owner test session was
restored after the probe.

The Pixel still runs the exact signed Internal/Staging direct-APK candidate
`com.shareittoo.app` `1.0.0+2026090305`, built from artifact source
`4bcc018eef7759d9f8fe64f75daba060abf0eb13`, with APK SHA-256
`113c8067a7fcd8769952126e33c2496e1d38a06d6bcbff02658ab5336c38be41`.
The archive manifest, binary privacy report, signature and installed APK hash
were revalidated before the form was touched.

The reusable N20 diagnostic is commit
`0c1b62042719763fff5f420be524f8a244440c3a`. Complete local regression passes
with 2,067 repository tool tests, no skips, Flutter, analyzer zero, Web/Wasm,
loopback smoke and Android build. Exact-head GitHub Regression `33720856359`
and CodeQL `33720856387` pass, with zero open code-scanning alerts. The
evidence layer passes the same complete local gate with 2,071 repository tool
tests. PR #7 remains Draft and unmerged.

Staging remains healthy on Backend source
`5d88295fa7fe313b83936783a0582a505b2ba486`. Payment remains memory-only with
`livemode=false`; listing AI remains mock with zero provider budget. No
deployment, Play, Production, public registration, tester-list, Firebase,
payment, provider, Cloud/VPS/DNS or OnePlus change was made.

Open after N20 are Google sign-in, password recovery, phone/KYC, Stripe
sandbox, external listing AI, V5.2 owner approval, and the complete real
two-role product journey.
