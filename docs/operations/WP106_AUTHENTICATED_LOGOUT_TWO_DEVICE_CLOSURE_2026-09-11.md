# WP106 — Authenticated Logout and Two-Device Closure

## Result

WP106 corrects a physical OnePlus logout failure and freezes the successor
Android Internal/Staging candidate `1.0.0+2026091101` at source commit
`67c4e2ebe4ceead7529c4f02ca1209d71c66fe25`. The complete Pixel owner/renter
journey passes. The same candidate is transferred and cryptographically
verified on the MacBook, but the OnePlus update and journey remain blocked
because the final ADB preflight exposes zero connected devices.

## Cause and durable correction

The previous OnePlus candidate remained authenticated after confirmed logout.
Source inspection found that exact local session removal waited for native FCM
token teardown first. A provider SDK that did not return could therefore keep
the account locally present indefinitely.

Logout now closes account-bound foreground push presentation synchronously and
then removes the exact local session without awaiting Firebase. FCM tokens stay
installation-scoped; the exact backend session logout still deletes its own
push-device association, and the next confirmed login re-registers the token.
A generation guard prevents a late registration result from reopening a closed
local push boundary. Permanent tests prove that no provider `await` may re-enter
the pre-removal interval. No timeout, retry expansion, warning suppression or
other timing workaround was introduced.

## Exact candidate

- Package/version: `com.shareittoo.app`, `1.0.0+2026091101`
- APK SHA-256:
  `6382cc593ce995abce93c51fc117ba649f9d8c2194a421875923686ed657a9c7`
- AAB SHA-256:
  `9aab79539a54601ad309bde057d0f938dbf54aa30ff8353796574aad5dbd9a91`
- Upload certificate SHA-256:
  `098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4`
- Channel/API: Internal / Staging
- Payments: memory-only; Stripe live mode false
- External Listing AI: disabled

The first unscoped local build correctly rejected the known SDK XML reader
diagnostic and retained no archive. The maintained scoped Android build profile
then completed the signed APK/AAB lifecycle without suppressing that diagnostic.
Package, version, signatures, binary privacy and non-overwriting private archive
all pass.

## Verification

Focused logout/session tests pass 6 Node and 27 Flutter cases. Privacy and
retention ratchets pass 68 cases. The complete scoped local technical regression
passes. GitHub Regression `34545202654`, including clean-checkout
reproducibility, and CodeQL `34545202568` both pass on the exact artifact source
HEAD. Current branch code-scanning alerts are zero. PR #7 remains Draft, open,
mergeable and unmerged.

The Pixel received a data-preserving update from `2026091002` to `2026091101`.
Exact installed bytes, signature, package, version, app-data identity and launch
pass. Its complete two-role run proves owner UI publication plus durable server
and public-catalog confirmation, renter discovery, payment-free request and
acceptance, renter-visible chat, FCM foreground/background/terminated delivery,
Account A/B isolation, cancellation/end cleanup and protected owner-session
restoration. The public Staging catalog is empty afterwards.

The tested owner/renter API path was operational throughout the journey. A
separate final readiness readback returned HTTP `503`, classified as degraded
because support follow-ups were overdue. This is therefore not recorded as a
healthy readiness pass and remains distinct from the successful core journey.

The MacBook downloaded the same four private candidate files through a temporary
Tailnet endpoint and independently verified their hashes, package, version,
privacy result and APK/AAB certificate. At the mandatory device preflight,
however, `adb devices` returned no device even after one bounded daemon restart
and wait. Consequently no OnePlus install, uninstall, reset, login or journey
was performed. The Mac mini transfer endpoint was stopped.
The private MacBook transfer copy was removed after the final ADB check.

## Remaining bounded step

Reconnect and authorize the OnePlus CPH2581 to the MacBook so ADB lists it once.
Then install only `2026091101` with the data-preserving replace method and rerun
the exact full two-role driver. No new build is needed. Until that succeeds,
Pixel is complete while the OnePlus/cross-device claim remains explicitly open.

No contract, reservation, real payment, Store, Production, Firebase project,
cloud, VPS, DNS, public-registration or PR-merge change occurred.
