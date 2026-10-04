# Facebook Web W2 — dormant acquisition contract

Review base: `4ecb0a47596a6cfead0be96567c9d7062780d357` plus the separately accepted local W1 source package documented in `docs/operations/SIT_FACEBOOK_WEB_W1_CONFIG_CONTRACT_2026-10-03.md`. W2 adds acquisition; it does not supply provider evidence or activate a candidate. The W1-only document remains the historical package boundary.

## Source and authority

- `lib/services/web_facebook_auth.dart`: controlled `FirebaseAuth` dependency; `FacebookAuthProvider` popup with only explicit `email` scope; reads only Firebase UID and a force-refreshed Firebase ID-token result. Never reads credential, additionalUserInfo, providerData, Meta access/client tokens or raw SDK messages/customData.
- `lib/services/auth_service.dart`: Facebook Web gate requires its existing feature flag plus W1 `webFacebookConfigurationReady`. Acquisition rechecks readiness and principal before popup, after popup and after token read. A client-side fresh sign-in-provider mismatch is rejected; this metadata is not authoritative verification.
- The unchanged existing remote-auth transaction sends the Firebase ID token with existing consent fields to `/auth/social`; the server independently verifies revocation/claims and derives provider identity. No client provider label or Meta material authorizes an account. Popup success alone never persists a SIT session or enrolls a user.
- Acquired UID is captured before the post-popup principal check for cleanup. The unchanged serialized SDK owner/generation predicate signs out only the exact acquired UID and generation. The Web branch never sets the native `facebookAcquired` flag, so it cannot invoke native Facebook logout. A missing user never claims an unrelated current Firebase user for cleanup.
- Cancellation and operational errors use bounded typed codes only. Principal loss overrides a late failed/cancelled popup. SDK-instance failures before adapter entry are also sanitized.
- The Google popup segment, complete native acquisition segment and existing transaction/cleanup segment are byte-identical to the review base. No Apple, backend-production, notification, stage profile, build/deploy, shared manifest or provider-console changes belong to W2.

The source interface follows the installed locked Firebase SDK (`firebase_auth` 6.5.7; `firebase_auth_platform_interface` 9.0.6): `FacebookAuthProvider`, `User.getIdTokenResult(true)` and `IdTokenResult.signInProvider`. It is not a claim about current console configuration.

## Reproducible focused checks

```sh
flutter test --no-pub test/web_facebook_auth_test.dart test/web_google_auth_test.dart test/remote_auth_attempt_transaction_test.dart test/social_auth_release_gating_test.dart test/social_auth_button_truth_test.dart
flutter test --no-pub --platform chrome test/web_facebook_auth_test.dart
flutter analyze --no-pub lib/services/web_facebook_auth.dart lib/services/auth_service.dart test/web_facebook_auth_test.dart
node --test test/tool/web_facebook_auth_wiring.test.mjs test/tool/web_facebook_config_wiring.test.mjs test/tool/web_google_auth_wiring.test.mjs test/tool/facebook_android_config_wiring.test.mjs test/tool/validate_social_provider_activation.test.mjs
# From backend/
node --import ./test_setup.js --test test/facebook_web_auth_contract.test.js test/firebase_social_auth.test.js
```

Flutter VM: 84 tests passed, no skips. Chrome: 35 controlled SDK-seam tests under actual `kIsWeb=true`, including UI semantics and unavailable/ready click truth; no real popup/provider/account session. Node: 23 source-consumer/native-gate checks and 11 backend checks. Backend coverage includes real loopback HTTP requests proving that only `idToken` reaches verification, synthetic verified-claim positives/negatives and the unchanged Google-only Staging new-registration guard. No PostgreSQL or live authentication result is implied. Focused analyzer and secret/whitespace checks pass.

Current `auth_service.dart` SHA256: `40b427ac7f89dd3e73912e3305318f66b8b4a1a9fa7bd75612fae1984d81d420`. Sent to the coordinator's shared privacy/retention-closure owner; W2 does not refresh those concurrently owned manifests. Source review and combined closure remain required before commit. Any eventual provider activation and real browser login/enrollment proof remain separate gates.
