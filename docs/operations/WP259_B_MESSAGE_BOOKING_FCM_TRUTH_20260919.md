# WP259-B message, booking and FCM truth — SOURCE FIX PENDING SUCCESSOR / PROVIDER HOLD

## Scope and candidate binding

This package is bound to the installed Pixel candidate `1.0.0+2026091704`
(`com.shareittoo.app`, source `9cbac5be2e4702c6b11954bfcc935ca38fdb6aac`)
and the non-production Staging API only. The OnePlus is optional post-delivery
evidence and is not a blocker for this package.

## Staging booking and messaging evidence

- Owner and renter authentication succeeded with the existing private Staging
  cohort; no credentials are stored in the repository.
- A bounded booking was accepted by the owner. A same-period quote was rejected
  with structured `booking_period_unavailable` (409).
- A renter could not perform an invalid owner transition; the server returned
  structured `invalid_status_transition` (409). A separate owner decline was
  read back as terminal `declined`.
- A real thread was created. Renter and owner messages were persisted and read
  back in order. Unread state was observed by the recipient and cleared by the
  explicit mark-read operation. The thread remained account-bound.
- The installed 1704 UI displayed the thread header, participant name and both
  message bubbles. Its generic avatar fallback exposed a source/runtime gap;
  this package adds authoritative public-profile hydration for message-list
  participants and sender names for notifications. The source fix is not in
  immutable 1704 and needs a strictly higher successor build.

The accepted synthetic booking used for the probe was retired by an exact,
owner/renter-bound database update after the staging V5.2 withdrawal contract
returned `v52_withdrawal_contract_binding_invalid`; the retirement was audited.
No unrelated rows or production data were changed.

## FCM boundary

The Pixel notification permission was enabled and a current owner device
registration was observed in the Green Staging database. The message worker
created both in-app and push outbox rows, but Staging is configured with
`PUSH_TRANSPORT=memory`. Therefore no real FCM provider delivery, notification
shade display, tap or deep-link is claimed here. Provider activation is a
separate WP260 gate. The FCM probe booking was retired after readback.

## Verification

- Message/profile source contract: 3/3.
- Changed-path Flutter analyzer: PASS.
- Focused message/coordinator/similar-listing/RW6 suites: 30/30 PASS.
- `git diff --check`: PASS.
- No Play upload, device install, provider activation, payment, production or
  cloud mutation occurred.

## Next step

Build one strictly higher candidate containing the source fix, then perform the
WP260 provider lane (starting with the safest read-only/SMTP or provider
preflight) before claiming real FCM delivery. Keep the OnePlus optional.

Evidence: `docs/evidence/release-readiness/wp259-b-message-booking-fcm-truth-20260919.json`.
