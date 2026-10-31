# Facebook Web W1 — dormant configuration/startup contract

Base: `df45cc74e794eb3c418c5da1d5a2bf617d3ae3e1`. Scope: the authorized W1 successor to `docs/operations/SIT_FACEBOOK_WEB_SOURCE_FIX_MAP_2026-10-03.md`, not acquisition or activation.

## Contract

`lib/services/web_facebook_auth_config.dart` owns separate Facebook public inputs. It reuses only the existing Google public-option shape/digest encoding, never Google's enablement or approval. No real values or accepted provider evidence are supplied.

All Facebook inputs are empty/off by default. Required environment names:

- `SIT_FACEBOOK_WEB_PROJECT_ID`, `SIT_FACEBOOK_WEB_SENDER_ID`, `SIT_FACEBOOK_WEB_APP_ID`, `SIT_FACEBOOK_WEB_API_KEY`, `SIT_FACEBOOK_WEB_AUTH_DOMAIN`, `SIT_FACEBOOK_WEB_BACKEND_PROJECT_ID`, `SIT_FACEBOOK_WEB_ORIGIN`, `SIT_FACEBOOK_WEB_CONFIG_SHA256`.
- `SIT_FACEBOOK_WEB_READINESS_JSON` and `SIT_FACEBOOK_WEB_READINESS_SHA256` (SHA256 of the exact UTF-8 JSON bytes, supplied independently by the reviewed external configuration process).
- Existing `SIT_SOCIAL_FACEBOOK_ENABLED`, `SIT_SOCIAL_PROVIDER_ACTIVATION_VALIDATED` and backend enablement must all be true. The native validated bit by itself is insufficient.

Readiness JSON version 1 allows exactly these fields, with no extras:

| Field | Required binding |
| --- | --- |
| `schemaVersion`, `provider`, `platform` | integer `1`, `facebook`, `web` |
| `origin` | exact `https://staging.shareittoo.com` |
| `backendFirebaseProjectId` | same backend project as the approved public config |
| `webAppConfigSha256` | exact approved public-config digest |
| `callbackUrl` | exact `https://<bound-auth-domain>/__/auth/handler`, no trailing slash |
| `firebaseProviderEnabled` | boolean true from readback |
| `metaAppMode`, `audience`, `audienceVerified` | `development`, `app_roles_only`, boolean true |
| `providerReadbackSha256` | SHA256 of the externally retained, reviewed provider relationship/mode/audience readback; no account locators or secrets in this JSON |
| `observedAtUtc`, `validUntilUtc` | canonical UTC seconds; observation <= injected/current clock < end; end > observation |

The explicit review validity interval is required; the source invents no implicit freshness duration. Missing, expired, future-dated, malformed, native-only, foreign, unknown/public-mode or digest-mismatched evidence fails closed. Other Meta modes/audiences require a separately reviewed successor, not an inferred private-pilot approval. Hash equality is not a signature and is not live verification; an operator hashing guessed values is never valid provider evidence.

## Selection and startup

`lib/services/web_firebase_auth_startup.dart` selects one bound Firebase app. All-off returns none. Google-only retains the existing Google contract without requiring Facebook evidence. Facebook-only can select its own approved synthetic app without any Google configuration. If both are requested, both must be valid and match project, app, sender, API key and auth domain exactly; otherwise no SDK initialization occurs. A missing requested provider never silently borrows the other's app.

`lib/services/firebase_runtime.dart` consumes that selection only in its Web branch, captures selected options for initialization, checks an existing default app against those exact options, then requires the existing memory-persistence callback. Failures never mark auth readiness. Readiness getters re-evaluate the current evidence/clock, so an expired Facebook binding no longer reports configuration readiness. Startup carries no principal, acquired user/token or SIT session. Native service readiness still returns false on Web; push, Crashlytics and installations are not started.

The existing Google-named memory callback remains a compatibility facade: it checks the selected options and sets Firebase `Persistence.NONE` through the existing SDK mutation queue. `auth_service.dart`, `main.dart` and the Google acquisition helper are unchanged. Facebook UI and acquisition remain unavailable in Web. Apple/native Facebook, stage profile, build/deploy and console state are unchanged by W1.

## Focused verification

- `flutter test --no-pub test/web_facebook_auth_config_test.dart test/web_google_auth_test.dart test/services/firebase_runtime_config_test.dart test/remote_auth_attempt_transaction_test.dart`: 138 passed, no skips. These are deterministic contract/SDK-callback seam tests, not live browser authentication.
- `node --test test/tool/web_facebook_config_wiring.test.mjs test/tool/web_google_auth_wiring.test.mjs test/tool/facebook_android_config_wiring.test.mjs test/tool/validate_social_provider_activation.test.mjs test/tool/validate_firebase_release_config.test.mjs`: 42 passed, no skips.
- Focused `flutter analyze --no-pub` on the three W1 Dart source files and new test: no issues.

Current consumer inventory: `firebase_runtime.dart` is hash-bound by `store/privacy-disclosures.json` and `store/retention-deletion-readiness.json`. Their joint refresh/closure belongs to the coordinator after merging concurrent source work; W1 does not rewrite historical evidence or parallel package manifests.

NEXT: source review and combined current-consumer closure; only then a separately assigned FB-W2 acquisition/cancellation/principal-cleanup package. W1 provides no provider activation, enrollment, browser/live-auth or deployment proof.
