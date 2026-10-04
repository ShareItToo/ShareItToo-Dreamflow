# Apple Web W2 — dormant acquisition contract, real flow blocked

Base: `b645101c6c7993e8697cf72d6e5632affb141a09` on
`codex/master-workflow-20260808`. W1 configuration remains independently bound
by `docs/operations/SIT_APPLE_WEB_W1_CONFIG_CONTRACT_2026-10-03.md`.

## Decisive installed-SDK limitation

The installed locked packages are `firebase_auth` 6.5.7,
`firebase_auth_platform_interface` 9.0.6 and `firebase_auth_web` 6.2.6.
Their source was read directly, not inferred from native Apple support:

- Platform interface `lib/src/providers/apple_auth.dart` supports
  `AppleAuthProvider` with explicit `email`/`name` scopes and popup acquisition.
- Platform interface `lib/src/additional_user_info.dart` exposes nullable
  `authorizationCode`, documented there as Apple-platform-only.
- Web SDK `lib/src/utils/web_utils.dart`, `convertWebAdditionalUserInfo`, copies
  `isNewUser`, `profile`, `providerId` and `username` but **omits authorizationCode**.
  Exact installed file SHA256:
  `b91bfb9ebfa68427649ad4566418113eefa7a37d345ef937d1f12fae1446e2e9`.
- `User.getIdTokenResult(true)` and `IdTokenResult.signInProvider` are supported
  by the installed SDK; the adapter uses them for forced refresh and a local
  Apple mismatch guard. The backend still verifies identity independently.

Consequently the installed real Web popup cannot supply the required code
through this interface. **Real Apple Web acquisition/revocation is BLOCKED**.
Provider/console/code exchange/deletion readiness remains **NOT VERIFIED**.
Synthetic fixtures that supply a code exercise a future-compatible contract;
they do not show this SDK returning a code or the provider accepting reuse.
The installed-SDK Node check deliberately detects drift requiring review.

## Standalone source contract

`lib/services/web_apple_auth.dart` has no production consumer, no global SDK
lookup, no environment flags and no configuration/provider approval of its own.
The caller injects `FirebaseAuth`, a dynamic W1 readiness predicate, a
principal/action/SDK-generation guard and an exact acquired-UID callback.
The adapter requests only explicit `email` and `name` scopes. Name/profile
values are never read, stored or submitted by this adapter.

The sequence is guarded preflight → popup → capture acquired UID → guard →
force-fresh Firebase ID-token result → guard → `apple.com` mismatch check →
guard → narrow `additionalUserInfo.authorizationCode` read → guard → material.
Readiness and the exact current Firebase UID are rechecked at each post-popup
boundary. Capture happens before the first post-popup ownership check so the
caller knows which acquired identity needs owner-safe cleanup after failure.
There is no retry, direct sign-out, backend call or local-session persistence.

Only `idToken` and `appleAuthorizationCode` enter `toBackendPayload()`.
Tokens must fit the backend's 100–12000-character bound; trimmed codes must
be nonempty and at most 12000 characters. Missing code is a hard
`missing_authorization_code` failure. Credential/access-token/refresh-token,
profile and providerData fallbacks are forbidden. The object holds transient
exchange values in memory and its string representation is redacted; callers
must never log or persist it or its returned payload. It supplies no consent,
registration permission, caller provider label or identity claims.

Errors expose only `web_config_unavailable`, `missing_firebase_user`,
`provider_mismatch`, `missing_firebase_id_token`, `missing_authorization_code`,
`popup_cancelled` or `popup_unavailable`. Principal/generation loss throws the
existing `RemoteAuthAttemptSuperseded`. SDK exception messages, credentials,
custom data and profile details are not retained or interpolated.

## Backend and integration boundary

The unchanged `/auth/social` route independently verifies the Firebase token,
derives Apple subject/provider, normalizes `appleAuthorizationCode`, rejects
client refresh material, and checks the existing staging allowlist. The
new-registration exception remains Google-only. Existing Apple flow exchanges
the code server-side with the verified subject, encrypts refresh material and
uses the existing deletion/revocation machinery. W2 changes none of this.

Tests compose the new seam with `RemoteAuthAttemptTransaction` to prove that
failed acquisition cannot exchange/persist and late principal changes discard
the exact issued/session result. Production queue/cleanup wiring is not added:
a future integration must preserve the existing serialized SDK generation and
`AuthService.shouldCleanUpPhoneIdentity` exact-UID predicate so a successor
identity cannot be signed out. It must also recheck W1 freshness immediately
before acquisition, retain memory-only Firebase persistence and bind the
Firebase app without borrowing Google/Facebook approval.

An eventual SDK/backend-compatible code path needs a separately reviewed
design and genuine provider evidence, including nonce handling, code lifetime,
audience/redirect binding, refresh acquisition and deletion/revocation. Do not
substitute Firebase's credential access token, invent a code, reuse a consumed
code or change dependencies/provider settings to make synthetic tests pass.
No W2 browser seam result authorizes runtime/UI/build/provider activation.

## Focused verification commands

```sh
flutter test --no-pub test/web_apple_auth_test.dart test/web_apple_auth_config_test.dart test/remote_auth_attempt_transaction_test.dart
flutter test --no-pub --platform chrome test/web_apple_auth_test.dart
flutter analyze --no-pub lib/services/web_apple_auth.dart test/web_apple_auth_test.dart
node --test test/tool/web_apple_config_boundary.test.mjs test/tool/web_apple_acquisition_boundary.test.mjs
# From backend/
node --import ./test_setup.js --test test/apple_web_auth_contract.test.js test/apple_revocation.test.js test/apple_revocation_contract.test.js test/firebase_social_auth.test.js
# From repository root
node backend/ops/scan_git_secrets.mjs --working-tree-only
git diff --check
```

The backend test includes a real loopback HTTP rejection before database or
provider effects, source-bound payload/allowlist assertions and deterministic
claim/material checks. The existing revocation tests use synthetic provider
responses; none is live provider, PostgreSQL, deployment or release evidence.
The ShareItToo private-pilot guardrails and all other product flows are unchanged.

Final focused W2 VM **52/52** and actual Chrome **52/52** passed, no skips;
Chrome exercises `kIsWeb=true` with a controlled SDK, not real provider login.
Node boundary/installed-SDK checks **5/5** and backend checks **20/20** passed.
W1 and the existing remote transaction also passed in the initial combined
VM run before the final W2 exception-ownership hardening. Focused analyzer,
working-tree secret scan and whitespace checks are clean. No commit/push,
runtime integration, profile or manifest change belongs to W2.

NEXT: Sol source review, then a narrow Apple Web code-acquisition/revocation
design gate addressing the demonstrated SDK omission. Do not integrate the
adapter into runtime or present synthetic success as an available Apple lane.
