# S4D support feedback priority - architecture

Status: locally verified on 22.08.2026 at exact implementation commit
`523d987480c96c7f9cb2338057880680994282a7`. This is the non-live technical
implementation of Drive scenario `SUP-030`. It records explicitly non-urgent
feedback as a low-priority support case; it does not create a product decision,
contact an external system or enable production, Payment, Store, Cloud, VPS,
DNS or a pilot.

## Source basis

- Drive `13_SIT_SUPPORT_TEST_MATRIX_V1.md`, scenario `SUP-030`.
- Current Support Master Handbook and Support Playbooks in the SIT Support
  Packet, especially the `GEN_FEEDBACK` / feedback-or-improvement route.
- Existing canonical support intake, audit, Privacy, Retention and appeal
  boundaries.

The source material classifies improvement suggestions, non-urgent requests for
explanation and general product feedback as P4. Priority follows risk and time,
not volume, payment status or prominence. Urgent or safety-relevant facts must
use the appropriate higher-risk intake instead.

## Exact feedback contract

The canonical route is `general_help/feedback_or_improvement`. Its exact
versioned `feedbackContext` contains only:

- `version=sit_support_feedback_context_v1`;
- one controlled `feedbackKind`;
- one controlled `productArea`;
- `nonUrgentConfirmed=true`.

The supported feedback kinds are improvement suggestion, non-urgent
explanation and general feedback. Product-area choices are bounded to app,
catalog, booking/schedule, handover/return, payments/documents,
messages/notifications, profile/account, accessibility and other. Flutter
offers ten concrete user choices and validates that the server returns the
identical context.

## P4 routing and fail-closed separation

Application code and PostgreSQL independently require P4, low severity,
`general_support_owner`, green intake approval and a 24-hour internal
checkpoint. The receipt says only that the feedback was captured and assigned
to the selected product area. It promises neither escalation nor a product
change.

Immediate danger, account takeover, possible high-risk data exposure or an
imminent authority deadline rejects this route and requires the appropriate
urgent path. Booking, listing, payment, refund and payout identifiers are also
rejected; feedback therefore cannot become a hidden transaction, money or case
action. Safety, Privacy, DSA, authority, Article 18, money and account-takeover
flags remain false.

## Durable evidence, Privacy and rollback

Migration `054` adds P4 and the exact JSON shape, route and no-link constraints.
The feedback context is immutable after creation. The creation event and audit
record carry only bounded controlled values; reporter export exposes the same
context. Existing support-case Retention scope covers the new field while the
period and execution decisions remain open and disabled.

The down migration is guarded: it refuses rollback while any P4 or feedback
case/context remains, then restores the previous taxonomy and priority domain.
No external product-management connector, notification or action adapter is
introduced.

## Local verification

- 59 focused Backend and permanent-wiring tests passed.
- 19 focused Flutter support-flow tests passed.
- Privacy/Retention validators and 61 protection tests passed while approval
  and deletion execution remained false.
- A fresh isolated PostgreSQL 16 integration applied migration `054` and
  passed API, exact-shape, immutability, forbidden-link, audit, export and
  guarded-rollback coverage.
- The complete Backend run passed 524 tests with one expected no-database skip.
- The complete technical regression accepted the 220-issue analyzer baseline,
  passed 370 Flutter tests with one documented skip, the separate Google-only
  test, Web build/loopback smoke and Android debug APK.
- Both source-bound P0B validators passed and retained PSP `HOLD` and pilot
  `0/4` / `NO-GO` state.

GitHub push and CI are not claimed in this local record. Draft PR #7 remains
unmerged. No production, Payment, Store, Firebase Console, Cloud/VPS/DNS,
external delivery, real support operation, signed candidate or public
activation occurred.
