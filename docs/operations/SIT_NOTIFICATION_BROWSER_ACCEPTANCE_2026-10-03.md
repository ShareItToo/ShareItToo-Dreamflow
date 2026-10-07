# Notification browser acceptance — 2026-10-03

## Result and boundary

PASS for the provider-off synthetic production-widget/browser-storage seam.
Not a Staging, release-build, provider-delivery or complete browser-process
restart certification. No accounts, devices, providers, runtime configuration,
deployment, commits or pushes were changed by this package.

Repository: `SIT-master-workflow-20260808`, branch
`codex/master-workflow-20260808`; final verification base
`f3cf4302af534fe15e0224fd253126d70ddf96af` plus this package's working-tree files.
The pre-existing foreign capsule, auth/Firebase/password files and privacy
manifests were not edited.

## Proven behavior

- Production `NotificationsScreen`, `NotificationDetailScreen` and real internal
  destinations, using synthetic owner/renter/foreign records; backend disabled.
  Only recipient rows render; foreign feed requests reject.
- Opening a row persists read status. Destroying the widget tree and resetting
  the SharedPreferences cache preserves that state and exactly two owner rows.
  Chrome uses the actual `shared_preferences_web` localStorage adapter, explicitly
  registered in test support; VM tests use the standard memory mock.
- Owner booking → owner request detail; owner message → message thread; accepted
  renter booking → renter booking detail. A hostile external `actionUrl` fixture
  does not replace these internal destinations.
- Account-security notification **alone** reloads the correct successor inbox,
  for both another principal and a replacement session of the same principal.
  Old captured row/CTA callbacks do not adopt successor credentials or change
  the old notification's read state. Open detail and downstream CTA routes close.
- Exact AuthService session clear (provider cleanup disabled) closes private
  detail/inbox and invalidates its captured owner.
- At 390×900 and 1024×900, 200% text scale: no layout exception, notification
  semantics expose a button, title and `Ungelesen`/`Gelesen`; keyboard Tab reaches
  the row, Enter opens it, and returning reads the changed semantics. Normal-scale
  rendering is also exercised by the lifecycle/CTA cases.

This is semantic-tree and synthesized-key acceptance, not human VoiceOver/NVDA
testing. The persistence check is widget/cache restart readback in the same Chrome
process, not browser relaunch. Outbox/provider replay, committed-event durability,
and server rejection of revoked sessions remain the separate PostgreSQL package;
this UI seam does not replace that proof.

## Test-first fixes

Original screen: lifecycle baseline 1 pass / 5 failures. Detail routes survived
logout/principal/same-user-session change; button/read semantics were absent;
category headers overflowed by 44/76 px at 390 px and 200% text. Two additional
old-row callback tests each failed before their specific fix.

Only production file changed: `lib/screens/notifications_screen.dart`. Reuse the
existing session-owner controller for row/detail/CTA ownership; renew and reload
on account-security changes; discard stale loads; serialize initial/return
refreshes; provide read/button semantics; allow category header text to wrap.
No shared auth, provider, data-service or privacy behavior was changed.

## Decisive verification

Flutter 3.41.7 / Dart 3.11.5; Google Chrome 154.0.8037.93. Final checks:

```sh
flutter analyze --no-pub lib/screens/notifications_screen.dart test/notification_inbox_acceptance_test.dart test/support/notification_browser_store.dart test/support/notification_browser_store_stub.dart
flutter test --no-pub test/notification_inbox_acceptance_test.dart test/notification_cta_resolver_test.dart test/messages_notification_settings_test.dart test/notification_settings_write_queue_test.dart test/support_case_principal_epoch_test.dart --reporter expanded
/usr/bin/sandbox-exec -p '(version 1)(allow default)(deny network-outbound)(allow network-outbound (remote ip "localhost:*"))' /opt/homebrew/bin/flutter test --no-pub --platform chrome --dart-define=SIT_BACKEND_ENABLED=false test/notification_inbox_acceptance_test.dart --reporter expanded
```

Analyzer: no issues. Focused VM suite: 69/69. Sandboxed Chrome: 11/11.
`git diff --check`: clean. Chrome is Flutter's isolated temporary test profile,
not an authenticated user browser; the sandbox denies external network.

SHA-256 of production screen:
`65069d6aa922acabd7f44f9b3ddf6ef42fbed64d24d102de52c319f8fbb8bf30`.
Acceptance test:
`ff0d704bd4f615ab3792cf946c22e99dd224f172c1691125a23b110af2e39ef4`.

## Next

Review the screen-only diff and acceptance test. Before claiming full browser
restart/release accessibility closure, run a dedicated isolated release-Web
harness with page/browser relaunch and assistive-technology readback. Before any
external delivery claim, use the separately authorized native provider/device
gate; this package neither enables nor certifies Web Push/FCM/SMTP.
