# S3W support notification and authenticated routing - architecture

Status: locally and CI-verified non-live implementation on 22.08.2026 at exact
commit `452575c1c06aaf2502573fb1bf7d95724c9b024d`; GitHub regression run
`32559993743` is green for PR merge snapshot
`5f60270857e8417b59ed9a5b5b4a777f72128ad2`. No live FCM, production, Store,
payment, Cloud/VPS/DNS or public rollout change is enabled.

## Source basis

- Drive `09_SIT_SUPPORT_SOURCE_OF_TRUTH_V1.md`: no sensitive content in Push.
- Drive `08_SIT_SUPPORT_TESTKATALOG_PILOT_GATES_V1.pdf`, scenarios `SUP-138`
  through `SUP-142`.
- The existing V5.2 FCM contract, authenticated notification API, support-case
  access checks and duplicate-safe notification outbox.

## Decision and data boundary

A support notification is created only after a support message has become a
user-visible authenticated in-app record. Drafts and approval records do not
notify the user. Immediate GREEN publication and separately reviewed
publication both schedule the same bounded `support_case_update` kind.

The in-app outbox payload contains a generic title and body plus the opaque
case UUID needed for the later authenticated request. The external Push sender
never receives that payload. It receives only the allowlisted kind and emits:

- title `Neue ShareItToo-Aktualisierung`;
- body `In der App ansehen.`; and
- data fields `contract=v52` and `route=notifications`.

No case ID, case number, address, amount, item, message text, damage detail,
injury information, action URL or other support content is sent to FCM or the
disabled/webhook transport. The support-update TTL is one hour. Marketing and
unknown kinds remain rejected.

## Authenticated navigation

The Push tap still creates only `shareittoo://notifications`. Without an
active session the app requests login; the Push itself cannot select or
reconstruct a case. After authentication, the normal notification API returns
the user's own in-app records.

When the user taps a support record, the app sends the opaque case ID to the
existing authenticated `GET /support/cases/:id` route. It renders detail only
when the returned canonical case has exactly the requested identity. If the
case was removed, the session changed, access was revoked, the response is
malformed or the backend is unavailable, the destination shows one generic
`Support-Fall nicht verfügbar` state. It does not show the ID, cached summary,
case number, server error or other prior case content. The user may retry or
open the authenticated case list.

## Duplicate and account controls

The scheduling key derives from the immutable support-message publication
event. `notification_outbox` already enforces uniqueness across event key,
recipient and channel. A repeated scheduler/producer evaluation therefore
inserts zero additional in-app or Push rows. Workflow replay returns before a
second schedule, while the database constraint remains the independent guard.

The scheduler verifies that the recipient is the reporter or an explicitly
affected user of the current case. Existing account status and notification
preferences are rechecked by the outbox worker before delivery. Closed or
inactive accounts are suppressed, and Push remains default-off until the user
has enabled it.

## Verification and remaining boundary

Focused checks pass 24 Backend/Wiring tests and 44 Flutter tests. The complete
Backend unit run passes 492 tests with one expected PostgreSQL-environment
skip. Privacy and Retention source inventories bind the new scheduler, changed
message workflow, generic Push contract and safe support destination. The
complete local technical regression also passes the accepted 220-issue
analyzer baseline, 365 Flutter tests with one documented Google-profile skip,
the separate Google-only profile test, Web build/loopback smoke and Android
debug APK build. GitHub repeated those gates, passed all 493 Backend/PostgreSQL
tests without skips and produced the same Flutter results. The signed Android
candidate and API-image publication jobs were skipped; the Backend job built
only an unpublished commit-labelled CI image.

No external provider call, live Push, Store save/submission, signed candidate,
production configuration, deployment, payment, PR merge or public pilot is
part of S3W. Device receipt of a real Push remains a later explicit live/staged
provider and signed-device gate.
