# N27 current-candidate Pixel two-role, push and offline closure

Status: **CURRENT CANDIDATE PRODUCT JOURNEY, PUSH AND OFFLINE/ONLINE PASSED /
LIVE GATES CLOSED** on 03.09.2026.

The physical Pixel 7 Pro retains the exact signed Staging candidate
`com.shareittoo.app` `1.0.0+2026090306` from source
`9d7e2601dc477cf3ae3d469b65448ce2065375e0`. The installed APK SHA-256 is
`37d98f999562150e77fea335fcb0bde32aee20d2183509f5484a5e67cd1e3194`;
the signing-certificate SHA-256 is
`098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4`.
No mobile source changed after that candidate.

Two distinct email-confirmed Staging principals passed the current-candidate
journey: owner draft and Pixel-UI publication, exact server and public-catalog
readback, renter discovery, non-binding request and acceptance, renter-visible
chat, A-to-B principal isolation, cancellation, listing retirement, public
removal and protected-owner session restoration. Both roles displayed
`Pilot-Simulation`. No contract, reservation, payment call or availability
change occurred; monetary effect was zero.

Controlled Staging FCM passed while the app was foregrounded, backgrounded and
force-stopped. Private visual review confirms the ShareItToo brand icon is clear
and fully visible in both captured test notifications. The full notification
shade also contains unrelated personal device notifications, so the screenshot
is treated as sensitive, remains outside Git and is not distributable. N27
still does not claim the complete Store-installed FCM matrix. The probe sent no
Production notification and preserved the protected non-binding fixture
outside Git.

The first offline attempt exposed a test-boundary race: Android reported no
default network before an already-open realtime transport had fully settled.
A retry alone was not accepted. Commit
`9a5f38dcbd5a3aa2471ba1bb314e2ffbef3a50bd` now requires ten consecutive
offline samples across five seconds before the message is sent. The hardened
run proves that the message remained absent for 15 seconds, appeared only after
network restoration, the same foreground app process survived and no package
crash was recorded. The original WLAN and mobile-data settings were restored.

The initial booking-based FCM setup also hit the intended V5.2 legal hold
`409:v52_contract_documents_unavailable`. No booking was created, but the old
harness could leave its newly created listing active after that rejection. The
single exact orphan was verified to have no nonterminal booking, paused, read
back and removed from the public catalog. Commit
`5656ee6aaf2f4ab6ea9b0a47dacb8b1b3799cdcf` permanently retires only a listing
created in the current attempt, first checks server request state, and otherwise
fails closed for controlled reconciliation. Fifteen focused fixture tests, ten
device-diagnostic tests and the repeated temporary-fixture boundedness gate
pass.

Because the fixture tool is intentionally part of the privacy source inventory,
the first GitHub Regression runs stopped on stale hashes. Commit
`b4741908b0e3b00bb9652de05ca63e87f159648f` rebinds the privacy manifest,
active-provider evidence and dependent RW inventories without changing
privacy meaning, provider decisions, owner gates or scanner rules.

The complete local gate passes 2,118 repository tool tests, 797 Backend tests
with two expected no-database skips, PostgreSQL fresh/recovery, 652 Flutter
tests, analyzer zero, Web/Wasm, loopback and Android debug. GitHub Regression
`33757624155`, clean-checkout reproducibility and CodeQL `33757624091` pass;
open code-scanning alerts remain zero. PR #7 stays Draft and unmerged.

Current-candidate real SMS still needs one owner-assisted request/code/cold
restart step. Store-installed FCM, hotspot, manual TalkBack, OnePlus,
Stripe-provider activation, external listing AI and V5.2 owner approval remain
separate. No Google Play, Production, public
registration, Firebase configuration, payment, KYC, real money, Cloud/VPS/DNS,
tester-list, OnePlus or merge action occurred.

Machine-readable evidence:
`docs/evidence/release-readiness/n27-current-candidate-pixel-two-role-push-offline-2026090306.json`.
