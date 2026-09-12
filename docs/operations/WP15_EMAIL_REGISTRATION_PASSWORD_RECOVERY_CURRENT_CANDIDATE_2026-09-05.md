# WP15 — current-candidate E-mail registration and password recovery

Status: **COMPLETE LOCALLY, PHYSICALLY AND ON GITHUB** for fresh E-mail
registration/verification and password recovery on the exact signed Pixel
Staging candidate. Private addresses, passwords, links and tokens remain in
owner-only files outside Git.

## Exact candidate

- Source and implementation HEAD:
  `e1a737740e2d06aeaee4add8d3e2521642baac0f`.
- Package `com.shareittoo.app`, version `1.0.0+2026090504`, Internal channel,
  API `https://staging.shareittoo.com/api/v1`.
- AAB: 109,421,839 bytes, SHA-256
  `6cc9f372643ee1ae19d6239d3a2f81b4b2d8a335e0d5de85b07571f259d157c4`.
- APK: 136,384,989 bytes, SHA-256
  `3ea7092ca51cb5d38ff3c9bfd7fd2ae8f0795dbbfb072d9284fcd26748f5d02b`.
- Canonical signing-certificate SHA-256:
  `098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4`.
- Firebase Android configured; Google enabled; Apple and Facebook disabled;
  binary privacy scan passed. Closed non-binding `heilbronn_wave0` and the
  existing G3-G5 technical surfaces remain enabled only in Internal Staging.
- Owner-only non-overwriting archive:
  `/Users/walidchraibi/Library/Application Support/ShareItToo/release/android/2026090504-e1a737740e2d06aeaee4add8d3e2521642baac0f`.

The Pixel 7 Pro was updated data-preservingly from `2026090503` to
`2026090504`. Installed APK bytes and certificate match the archive; first
install time and credential-encrypted app-data identity were preserved. No
uninstall, downgrade or data reset occurred.

## Fresh registration and verification

One new disposable synthetic alias was created through the real Pixel app on
the exact installed candidate. All four required age/private-use/terms/privacy
consents were selected. The app reached the pending-verification surface and
exactly one matching message was found through the official connected Gmail
surface.

The verification URL was submitted only to the exact TLS Staging origin. The
first accepted request returned HTTP 200 with `E-Mail bestätigt`; the second
request to the same link returned HTTP 400 with `Link nicht mehr gültig`.
The new credential then logged in through the Pixel UI, the exact private
principal was visible and the session survived a terminated-process cold
start. The protected synthetic owner session was restored afterward.

An earlier link attempt received HTTP 429 with an explicit retry interval.
It was not classified as rejection or success, no second message was requested,
and the same link was used after the server interval. This is retained as
rate-limit evidence, not a product failure or timing workaround.

## Password recovery and outcome truth

A separate disposable, already verified synthetic account requested a reset
through the exact `2026090504` Pixel UI. The durable parent route displayed
the neutral `E-Mail gesendet` confirmation after the bottom sheet closed.
Exactly one matching reset message was identified. Its exact Staging form and
submission both returned HTTP 200 with `Passwort geändert`; reusing the link
returned HTTP 400.

The former credential was accepted as rejected only for the structured
`401:invalid_credentials` response. HTTP 408, intermediary or unstructured
4xx responses, transport failures and unexpected successes are not safe
rejections. Only after that exact result did the private vault promote the new
credential. The new credential logged in through the Pixel UI and survived a
terminated-process cold start. The protected synthetic owner was restored.

Registration and reset diagnostics now record `in-progress` before the first
UI submission. A missing UI result moves to `outcome-unknown`, where a second
submission is forbidden until independent mail evidence reconciles delivery.
This prevents a timeout from becoming either a false success or a fresh replay.

## Root cause and correction

The prior password-reset request reached Staging and delivered mail, but the
success toast was scheduled after an unawaited sheet pop and used the closing
sheet context. The physical driver therefore could not reliably observe the
two-second result. The runtime correction awaits the sheet result and presents
the informational popup from the still-mounted Login route. An injectable
requester provides deterministic widget coverage without changing production
request semantics.

The same commit adds fail-closed submission state machines for registration
and password reset. All downstream privacy/provider/RW evidence updates are
source-hash ratchet refreshes only; no historical conclusion, approval or live
boundary changed.

## Verification

- Focused Flutter and Node registration/reset tests pass; complete repository
  tool inventory passes 2,278 tests.
- Exact local clean R10 includes the unchanged complete technical gate in 677
  seconds and a second Android build in 45 seconds. Both 231,343,811-byte debug
  APKs are byte-identical across 794 entries with SHA-256
  `2d68f1b5243c4e3dc50f3d33e2b932fa877830de81cf0d62f8bfe5fec00418f6`.
  The private R10 report SHA-256 is
  `6535e4b2b2f762cf6cd82f20c3931ca706d64ff64a66574a44b37812c344e62b`.
- Signed AAB/APK construction, canonical signing, archive verification,
  Firebase binding and binary privacy pass through the maintained scoped
  Android build entrypoint.
- The first unscoped signed attempt was correctly rejected for
  `incompatible-sdk-xml-reader` and retained no archive. The maintained
  version-2 entrypoint then selected the established official CLI-19 SDK and
  completed without the diagnostic. No warning suppression, global SDK edit,
  cache purge, reduced test scope or permanent manual workaround was used.
- A configured-checkout non-CI regression attempt reached the historical Play
  handoff rehash and stopped because the old private `2026090204` archive is no
  longer on this host. This does not affect the new archive; no waiver was
  added. Exact local R10 and exact GitHub CI both execute the complete
  repository gate using its existing CI-metadata contract.
- GitHub Regression `33971877065` passes all required jobs, including the
  independent clean R10. CodeQL `33971877091` passes; open code-scanning alerts
  are zero. PR #7 remains Draft, open, mergeable and unmerged.

No deployment, Google Play, tester-list, Firebase-console, Stripe/payment,
Production, public registration, OnePlus or PR-merge change occurred. The two
disposable Staging identities remain owner-only and may be used for the next
bounded account-lifecycle package; neither is represented as a real user.

