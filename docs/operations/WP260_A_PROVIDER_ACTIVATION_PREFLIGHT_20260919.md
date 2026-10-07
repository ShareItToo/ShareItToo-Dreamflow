# WP260-A provider activation — Staging-only PASS; external provider evidence bounded

## Bound source and image

The exact source was committed and pushed on branch
`codex/master-workflow-20260808`:

- source: `727faf9148aee6ac9c4f7667f675f65b83e48719`
- temporary image: `shareittoo-api-wp260a:727faf9148aee6ac9c4f7667f675f65b83e48719`
- image digest: `sha256:b8ee9e99e109abc923017fa8838b2942f4e7dde1a3e1bb37aa56082cbe4e6e60`

The source adds a fail-closed Staging recipient gate for SMTP and FCM, with
worker-time user checks, exact allowed mailbox checks, and push token-hash
filtering. Focused source tests are 10/10 PASS; static allowlist wiring is 2/2
PASS; diff-check is PASS.

## Read-only Green inventory and isolated activation

Before the switch, the canonical Green container was WP257 (`7887c7c…`), with
`MAIL_TRANSPORT=disabled`, `PUSH_TRANSPORT=memory` and `PAYMENT_TRANSPORT=memory`.
The bounded inventory had no pending/retry/processing outbox rows, six
historical dead email rows, and one enabled Pixel registration. Those six dead
rows were quarantined as `suppressed` with a matching audit record before the
worker was enabled; no token content was retained.

The exact WP260-A image was then run as the canonical internal Green API with
the existing database, uploads volume, MFA file mount and `--group-add 65532`.
A dedicated non-internal bridge `sit-staging-provider-egress` was created. Its
only member is the canonical API; PostgreSQL is not attached. The API remains
on the private Green network for database access and has no host port or new
inbound route. The mounted Firebase file passed the staging validator and is
readable only through the existing secret mount (`640`, group `65532`).
Current readback is healthy with `MAIL_TRANSPORT=smtp`,
`PUSH_TRANSPORT=fcm`, Firebase project `shareittoo-staging`, Firebase Auth and
Phone verification disabled, payment still memory-only, and identity
verification disabled.

## Provider evidence

One fresh verification email was sent only to the allowlisted controlled
mailbox `contact@shareittoo.com`. SMTP returned `250 2.0.0 OK` with one
accepted and zero rejected recipients. Gmail readback in that mailbox showed
the new `Bestätige deine E-Mail-Adresse bei ShareItToo` message from ShareItToo
at the controlled probe time. The token/link value was not retained, and the
synthetic token was not consumed because it was not bound to a staging user;
this is provider acceptance/inbox evidence, not a claim of account
verification.

One fresh renter message on the existing allowlisted Staging thread created a
push outbox event. After a transient worker retry and a controlled drain, the
authoritative row was `push=sent`, attempt 4, provider `fcm`, contract `v52`,
with a Firebase provider message id; the matching in-app row was `sent`. The
Pixel 7 Pro showed the neutral V5.2 notification contract
`Neue ShareItToo-Aktualisierung` / `In der App ansehen.`. Tapping `Öffnen`
opened the in-app `Benachrichtigungen` screen on the `Nachrichten` tab, where
the new renter notification was visible. Sender identity stayed in the
authenticated in-app detail, not in the lock-screen payload.

The first ad-hoc replacement script emitted a false-negative post-switch
status and the API later needed one restart after a transient PostgreSQL
`ETIMEDOUT`; current readback after restart is healthy and the rollback
container remains stopped. This is recorded as deployment-tooling technical
debt, not hidden as a permanent prerequisite or release proof.

## Gate result

`WP260-A = STAGING_PROVIDER_ACTIVATION_PASS_WITH_TECHNICAL_DEBT`.

No Firebase Auth/Phone/Analytics activation, payment, Store, Production, DNS,
Play, OnePlus or public-registration change occurred. Stripe/Identity remain
separate read-only/provider gates. SMTP one-time account verification remains
unproven by design because the controlled probe token was synthetic and not
stored.

Evidence: `docs/evidence/release-readiness/wp260-a-provider-activation-preflight-20260919.json`.
