# N15 Staging transport and Pixel acceptance progress

Status: **TRANSPORT PASSED / EMAIL VERIFICATION PENDING / ONEPLUS UNTOUCHED**
on 03.09.2026.

The exact signed Internal/Staging candidate is `com.shareittoo.app`
`1.0.0+2026090303`, built from artifact source
`5d88295fa7fe313b83936783a0582a505b2ba486`. Its installed Pixel APK is
byte-identical to the owner-only archive at SHA-256
`ef98f6ebac6588bf84038bd74fdcb6a54a290860e55e048fe29abb6f9b0e7560`.
The AAB SHA-256 is
`a60ad4d7567865b2ee5ffc5c08520fa142b9f788a606268317472f6e91e266b4`.

Exact Staging is healthy on the same Backend source. PostgreSQL, Google
Workspace SMTP relay and FCM are active in Staging. Payment remains memory-only
with `livemode=false`; listing AI remains local mock with zero external budget.
Two distinct role registrations were accepted and both verification messages
were accepted by SMTP. One fresh arrival was visually observed on the owner's
Pixel. No address, token, link or mailbox screenshot is stored in Git. Neither
verification link has been followed yet, so registration and login are not
claimed complete.

The physical Pixel 7 Pro on Android 17 passed current-candidate foreground,
background and terminated-process FCM delivery. The neutral notification copy
and centered ShareItToo system icon passed visual review. It also passed a
same-process offline/realtime recovery with the original network state restored,
plus logout, cold-start guest persistence, protected-chat hiding and push
suppression after logout.

The transport probes reused an already accepted, payment-free, non-binding
simulation only through a temporary owner-only projection. They created no
listing, reservation or contract, called no payment endpoint and deleted the
temporary vault. An attempted ordinary binding fixture failed closed before
creation with `v52_contract_documents_unavailable`, as required while V5.2 is
`draft-blocked`.

Commit `24a8fa3509df428b6a1aef2f7d0cd91c3d41d5f3` permanently validates an
explicit private candidate archive, isolates device-message diagnostics from
historical candidate metadata and recognizes Android 17's no-service state.
The complete local regression passes with 2,035 repository tool checks,
Flutter, Web/Wasm, loopback smoke and Android build.

Machine-readable evidence is
`docs/evidence/release-readiness/n15-staging-transport-pixel-acceptance-2026090303.json`.
The private notification screenshot remains outside Git and is represented only
by its SHA-256. N15 is not closed until the owner completes both email links and
the two real accounts pass the bounded Pixel role-flow. OnePlus, Google Play,
Production, tester lists, public registration, real money, external AI and PR
merge were not changed.
