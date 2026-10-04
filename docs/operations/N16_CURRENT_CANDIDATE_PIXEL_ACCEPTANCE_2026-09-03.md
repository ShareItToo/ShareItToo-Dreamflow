# N16 current-candidate Pixel acceptance

Status: **CANDIDATE TRANSPORT AND SESSION PASSED / OWNER AND LEGAL GATES
PENDING / ONEPLUS UNTOUCHED** on 03.09.2026.

The exact installed Internal/Staging candidate is `com.shareittoo.app`
`1.0.0+2026090304`, built from artifact source
`d555a2b3730b20d1c3f22c442fb3cacd0c1f0beb`. Its AAB SHA-256 is
`a9552587afbece82fbf02351743ab3bd7970a79d0d32837d01d0212d23d828b3`
and its APK SHA-256 is
`c8b9891bdda063a85718f8a1f26a760ded41c69511e00afbbaa48df91ca9139a`.
The upload certificate, package/version/SDK identity, Firebase binding and
binary privacy scan passed. The Pixel was updated in place without uninstall,
reset or downgrade; the previous app data and first-install identity were
preserved.

Exact Staging remains healthy on deployed Backend source
`5d88295fa7fe313b83936783a0582a505b2ba486`. The candidate's runtime Backend
tree is byte-equivalent to that deployment. PostgreSQL, Google Workspace SMTP
relay, FCM and the support deadline watchdog are healthy. Payment remains
memory-only with `livemode=false`; listing AI remains the deterministic mock
with zero external budget.

The current candidate passed controlled FCM delivery in foreground,
background and terminated-process states. Its private current-candidate
notification screenshot remains outside Git and is bound only by SHA-256.
The current-candidate screenshot was reviewed directly and both controlled
ShareItToo notifications show the expected recognizable application icon. The
review does not inherit the result from candidate 0303 and stores no private
notification content in Git.

The Pixel also passed a repeatable offline/realtime probe: a new controlled
message stayed absent for 15 seconds offline, the visible count advanced from
two to three after reconnection in the same process, and exactly the expected
neutral V5.2 popup was handled. The original network state was restored. The
logout probe passed UI logout, cold-start guest persistence, protected-chat
hiding and post-logout push suppression. It closes only the exact probe-owned
V5.2 push surface, never a generic current dialog or Navigator element. The
protected diagnostic session was restored after all probes.

An ordinary binding role-flow attempt failed closed with HTTP 409 and
`v52_contract_documents_unavailable` before creating a listing, reservation
or contract. No payment endpoint was called. The existing protected,
payment-free non-binding simulation remains intact. This is the correct result
while V5.2 is `draft-blocked`; it is not a completed booking-lifecycle claim.

Two role registrations and their messages were accepted by the real Staging
SMTP transport, and one arrival was observed. Neither verification link has
been followed, so real-account login and the owner/renter Pixel journey remain
pending. No email address, verification link, token, review credential, KYC
data, device serial or network identifier is stored in Git.

The Android candidate enables the configured Google sign-in surface. A real
owner Google flow has not been executed; Facebook and Apple remain disabled.
The server-only OpenAI listing adapter is implemented but disabled. Current
SIT runtime image analysis therefore remains unproven and mock-backed.
`codex_local_dev` is available only for bounded synthetic developer evaluation
under supported ChatGPT sign-in, with no API billing or credential extraction;
it is not eligible as a SIT runtime provider and cannot publish.

Diagnostic implementation commit
`72b9fdf106c3617d2867d2a750069032ec5a131c` passes the complete local
regression, including 2,044 repository tool tests with no skip, Flutter,
analyzer zero, Web/Wasm, loopback smoke and Android build. Exact-head GitHub
Regression `33706352927`, its clean-checkout proof, CodeQL `33706352977` and
zero open code-scanning alerts pass. The added evidence/validator layer passes
the same complete local gate with 2,049 repository tool tests and no skip. PR
#7 remains Draft, open and unmerged.

Machine-readable evidence is
`docs/evidence/release-readiness/n16-current-candidate-pixel-acceptance-2026090304.json`.
N16 closes only the repeatable current-candidate transport/session evidence.
It leaves real email verification, two real accounts, legal approval, Stripe
sandbox and external listing-AI runtime explicitly open. OnePlus, Google Play,
Production, tester lists, public registration, real money and PR merge were not
changed.
