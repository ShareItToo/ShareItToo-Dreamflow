# 48H R4 Android lifecycle and failure matrix

Status: **COMPLETE — PHYSICAL, REGRESSION AND CODEQL VERIFIED**

R4 covers all 28 lifecycle and failure cases named by the active 48-hour goal.
The implementation is commit
`a843e33e7b86d2e7fd1a8dec288a834af51f49fc`. The bounded physical lifecycle
observation used the already installed, hash-matched R3 local-QA candidate
`1.0.0+2026082404` from commit
`19fc3221bc3879788db9c48b70a89a33656116b6`. The report does not claim that
the new R4 recovery implementation was installed or physically exercised.

## Physical Pixel observation

The Pixel 7 Pro passed cold and warm launch, force-stop/process absence,
same-process resume, background/foreground, all five primary navigation
destinations, one bounded orientation transition with exact restoration, the
existing denied CAMERA state without permission mutation, valid and invalid
app-link intents, and a zero fatal/ANR log check. Install time and app-data
identity remained stable. No private UI hierarchy, screenshot, media, account
content or raw device identifier was persisted.

Only orientation was changed. Its two original system values were recorded in
memory by the diagnostic and restored in `finally`, then read back and compared
exactly. CAMERA remained denied. Network, TalkBack, font scale and accessibility
settings were not changed. The app was neither uninstalled nor data-reset.

## Reliability implementation

Interrupted Blue-Ocean drafts now use platform-encrypted storage with one
owner-bound snapshot, a 24-hour TTL and a 128 KiB encoded ceiling. The snapshot
contains managed HTTP(S) image references and bounded editable state, never raw
image bytes, credentials, confirmations or the READY fingerprint. Account
mismatch, expiry, future timestamps, malformed state and unsafe photo references
fail closed. Restore always resets consent, clarifications, replacement-band
confirmation, every owner confirmation and the publication fingerprint, so a
fresh review is mandatory. State clears on logout, successful publication and
photo mutation.

Camera and gallery failures now remain visibly announced with accessibility
semantics. The camera path never silently switches to the gallery. Submit
actions share a busy guard and are disabled while publication or review is in
flight.

An interrupted publication retry remains an explicit owner action. If the
owner-bound draft is already published, the backend joins the exact listing to
its append-only publication receipt and returns the same authoritative listing
with `replayed=true`, `autoPublishAllowed=false` and private no-store caching.
A missing receipt is an invariant failure, not a second publication attempt.

## Matrix interpretation

Nine cases have bounded physical-device evidence. The remaining cases use
deterministic Flutter, Node, source-contract or local PostgreSQL failure
injection. In particular, permanently denied permission and offline-to-online
behavior were not created by mutating Pixel settings; they verify the common
visible fail-closed handler and the encrypted local recovery path. Price-engine
unavailability verifies that review failure preserves editor state rather than
artificially disabling the authoritative engine. These are contract tests, not
physical end-to-end or performance certification.

The local PostgreSQL scenario restarts the application server after persisted
cart state, after request creation and after Blue-Ocean review. It then verifies
cart recheck, booking-request idempotent replay, draft publication and exact
publication replay. The database, server and temporary resources are cleaned at
the end.

## Current verification and boundary

Focused verification is green: 109 R4 Node tests, 19 focused Flutter tests, 24
quote/logout/offline Node tests, five logout-resilience Flutter tests, analyzer
with no issues, both privacy/retention validators and the complete local
PostgreSQL scenario. The full technical regression also passed in the bounded
candidate-rollover CI metadata mode, including 391 Flutter tests with one
documented skip, the Google-only profile test, Web/Wasm build, loopback smoke
and the 448-task Android debug build.

GitHub Regression run `32736181817` passed on exact head
`c7dba0d0af5d00c5e2b4c5439bf0002e1185a9c5`: PostgreSQL job
`97459436744`, Flutter job `97459437155` and backend job `97459437367`
all completed successfully. The workflow-dispatch-only parallel-stability step
and the signed Android candidate step were skipped. The backend API image was
built inside CI, but publish job `97461834174` was skipped, so no registry or
runtime changed. CodeQL run `32736181796` and advanced-security check
`97459435293` passed on the same exact head; the repository's open code-scanning
alert query returned zero alerts.

R4 made no production, cloud, Firebase, payment, Store, VPS, DNS, pilot,
external-AI, API-billing, real-money, public-release or PR-merge change. No
temporary timing, rate-limit, parallelism or toolchain workaround was made a
permanent prerequisite. R4 is complete and the next package is
`R5_REPEATED_DEVICE_STABILITY`.
