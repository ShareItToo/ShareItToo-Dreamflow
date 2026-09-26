# N22 Pixel email-verified two-role product-journey closure

Status: **PIXEL OWNER LISTING, RENTER DISCOVERY, NON-BINDING REQUEST,
ACCEPTANCE, CHAT, PRINCIPAL ISOLATION AND CLEANUP PASSED / LIVE GATES CLOSED**
on 03.09.2026.

Two persistent, distinct Staging identities whose email links had already been
confirmed completed one real product journey on the physical Pixel. The owner
created a draft and published it through the installed app UI. The exact
listing was then confirmed active on the server and visible in the public
Staging catalog. After the app switched to the renter principal, the renter
found that listing, observed the exact non-binding pilot wording and saw the
accepted request plus its exact booking chat.

The flow deliberately used the existing `simulationOnly` contract. Both role
surfaces displayed `Pilot-Simulation`; the detail view stated that no contract,
reservation or payment existed. The payment endpoint was not called, Stripe
remained non-live, availability was unaffected and the monetary effect was
zero. In-app notification creation was server-verified; the already-proven N18
FCM delivery contract remained unchanged.

The A-to-B switch showed the renter principal while the owner principal was
absent. The isolated request was cancelled and the listing ended; the listing
was no longer in the public catalog. The protected owner session was restored.
All identities, credentials, tokens and fixture identifiers remain solely in a
mode-`0600` private vault outside Git; the repository records only its digest.

Three earlier diagnostic attempts failed safely in the harness and left no
active fixture. They exposed, respectively, an incorrect dependency on a
two-second publish toast, reuse of owner wording for the renter detail matcher,
and omission of the shipped middle-dot chat-title delimiter. The final harness
uses durable server/public-catalog truth, separate role copy and the exact chat
title. Seven focused deterministic tests hold those corrections. No product or
runtime failure and no permanent timing workaround remains.

The Pixel still runs the exact signed Internal/Staging direct-APK candidate
`com.shareittoo.app` `1.0.0+2026090305`, built from artifact source
`4bcc018eef7759d9f8fe64f75daba060abf0eb13`, with APK SHA-256
`113c8067a7fcd8769952126e33c2496e1d38a06d6bcbff02658ab5336c38be41`.
Its installed hash, Firebase binding and private candidate identity were
revalidated.

Implementation commit `de6734810e920e17cd2016ab50642010c9055768`
passes the complete local gate with 2,086 repository tool tests, no skips,
Flutter, analyzer zero, Web/Wasm, loopback smoke and Android build. Exact-head
GitHub Regression `33730190048`, independent clean checkout and CodeQL
`33730190012` pass; open code-scanning alerts remain zero. PR #7 remains Draft,
open and unmerged.

Staging remains healthy on Backend source
`5d88295fa7fe313b83936783a0582a505b2ba486`. Payment remains memory-only with
`livemode=false`; listing AI remains mock with zero provider budget. No
deployment, Play, Production, public-registration, tester-list, Firebase,
payment, provider, Cloud/VPS/DNS or OnePlus change occurred.

Open after N22 are Google sign-in, phone/KYC, Stripe sandbox, external listing
AI and V5.2 owner approval. Email registration, confirmation, password recovery
and the real two-role listing/discovery/request/acceptance/chat journey are now
closed on the physical Pixel.
