# WP16 — current-candidate account deletion

Status: **COMPLETE LOCALLY, PHYSICALLY AND ON GITHUB** for a disposable,
verified Staging account on the exact signed Pixel candidate. No private
identity, password, access token or device identifier is retained in Git.

## Exact candidate

- Source and runtime implementation HEAD:
  `e18e788c0d04fe6b80e3be2f63b30d5f3719ae7d`.
- Package `com.shareittoo.app`, version `1.0.0+2026090505`, Internal channel,
  API `https://staging.shareittoo.com/api/v1`.
- AAB: 109,426,479 bytes, SHA-256
  `f22168befdbede87ad0b067533c2159077515c1acc644449869593f18de2f8d0`.
- APK: 136,384,989 bytes, SHA-256
  `d20b49764f86bfd2723f598ed8aaf202730168f53b629bd283c5058092615c57`.
- Canonical signing-certificate SHA-256:
  `098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4`.
- Firebase Android is configured; Google is enabled; Apple and Facebook are
  disabled; the binary privacy scan passed.
- The verified owner-only archive is
  `/Users/walidchraibi/Library/Application Support/ShareItToo/release/android/2026090505-e18e788c0d04fe6b80e3be2f63b30d5f3719ae7d`.

The Pixel 7 Pro was updated data-preservingly from `2026090504` to
`2026090505`. Installed APK bytes and certificate match the archive; first
install time and credential-encrypted app-data identity were preserved. No
uninstall, downgrade or data reset occurred.

## Physical acceptance

The already isolated WP15 disposable account logged in through the real Pixel
UI. Its server deletion preflight was clear. Submitting the confirmation with
an intentionally wrong current password returned the structured
`401:invalid_credentials` rejection, left the account active, and visibly
retained the typed result `Konto nicht gelöscht` with its explanatory text.

The same UI flow then used the correct private credential. The app displayed
`Dein Konto wurde gelöscht`. A terminated-process cold start showed the Guest
state, and a direct server re-login with the deleted credential returned exact
`401:invalid_credentials`. Only after both proofs were complete were the
disposable address and password removed from the private owner-only vault. The
protected synthetic owner session was restored on the exact `2026090505`
installation.

## Root cause and correction

The deletion repository previously used the generic authenticated request
path. That path refreshes the access token after every HTTP 401. A valid
session plus an invalid deletion password therefore refreshed successfully,
advanced the local session epoch, emitted an account transition and closed the
owner-bound dialog before its definite rejection could be rendered.

Deletion now captures the exact `AuthSessionOwner` before the remote mutation
and dispatches through the exact-owner request path. That path cannot refresh
or fall back to a successor principal. The existing epoch and owned-route
checks still suppress results after a real A-to-B transition and only close
the route created by that action. They do not globally pop a later dialog.

The error classification is unchanged: structured invalid credentials is a
definite rejection; HTTP 408, intermediary or unstructured 4xx responses and
transport failures are not. The UI keeps rejected, locally incomplete and
outcome-unknown results distinct.

All downstream privacy, retention, provider and RW evidence changes in the
implementation commit are source-hash ratchet refreshes. No historical result,
approval or external-gate state changed.

## Verification and boundaries

- Focused RW17 checks pass 14 Flutter tests. The repository tool inventory
  passes 2,279 tests. The complete local regression passes 861 default Flutter
  tests with 33 explicit profile skips, plus analyzer, Web/Wasm, loopback,
  backend, PostgreSQL and Android gates.
- Exact local clean R10 passes its full technical gate in 650 seconds and a
  second Android build in 31 seconds. Both 231,344,819-byte APKs are
  byte-identical across 794 entries with SHA-256
  `3677c0f0e9679afc99ea906ee5c815c2624865fe3f3dc451853017178a7ebb64`.
  The private R10 report SHA-256 is
  `2dc6f8c77f40c689ccdedf55ed5921dbbaad7b7ce91166a658d66791d8abddf4`.
- GitHub Regression `33975265727` passes all required jobs, including its
  independent clean R10. CodeQL `33975265754` passes and open code-scanning
  alerts are zero. PR #7 remains Draft, open, mergeable and unmerged.

No deployment, Google Play, tester list, Firebase console, provider, Stripe,
payment, Production, public registration, OnePlus or PR-merge state changed.
The only server mutation was deletion of the explicitly disposable synthetic
Staging identity used for this bounded lifecycle proof.
