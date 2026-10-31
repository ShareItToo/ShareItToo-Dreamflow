# Staging password invitation — Web entry (source only)

## Boundary

This adds a client for the existing one-time enrollment contract in
`SIT_PASSWORD_ENROLLMENT_SOURCE_CONTRACT_2026-10-03.md`; it does not activate it.
`SIT_WEB_PASSWORD_ENROLLMENT_ENABLED` defaults to **false**. No build/deployment
configuration enables it. Visibility and submission additionally require Web,
backend enabled, the exact HTTPS Staging origin and `/api/v1` base URL, internal
release channel, private-pilot enabled, and real payments disabled. Debug-only
widget seams are ignored in release builds. The backend invitation flag, static
access gate, authoritative invitation/email/principal binding, expiry, replay
and rate limits remain independent mandatory server authority.

Ordinary registration is unchanged and stays closed by the active server gate.
There is no URL invitation parser, automatic redemption, retry, account lookup,
mail trigger beyond the existing authorized server transaction, provider change,
or client allowlist assertion. The code uses the existing unauthenticated POST
`/auth/register`, adding only `enrollmentToken` to the unchanged registration
fields and four consent facts with `Kostenlos registrieren` as the action label.

## Transient secret and session handling

The obscured invitation input disables suggestions, personalized learning and
autofill. Pasted surrounding whitespace is trimmed before a hard 43-character
limit. Editing clears a displayed validation error. Opening and returning from
the platform terms/privacy notice preserves the in-memory code, allowing legal
reading without forced re-entry.

Every submission clears the controller before form validation or network work.
Local token references are released after handoff and on completion; the request
map is cleared on success, failure and principal drift. Social/login switches
and disposal clear the controller. No invitation enters app preferences, URL,
analytics, crash reporting or application logs. Unknown errors and server denial
produce neutral messages; they do not claim that no account was created. This
proves reference/controller/payload release, **not zeroization of immutable Dart
Strings, transport buffers or browser-managed memory**.

The existing remote-auth transaction rejects an existing/uncertain stored
session and checks action/session epochs before request, before persistence and
after persistence. Superseded attempts revoke only their own remote/locally
persisted session; post-registration UI work rechecks the exact owner.

## Verification and remaining activation boundary

Synthetic VM and Chrome tests cover all gate negatives; exact payload/consent;
invalid token, missing facts and wrong label; transport error; stale actions
before/after request and after persistence; controller clearing; legal-link
round trips; paste cap; error clearing; disposal; and token-bearing exception
redaction. Source-wiring tests bind the tested helper to the real HTTP path,
release-only authority and unchanged ordinary registration handling.

Local result on 2026-10-03: VM **33/33**, Chrome **33/33**, wiring **6/6**;
focused analyzer, formatter and diff-whitespace checks passed. These are
synthetic/source checks, not live enrollment acceptance.

Run the focused package:

```sh
flutter test --no-pub test/staging_password_enrollment_client_test.dart test/staging_password_enrollment_ui_test.dart test/register_consent_ui_test.dart test/registration_backend_error_mapping_test.dart test/remote_auth_attempt_transaction_test.dart
flutter test --no-pub --platform chrome test/staging_password_enrollment_client_test.dart test/staging_password_enrollment_ui_test.dart test/register_consent_ui_test.dart test/registration_backend_error_mapping_test.dart test/remote_auth_attempt_transaction_test.dart
node --test test/tool/staging_password_enrollment_client_wiring.test.mjs test/tool/registration_closed_pilot_wiring.test.mjs
flutter analyze --no-pub lib/services/staging_password_enrollment_client.dart lib/services/auth_service.dart lib/screens/register_screen.dart test/staging_password_enrollment_client_test.dart test/staging_password_enrollment_ui_test.dart
```

No live account, invitation, email, browser enrollment, verify/reset flow,
provider or deployment was exercised. APP_PUBLIC_URL and SMTP remain outside
this package. Current privacy/retention manifest rebinding belongs to Sol's
shared closure after final source bytes; this package does not edit them.
