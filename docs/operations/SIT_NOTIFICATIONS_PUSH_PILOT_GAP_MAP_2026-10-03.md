# SIT booking/message notifications and push — 2026-10-03

**Result: source foundations pass focused checks; current Staging push is
memory-only. Current browser/device delivery acceptance remains OPEN.**
Scope excludes enrollment email, provider sends, device/account changes and
deployment. No concrete provider-independent implementation defect was proven,
so this package changes documentation only.

Source audit began at `7829046600fae75f7fed4065680686142a259115`; readback HEAD
was `df45cc74e794eb3c418c5da1d5a2bf617d3ae3e1`.
The notification, push-sender, Firebase-runtime, backend-repository and
auth-session-action sources did not change between those commits. Other
packages had uncommitted changes in shared configuration/application files;
the tests below are focused working-tree evidence, not exact-HEAD CI.

## Source truth and gaps

| Surface | Verified source behavior | Remaining acceptance |
| --- | --- | --- |
| Booking/message event creation | [Booking workflow](../../backend/src/booking_workflow.js) and [message workflow](../../backend/src/message_workflow.js) create audit/event state and call [notification enqueue](../../backend/src/notifications.js) through their transactional client. Booking recipients follow lifecycle roles; messages target the other participant. Unique event/user/channel keys prevent duplicate enqueue. | Fresh two-role committed event, correct recipient, replay and no foreign-account projection through the current browser/app. No new lifecycle event was created here. |
| Durable inbox and delivery attempts | Outbox worker claims with `FOR UPDATE SKIP LOCKED`, persists recipient-scoped inbox rows idempotently, and records provider/outcome/metadata in delivery attempts. Failures retry with bounded backoff and become `dead`; stale processing claims are recoverable. Worker rechecks active account, channel preferences and Staging recipient gate. | Inbox creation and an outbox `sent` value alone do not prove external delivery. `provider=memory` is simulation; `provider=postgres` is inbox persistence. |
| FCM payload and outcome | [Push sender](../../backend/src/push_sender.js) permits transactional kinds only; neutral V5.2 title/body, safe notifications route and event-specific TTLs expose no message/booking details. Known invalid tokens are disabled. At least one provider acceptance yields `sent`; metadata retains failed-device count. | Provider acceptance is not device display or acceptance on every registered device. Foreground/background/terminated receipt, tap and stale-session behavior require exact-device evidence. |
| Token registration/revocation | [API](../../backend/src/app.js) requires current authenticated active user, binds registration to user/session and upserts by token hash. Current-session deletion is owner-bound and audited; [session actions](../../backend/src/auth_session_actions.js) delete associated devices during logout/session revocation and account credential containment. | Fresh current-candidate rotation, re-registration, logout and invalid-token cleanup proof. An enabled DB row alone does not establish a valid reachable device. |
| Principal isolation | [Firebase runtime](../../lib/services/firebase_runtime.dart) serializes registration with captured session epoch/generation; [backend repository](../../lib/services/backend_repository.dart) rechecks exact owner around calls. Logout synchronously closes foreground presentation and clears pending action links. Opt-out closes local gates and retains scoped cleanup for retry. | Physical OS-level/in-flight notification behavior is not established by local queue tests; retain neutral payload and authenticated inbox readback boundaries. |
| Native/Web | Firebase native initialization and explicit push preference support Android/iOS paths; iOS waits for APNs token. Web initialization returns before native push setup. Backend acceptance of platform `web` does not make this client a Web-Push implementation. | Native provider/device matrix remains separate. Web can use the authenticated inbox, but current browser event/read/unread/CTA acceptance is still open. See [capability matrix](SIT_WEB_NATIVE_CAPABILITY_MATRIX_2026-10-02.md). |

## Fresh sanitized runtime/database evidence

At `2026-10-03T13:01:32.592Z`, SSH read-only inspection verified canonical
Staging container running with the Green label. Health/version was read inside
its captured immutable container ID over loopback:

- Runtime/image revision and `/version` agree on
  `6c0ef70db2656df3e378add858d5f5157388127e`.
- Image digest:
  `sha256:16a90e4fbc3710e37c9e319fe5db545d6da6348448848c94c6bfc661eac47357`.
- Environment `test`; readiness HTTP `200`, status `ok`.
- `PUSH_TRANSPORT=memory`; notification `pending=0`, `dead=0`.
- Allowed-user and allowed-push-token-hash sets are present; values were not
  printed. Their presence does not activate FCM or prove present eligibility.
- Worker interval/batch/attempt environment overrides are absent. Source
  defaults are 5000 ms / 25 / 5; Staging Compose defaults differ at 1000 ms /
  50 / 5. These defaults are not substituted for effective runtime readback.

A subsequent `BEGIN READ ONLY` transaction on the canonical Green database
returned only five existence booleans, all true: enabled push registration,
booking/message outbox, booking/message inbox, retained FCM `sent` attempt,
and retained memory `sent` attempt. No identifiers, contents, tokens, hashes,
credentials, personal data or provider message IDs were printed. The query
did not restrict historical attempts to today: retained FCM acceptance is
history, not current delivery. The [historical provider activation report](WP260_A_PROVIDER_ACTIVATION_PREFLIGHT_20260919.md)
must not override today's memory transport observation.

## Focused verification

All runs passed without provider traffic or device interaction:

- Backend `node --import ./test_setup.js --test`: **30/30**, zero skips,
  covering `push_sender`, `staging_notification_recipient_gate`,
  `auth_session_actions`, `refund_notification_truth`, `deploy_fcm_gate` and
  `validate_fcm_staging_secret` tests in `backend/test/`.
- `node --test`: **24/24**, zero skips, covering
  `wp260a_notification_allowlist_wiring`, `firebase_device_services_opt_in_wiring`,
  `wp200_device_service_truthfulness`,
  `rw16_session_transition_principal_epoch_wiring` and
  `validate_wp125_push_registration_recovery` in `test/tool/`.
- `flutter test --no-pub`: **45/45** across
  `test/foreground_push_host_test.dart`,
  `test/rw16_session_transition_principal_epoch_test.dart`,
  `test/notification_cta_resolver_test.dart` and
  `test/notification_settings_write_queue_test.dart`.

No full regression, new PostgreSQL fixture lifecycle, FCM request or browser
login was run. Existing shared changes were preserved.
After these test runs, a separate package began editing
`lib/services/firebase_runtime.dart`; the results above do not validate those
later bytes. Its final owner must include the affected push/session tests in
that package's focused closure.

## Smallest next modules

1. In an authorized isolated two-role lane, prove booking/message commit ->
   outbox -> recipient inbox -> read/unread -> correct CTA, including replay,
   foreign-session rejection, logout and restart; keep external delivery off.
2. For native push, bind the exact candidate/device, consent, current token
   ownership, FCM configuration/recipient allowlists and approved transport
   before any send. Then separately prove provider acceptance, each required
   device state, tap, token rotation, opt-out and logout cleanup.
3. Keep Web pilot acceptance explicit: use inbox evidence for browser
   notifications; any new Web-Push implementation is a separate product scope.
   Neither this audit nor retained FCM history authorizes activation.
