# Staging email/password authentication: bounded audit

Decision: **FIX for the complete normal-user Staging journey**. Existing login,
recovery and session source is present; the current runtime deliberately closes
normal registration and does not deliver email. No source bug was changed.

## Scope and evidence identity

- Project: ShareItToo/SIT; branch `codex/master-workflow-20260808`.
- Inspected source: `fd90df58bf1450ac2268b5740e545b6b301b2184`.
  At final readback HEAD was `c9e9a23f66594f5ad6acb16ff0bfef46a1d9a1d7`;
  the inspected auth source and five Flutter test files were unchanged between
  those commits. This is an audit source binding, not a deployed-client claim.
- Fresh read-only runtime/config observations: 2026-10-03, approximately
  12:50–12:55 UTC. Public `/api/version` reports
  `6c0ef70db2656df3e378add858d5f5157388127e`, environment `test`.
- Captured Staging container:
  `ca772102b7b3ce9d9cf17e06eb7d75705f42b118c5e9783af5749663dcafe062`;
  Docker image ID
  `sha256:16a90e4fbc3710e37c9e319fe5db545d6da6348448848c94c6bfc661eac47357`.
  Runtime `src/app.js` SHA-256:
  `a83d3c86c396a47a7e5b93e321244532abaad9cd50f07d842085a80846cabb66`.
- Inspection used the saved project SSH target, Docker inspect and Node imports
  within that immutable container. Only boolean/count/config classifications
  and the credential-free registration guard were emitted. No remote files,
  accounts, sessions, messages, provider settings or deployments were created.

## Journey comparison

| Step | Current source and test evidence | Fresh runtime / remaining proof |
| --- | --- | --- |
| Register | `lib/screens/register_screen.dart`, `lib/services/auth_service.dart` submit the four consent facts; `backend/src/app.js` exposes `/v1/auth/register`, consent persistence and limited unverified session creation. Exact `403 staging_registration_disabled` is mapped to invited-pilot feedback. | Access gate is enabled and valid, with six allowlisted user IDs. The actual runtime `assertStagingRegistrationClosed()` unconditionally rejects normal registration whenever that gate is enabled. No bounded email/password enrollment exception exists in this path. |
| Verify email | Request and single-use confirmation routes, limited capabilities before verification, 24-hour action token, and HTML result are implemented. `backend/src/mailer.js` derives the confirmation link from `publicBaseUrl`. | `PUBLIC_BASE_URL` matches `https://staging.shareittoo.com/api/v1`; `MAIL_TRANSPORT=memory` creates JSON mail and sends nothing externally. A mailbox/confirmation journey is not verified. |
| Login | `/v1/auth/login` checks active account, password, Staging allowlist and MFA; wrong credentials update counters; successful login issues a session. Client performs principal-bound remote session handling. | No fresh login was attempted. The October 1 fixture proof is historical API evidence only, not this runtime's normal-user browser acceptance. |
| Forgot/reset password | UI calls `/auth/password-reset/request`; API returns generic 202, deliberately masking account existence/delivery errors. Reset requires a live owner-bound single-use token and revokes the target account's sessions/refresh tokens/push bindings. | Memory mail prevents mailbox recovery. The UI title `E-Mail gesendet` and a 202 response must not be treated as delivery evidence. SMTP host is configured, credential presence is false; this alone does not prove SMTP is unusable because approved relays can use other authentication. External recipient gate is inactive under the current memory transports; one email is configured, without establishing approved recipient identity. |
| Return to Web | `backend/src/account_actions.js` uses `config.appPublicUrl` for the `ShareItToo öffnen` result-page link. | Runtime `APP_PUBLIC_URL` has scheme `http:` and neither Staging nor public ShareItToo hostname. Thus the result-page return target is not the Staging browser origin. Its private value was not retained. |
| Logout/session | Logout revokes the referenced session; refresh rotates tokens and rejects reuse; password reset revokes only the target principal. Flutter tests cover bounded logout and logical-session identity drift. | Fresh browser persistence, expiry/refresh, logout and post-logout protected-route rejection remain unverified. |

## Smallest next module

Prepare a **source-only closed-cohort email/password enrollment contract** that
preserves the active access gate: exact invite/enrollment eligibility, consent
facts, duplicate/replay behavior and atomic admission of the newly created
principal. Merely removing `assertStagingRegistrationClosed` is insufficient:
new random user IDs would still not satisfy later login/refresh/verification
allowlist checks, and disabling the gate would widen the entire Staging lane.
Keep this proposed successor default-off until separately accepted.

Then bind an approved transactional-mail lane and the Staging Web return origin;
verify the exact recipient cohort and transport privately before any controlled
delivery. The complete acceptance must cover register → mailbox verification →
login → forgot/reset → old-password rejection → new-password login → logout and
revoked-token rejection. Registration/source work alone cannot close mail or
browser evidence. No provider activation or deployment is authorized by this
audit.

## Focused verification

- Backend: **28/28** using `node --import ./test_setup.js --test` with
  `account_security`, `auth_session_actions`, `email_verification_gate`,
  `staging_mail_recipient_gate`, and `mailer_disabled` test files.
- Access gate: **6/6**, `backend/test/staging_access_gate.test.js`.
- Flutter: **17/17**, `registration_backend_error_mapping_test.dart`,
  `auth_registration_consent_test.dart`, `password_reset_feedback_test.dart`,
  `auth_logout_resilience_test.dart`, `auth_session_identity_test.dart`.
- These are local synthetic/unit/widget/source-contract checks; no fresh
  PostgreSQL HTTP integration, real mail, browser auth, Android or release
  completion is claimed. The first Flutter invocation did not retain a terminal
  result; only the captured subsequent `--no-pub` run supports 17/17.
- Skills used: Project Context Router selected the verified SIT checkout;
  ShareItToo Product Guardrails kept source, runtime and release proof separate.
  No pilot product rule is altered by this documentation-only audit.
