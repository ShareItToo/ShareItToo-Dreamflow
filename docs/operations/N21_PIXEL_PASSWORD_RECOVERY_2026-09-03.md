# N21 Pixel password-recovery closure

Status: **PIXEL PASSWORD RESET, SINGLE-USE CONFIRMATION, OLD-CREDENTIAL
REJECTION, NEW LOGIN AND COLD START PASSED / LIVE GATES CLOSED** on
03.09.2026.

The persistent synthetic-alias Staging identity created in N20 requested a
password reset through the installed physical Pixel app. The UI returned the
same neutral success text regardless of account existence. The exact reset
mail was found through the official connected Gmail read surface. Its link was
submitted only to the exact TLS-protected Staging origin: the form returned
HTTP 200, the reset submission returned HTTP 200 with the success page, and a
second request to the same link returned HTTP 400. No browser cookie, mailbox
content, address, password, token or URL was printed or stored in Git.

The former credential was then rejected by the exact structured Staging
contract `401:invalid_credentials`. Only that exact result permits the private
fixture to promote the new credential. HTTP 408, intermediary or unstructured
4xx responses, transport failures and unexpected success can never count as
old-credential rejection and preserve both private vaults byte-for-byte. The
new credential then logged in through the real Pixel app UI; the exact
synthetic principal was visible and survived force-stop/cold launch. The
established protected owner session was restored afterward.

The Pixel still runs the exact signed Internal/Staging direct-APK candidate
`com.shareittoo.app` `1.0.0+2026090305`, built from artifact source
`4bcc018eef7759d9f8fe64f75daba060abf0eb13`, with APK SHA-256
`113c8067a7fcd8769952126e33c2496e1d38a06d6bcbff02658ab5336c38be41`.
Archive identity, signature, Firebase configuration, binary privacy and the
installed APK hash were revalidated.

Core diagnostic commit `0a310f04823ab7ddb87e1d6eba20aa82d0bbd6d3`
exposed a deliberate secret-scan ratchet: one synthetic literal in the test
fixture matched the high-confidence static-password rule. No product or
runtime failure occurred. Commit `eadd1fac292527127ffaeafaab08a74190593612`
constructs the current fixture at runtime and records the immutable historical
false positive by exact commit, file and rule without weakening the scanner.
Commit `638c91efd040d9c0412dcb39f151ba035cf3bf27` refreshes every dependent
security-evidence inventory through RW20. The repository-wide inventory check
reports zero stale hashes.

The final diagnostic head passes the complete local gate with 2,075 repository
tool tests, no skips, Flutter, analyzer zero, Web/Wasm, loopback smoke and the
Android build. Exact-head GitHub Regression `33724178775` and CodeQL
`33724178803` pass, including the independent clean-checkout reproduction;
open code-scanning alerts remain zero. PR #7 remains Draft, open, mergeable
and unmerged.

Staging remains healthy on Backend source
`5d88295fa7fe313b83936783a0582a505b2ba486`. Payment remains memory-only with
`livemode=false`; listing AI remains mock with zero provider budget. No
deployment, Play, Production, public-registration, tester-list, Firebase,
payment, provider, Cloud/VPS/DNS or OnePlus change occurred.

Open after N21 are Google sign-in, phone/KYC, Stripe sandbox, external listing
AI, V5.2 owner approval and the complete real two-role product journey.
