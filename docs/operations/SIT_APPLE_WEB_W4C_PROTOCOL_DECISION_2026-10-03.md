# Apple ownership W4-C: versioned protocol and native coexistence

Date: 2026-10-03. Source HEAD: `75a8782c14209147bd4aac172bd21beb5ca2714c`.
**PASS — decision packet only. W4-D implementation and activation remain FIX/open.**

This packet selects one successor contract, `appleAuth.version = 2`, inside the
real `POST /v1/auth/social` route. It does not implement or enable it. All numerical
limits and protocol choices below are SIT design decisions, not claims about
Apple guarantees. Existing W4-A/B gap evidence remains valid. No provider,
configuration, migration, production source or manifest was changed.

## 1. Fresh facts and capability boundary

| Surface | Verified source behavior | Consequence |
| --- | --- | --- |
| Current Flutter Web | `socialProviderEnabled` does not enable Apple. Dormant W2 helper requires a code; installed Web additional-info conversion omits it. | No functioning Web Apple integration is claimed. |
| Proposed direct Apple JS | Official docs describe code + Apple ID token + state; Firebase accepts Apple ID token with raw nonce. | Candidate can keep code separate from Firebase; actual configured interoperability is NOT VERIFIED. |
| Current Flutter native call site | Calls `signInWithProvider(AppleAuthProvider)` and rejects missing `additionalUserInfo.authorizationCode` before posting. POST also contains consent/action-label fields, not a version, request ID or receipt. | Do not describe current Flutter as a verified code-free Apple client. |
| Installed iOS bridge | Captures `ASAuthorizationAppleIDCredential.authorizationCode`, uses Apple ID token/raw nonce for Firebase and forwards code through Pigeon. | Source-level capability exists; real code exchange, audience and revocation remain NOT VERIFIED. |
| Installed Android bridge | Uses Firebase provider activity; `PigeonParser.parseAdditionalUserInfo` sets no authorization code. | Current Flutter's required-code check cannot be assumed to succeed on Android. No SDK workaround is approved here. |
| Existing backend | Accepts optional Apple code; code-free exact linked identity can reach session issuance. Code exchange precedes transaction; latest ciphertext overwrites the identity slot. | Preserve legacy behavior only where explicitly outside the successor cohort. An additional endpoint cannot close the route bypass. |

Installed versions: `firebase_auth 6.5.7`, platform interface `9.0.6`, Web `6.2.6`.
SDK source is evidence of adapter behavior, not a device/provider run. Relevant
official references, freshly fetched with cache bypass on 2026-10-03, are listed
in section 9. Firebase Web/iOS/Android docs use different revocation examples;
none proves that SIT's one backend client-ID/redirect configuration fits every
platform. Apple REST identifies `client_id` as an App ID or Services ID. Therefore
W4-D v2 acquisition has exactly one configured **direct-Web Services-ID/return-URL
profile**; native profile support is a separate gate, never guessed from a code.

## 2. Eligibility, authority and coexistence decision

- The authoritative tuple is verified Firebase project + UID + `apple.com`
  subject + exact existing SIT auth-identity/account + server configuration
  generation + Services ID + exact redirect. No client-supplied UID, account ID,
  email, platform, provider label or redirect selects authority.
- v2 permits only active, already-linked, allowlisted private-pilot accounts with
  required existing consents. It never registers, email-links, repairs a link,
  replaces a Firebase UID or changes profile data. Missing/mismatched links fail
  before claim/exchange. Preserve suspension, account-erasure and MFA guards.
- A SIT bearer session is neither required nor sufficient for v2. A valid current
  SIT session for another account causes conflict; do not switch it implicitly.
  Same-account sessions are not repurposed as the attempt's new session.
- Every action verifies a Firebase ID token with revocation checking against the
  configured project; require Apple sign-in provider and exact subject/UID. Use
  `iat` age at most 60 seconds, future skew at most 60 seconds, unexpired `exp`,
  and `auth_time` age at most 15 minutes. These are v2 policy limits. Force refresh
  in the client does not itself prove recent authentication; the server checks
  both clocks. The current normalizer's fresh-token option needs the additional
  `iat`-age ceiling; it does not currently impose that ceiling.
- Recheck account, allowlist, enrollment, identity and readiness before provider
  invocation and in the committing transaction. After acquisition, guard failure
  must preserve acquired material for cleanup rather than discard it.

**Server-owned enrollment, not client platform detection, controls coexistence.**

| Server condition | Legacy request without `appleAuth` | v2 request |
| --- | --- | --- |
| Never-enrolled account, successor acquisition OFF | Existing route unchanged, including optional-code backend compatibility | `503 apple_ownership_unavailable`; zero claim/exchange; no automatic v1 retry |
| Never-enrolled account outside pilot cohort | Existing guards/allowlists unchanged | `403 apple_ownership_not_eligible` |
| Enrolled account, successor ready | `426 apple_contract_upgrade_required`, with or without a code; zero exchange/session | Exact v2 operations below |
| Enrolled account, acquisition paused/readiness withdrawn | Still `426`; enrollment is not undone by OFF | Status allowed; no acquire/session; durable cleanup continues under its own exact-profile gate |

Enrollment is durable. Resolve all existing owner candidates (exact subject,
Firebase UID and any legacy email-link target) before choosing the branch;
conflicting owners fail closed. Recheck under locks so a concurrent enrollment
cannot pass through legacy email linking or optional-code login. New-registration
and Google-only enrollment rules remain unchanged. An untrusted `platform=ios`,
missing Origin or a native-looking User-Agent grants no exception.

Thus code-free native **backend compatibility remains unchanged while OFF for
never-enrolled accounts**. Once an account is enrolled, old native clients fail
with upgrade-required rather than bypass ownership. Initial activation may use
only explicitly designated Web test accounts whose native coexistence has been
reviewed; it cannot enroll ordinary cross-platform users silently. Native v2
rollout requires its own client update, profile and code/audience proof. This
packet grants neither enrollment nor native activation authority.

The ownership guarantee is scoped to the enrolled v2 lane; it does not claim to
repair or approve legacy acquisition for other accounts. Existing legacy Apple
ciphertext/outbox obligations must be inventoried before enrollment and retained
as separate obligations with their original configuration provenance. Never
relabel or re-encrypt them as a proven Web Services-ID grant merely because the
same Firebase UID is present. If their exact cleanup profile is unproven, block
enrollment until that provenance/remediation gate is resolved. Account-deletion
completion must aggregate legacy obligations and every v2 material owner.

## 3. Exact v2 request/receipt protocol

All actions use the existing `POST /v1/auth/social`; there is no token/receipt in
a URL or query string. The v2 top-level JSON object has exactly `idToken` and
`appleAuth`. Reject unknown keys, mixed legacy consent/code fields, null/empty
required strings, duplicate JSON keys and non-Apple tokens. Enforce a 32 KiB body
limit and bounded errors; v1 parsing remains its historical contract.

`appleAuth` is exactly one of:

```json
{"version":2,"operation":"acquire","requestId":"<opaque-random-id>","authorizationCode":"<transient-code>"}
{"version":2,"operation":"status","requestId":"<same-opaque-random-id>"}
{"version":2,"operation":"status","receipt":"<server-receipt>"}
{"version":2,"operation":"session","receipt":"<server-receipt>","deliveryId":"<new-opaque-random-id>"}
```

`requestId` and `deliveryId` are 32 random bytes, unpadded base64url (exactly 43
characters, canonical round-trip checked). They are correlation/deduplication
inputs, not proof of identity. A receipt is an independently server-generated
32-byte value with the same encoding, scoped to one attempt. Store only a keyed
lookup digest for lookup, never a plaintext receipt. To return the same receipt on a duplicate/status-by-request-ID,
store its value encrypted in the attempt envelope; it is not an authentication
bearer and never authorizes an action without a fresh matching Firebase token.
Receipt keys and material keys must be domain-separated and versioned.

Firebase token length is 100–12,000 characters; authorization code length is
1–12,000. Store neither raw token nor code. Keep a keyed, domain-separated code
fingerprint, unique across attempts, and a keyed request-ID lookup bound to the
verified principal. Bind the immutable attempt digest to the complete tuple in
section 2, protocol version, server attempt ID and both deadlines below. Refresh
material uses authenticated encryption with that binding as associated data.

### Acquire

1. Before any Apple call, validate eligibility, claim the request/code fingerprint
   durably and issue immutable server timestamps. Exchange-start deadline is
   claim time + 120 seconds; receipt login/status deadline is claim time + 15
   minutes. Neither duplicate nor session delivery extends them. Apple's own
   five-minute single-use limit is independent and may expire earlier.
2. Only a committed `claimed -> exchanging` CAS winner calls Apple, once. No code
   is persisted for retry. A still-claimed process loss can expire without an
   exchange; an exchanging crash/timeout is `unknown`, never reclaimed for a new
   exchange. Use a 20-second transport deadline, but timeout does not prove that
   Apple did nothing. Late material must remain attachable to its exact owner.
3. Durably store encrypted returned material before account/attempt commit. Then
   revalidate the exact existing identity and mark `committed`. In this version,
   `committed` means material is durably owned by the eligible existing account;
   **acquire never issues a SIT session or MFA challenge**.
4. Return the receipt projection only. On any response uncertainty, the client
   must use `status` with its original request ID. It must not automatically
   resubmit the code, start another Apple popup, or fall back to v1. Transport
   duplicates that do arrive resolve the existing claim and never call Apple
   again. Same request ID with changed binding/code, or one code under another
   request ID, returns `409 apple_attempt_conflict` with no new exchange.

### Projection, status and bounded errors

The only receipt success/progress payload is:

```json
{"appleAuth":{"version":2,"receipt":"<server-receipt>","state":"pending","expiresAt":"<UTC-ISO-timestamp>"}}
```

Exact keys remain the same. `state` is one of `pending`, `ready`, `unresolved`,
`cleanup_required`, `closed`; clients must not infer finer internal states.

| Internal ownership state | Public state / HTTP |
| --- | --- |
| `claimed`, `exchanging`, `material_ready` | `pending` / 202; `Retry-After: 2` |
| `committed` | `ready` / 200 |
| `unknown`, ambiguous cleanup outcome | `unresolved` / 409 |
| `cleanup_pending`, cleanup in flight | `cleanup_required` / 409 |
| Expired unexchanged claim or confirmed terminal cleanup | `closed` / 410 while the receipt is still within its read deadline |

`ready` describes durable material commitment, not permission to bypass a current
pause/readiness/MFA/account check when requesting a session.

Status requires current token authorization and account eligibility; a receipt
alone never works. Missing, foreign-principal and deadline-expired lookups all
return `404 apple_attempt_unavailable`, with no receipt or owner detail. Invalid
token is `401 invalid_social_token`; revoked eligibility is a generic 403. Lookup
must check ownership before returning state. Status never acquires material,
creates a session, repairs identity or mutates a missing request into a claim.

All v2 responses use `Cache-Control: no-store`. Error responses use the current
bounded `errorPayload` envelope with no provider text/details or identity fields.
The operational HTTP request ID is distinct from the private attempt request ID;
only the former may enter existing request logs. Suppress request/response bodies,
Authorization values and receipt/code/token values from telemetry and traces.
The v2 status operation needs a separate bounded read budget in addition to the
unchanged outer IP/auth guards: at most 30 status reads per minute per verified
principal and receipt/request-ID pair. The client backs off at least 2, 4, 8, then
30 seconds, stops on terminal/unresolved/404, and obeys 429 `Retry-After`. It must
not exhaust the existing failed-social-login budget by polling an error state.

A missing status result is not proof that an earlier request cannot still arrive.
The client waits/polls within the fixed deadline, then reports unresolved login
without replay. Server eligibility/deadline checks and unique claims also cover
late HTTP execution. A genuinely new user-initiated attempt cannot erase older
obligations; a principal with unresolved `exchanging`/`unknown` ownership is
blocked from new acquisition pending reconciliation, not automatically retried.

## 4. Fresh session after committed-response loss

`session` requires a ready, unexpired receipt and newly read force-fresh Firebase
token satisfying section 2. No authorization code is accepted. Never call Apple.
Lock the account, attempt and delivery journal; repeat identity, allowlist,
readiness, account-status, consent and MFA checks in the same transaction.

- First `deliveryId`: use existing `issueSession` semantics, or existing MFA
  challenge semantics when required. Persist only the delivery-ID digest, order,
  issued session ID/refresh-family reference or MFA challenge-row/hash reference,
  and bounded outcome. Existing refresh-token hashing remains unchanged. The
  journal contains no access/refresh token or raw MFA challenge.
- Successful non-MFA response is exactly the receipt projection plus `session`,
  whose fields are the current `issueSession` result. Successful MFA response is
  exactly the projection plus `mfaRequired:true`, `mfaChallenge`, and top-level
  `expiresAt` for that challenge. An MFA challenge is not a session or satisfied
  second factor. No verification-email/profile mutation is introduced by v2;
  account eligibility must already satisfy this pilot's prerequisites.
- Duplicate same `deliveryId` returns `409 apple_session_delivery_uncertain`
  and no bearer/challenge value, even if the first HTTP response was received.
  It creates nothing. A client needing recovery explicitly submits a new random
  delivery ID with a fresh token, rather than replaying an unknown response.
- A new delivery ID atomically revokes/consumes the preceding delivery's session
  and refresh family or challenge before issuing a replacement. It must not
  revoke unrelated account sessions. Maximum three delivery generations per
  receipt; a fourth fails `409 apple_session_delivery_exhausted`, no automatic
  new Apple attempt. Ordinary session limits/rate limits still apply.
  Acceptance must prove the old access token and refresh family are actually
  denied by current auth/refresh middleware, not only that a DB flag changed.
- The MFA completion transaction must associate the resulting session with the
  originating receipt/delivery. A competing replacement serializes against it:
  either the old completion wins and its exact session is then revoked, or the
  replacement wins and the old challenge cannot complete. Lost MFA-completion
  response uses the same fresh-delivery recovery; never bypass MFA via receipt.
  This association is a required W4-D change, not present in current source.
- If DB commit/response delivery is ambiguous, return no cached bearer. Read the
  journal on recovery. If transaction rolled back there is no completed entry;
  if it committed there is exactly one replaceable session/challenge reference.

Consequently an HTTP response can be lost without re-exchanging a code or storing
bearer tokens for replay. A new session is an explicitly authorized replacement,
not a byte-identical idempotent replay. Existing authenticated SIT sessions and
ordinary refresh/logout routes continue their current behavior; receipt expiry
does not secretly invalidate a successfully delivered unrelated session.

## 5. Web acquisition and provider boundary

The selected future Web client uses the direct Apple JS popup flow only. Bind
random state to the initiating tab/action and verify it once; use a separate
cryptographically random raw nonce, its SHA-256 hex value for Apple, and the raw
nonce with the Apple ID token for Firebase. Preserve exact acquired UID and
client generation checks before/after popup, Firebase sign-in, token refresh and
every backend action. Request only email/name. Keep raw code, Apple ID token,
nonce, Firebase token and profile in memory; do not log or persist them.

Server profile owns the exact staging origin/API, Firebase project, Services ID,
redirect and key/configuration evidence. Do not let the browser choose a profile
or transplant a native App-ID code into a Web Services-ID exchange. Browser state
validation is CSRF protection for the client ceremony, not backend identity
proof; backend independently verifies Firebase and binds Apple's exchange
response to its expected subject/audience. Actual callback configuration,
state/nonce behavior and successful non-consumed-code exchange are NOT VERIFIED.
Redirect/form-post acquisition, durable browser state, native profile migration,
CSP/script loading and provider-specific cleanup need their separate W3 gates;
there is no silent popup-to-redirect fallback.

## 6. Rollout, pause and rollback

1. Ship W4-D schema/readers/cleanup and route code with new acquisition OFF and
   no enrolled accounts. v2 requests fail closed; legacy compatibility is tested.
2. Validate exact direct-Web provider profile and authorized Web-only test cohort
   separately. Only explicit later activation may enroll accounts and advertise
   v2. Version negotiation is an exact request version plus bounded `426` error;
   no client platform claim and no opportunistic downgrade. Unknown versions
   fail `400 apple_contract_version_unsupported` before provider effects.
3. Once any account is enrolled, OFF means **pause/drain**, not restore v1 for
   that account. Existing ownership enforcement and status/deletion readers stay
   loaded; new acquire/session operations stop. Retain each historical profile
   generation/key needed to clean its own material. Never revoke with a new
   Services ID/redirect simply because global config changed.
4. Roll back via a forward-compatible build retaining ledger readers, enrollment
   enforcement and cleanup. Do not deploy a pre-ledger image or run a destructive
   down migration while attempts, material, sessions or unknown obligations need
   it. Down must refuse non-empty ownership/cleanup obligations. Promotion/recovery
   inventories must bind the exact compatible image; a source migration does not
   advance live runner boundaries. No automated profile/cohort/secret rollback.

## 7. Atomic W4-D acceptance matrix

All rows are required; a detached library or source-pattern test alone is not PASS.

| Area | Decisive acceptance |
| --- | --- |
| Route/version | Exact v2 schemas and duplicate-key rejection; v1 unchanged OFF; enrolled v1 code/code-free reject before exchange; client spoofed platform has no effect; no Google/Facebook/enrollment broadening |
| Identity/eligibility | Revocation + project/provider/subject/UID checks; iat/auth_time boundaries; existing exact link only; conflicting SIT session, email-link attempt, suspended/closed/not-allowlisted account fail before effect; concurrent cohort change cannot bypass |
| Immutable owner | Append-only numbered migration, immutable canonical binding and expiry, keyed code/request/receipt digests; wrong principal/profile/generation/deadline rejected; owner-bound authenticated encryption rejects swapped row/ciphertext/key |
| Exchange durability | Disposable PG16 concurrent duplicate claims have one synthetic provider call; rollback, CAS loss, process kill/restart before/after exchange and material commit; delayed response and unknown preserved; no code replay or raw-code persistence |
| Receipt/status | Lost acquisition response recovered by authorized request-ID lookup; exact coarse projection; foreign/missing/expired indistinguishable; no token/receipt in URL/log/export; duplicate conflicts do not issue material or sessions |
| Session/MFA | Acquire creates zero sessions; committed-receipt delivery uses no Apple call; duplicate delivery creates none; replacement revokes only prior delivery; response/commit loss recovers; MFA completion races cannot bypass second factor or leave an untracked surviving session; delivery limit enforced |
| Multiple materials/deletion | Every grant retained independently, no identity-slot overwrite; legacy profile provenance and obligations preserved separately; actual public account-erasure lifecycle and hard-delete cascade populated; deletion during exchange and late response retain correct cleanup ownership; Firebase success/one revoke never clears siblings or unknowns |
| Cleanup/retention/export | Separate active reservation and cleanup-ready state; ambiguous revoke remains unresolved; per-profile key history; non-empty safe export fixture and retention counts; no sensitive values in evidence; pending/unknown survives expiry and down refusal |
| Consumer closure | All source-bound manifests, migration/R9 inventory and test-runner structural fixtures updated together; full required local consumer check; existing auth/allowlist/MFA/privacy regressions; real PG teardown and exact source hashes |
| Rollout safety | Default-OFF plus durable-enrollment drain behavior tested; incompatible old-image/down rollback denied; no provider configuration, console, build, deploy or native activation implied |

## 8. Exact source register

All repository paths below were opened on 2026-10-03. Hashes bind the inspected
bytes, not the concurrently changing branch name. SDK paths are package-relative
within the installed pub cache; no host-specific path is committed.
The app hash binds the exact source HEAD named above. At 14:25 UTC the current
social-route block, `issueSession` block and MFA challenge-route block were
byte-identical to that revision: SHA-256 respectively
`443154e29fb3fa71dc1e195b13d882ed04c9c7cba8220939e3c776b886d42718`,
`f0840eb36042b35fc6c2267743595cacf9b5a45f98bf1751b465d87cccad7c62`,
`12d1bd31c39fea5f8b5f477e9f156a256f6e34c2703ee13c1f81544e158819ad`.

| Source | SHA-256 |
| --- | --- |
| `lib/services/auth_service.dart` | `6ebe241cd53b80dcdc85f4cd70301dbc11c5045c9316f60a736ad0859b015ec0` |
| `lib/services/web_apple_auth.dart` | `791dc740f5561395d677a5e6f7e43508b1f661aafa923e75a49758bba7234e71` |
| `lib/services/web_apple_auth_config.dart` | `ccd35c803fae3cf12a25c914879bcbd8d48bb13f86e07f207ebd2e5cac541c6e` |
| `backend/src/app.js` at source HEAD | `ed66b274d8d26ab142bf51d2b04440eb7c6d78e43a08e90f8215b301d18d0647` |
| `backend/src/firebase_social_auth.js` | `58843e34ac407b429d2d1886d56fce54a37645e5f92e75ef282953003c235399` |
| `backend/src/firebase_identity_cleanup.js` | `f4f4f77c57cca13b3e63e96fd50add1200bc2c59a99b50125902032d1df93fa5` |
| `backend/src/apple_revocation.js` | `e3e83a54ed7bb3818231ffadf39d2482193be19d20a880598fefffab46a7aae5` |
| `backend/src/apple_revocation_secret_files.js` | `2eb6ea78419d60d7ca51593a30d7b018977626b1f8910680d885a0d07175bfcf` |
| `backend/src/mfa_workflow.js` | `aebf3be668348dcb56adb23f35169251055d26e2161515c53a38ea5ab688f610` |
| `backend/src/observability.js` | `b971c321aaaadad49da7400280cd74ce8499fc9b5e582e34e5c5a5ab651042d8` |
| `pubspec.lock` | `2fdbc2bba4e8d2be9a82f5161c1547a14714fd1da811f0b490b2a59027f7dd82` |
| `firebase_auth-6.5.7/ios/firebase_auth/Sources/firebase_auth/FLTFirebaseAuthPlugin.m` | `18396a506fdccfd7256c54b741a92866e23a90fffae73155681fc3547f7f1b68` |
| `firebase_auth-6.5.7/ios/firebase_auth/Sources/firebase_auth/PigeonParser.m` | `3c2869dbfbc3e5f1510849825ae588f02b7b78d0d952384f8cf851bce04c3494` |
| `firebase_auth-6.5.7/android/src/main/java/io/flutter/plugins/firebase/auth/FlutterFirebaseAuthPlugin.java` | `23fd9f8c2c7c4031ef53f184daecc2ad252f644f360e0a9941d5c8ab84f94707` |
| `firebase_auth-6.5.7/android/src/main/java/io/flutter/plugins/firebase/auth/PigeonParser.java` | `f8ff2a80b2ab7b89b69427acdbbfcafc416c59516557ac322cba7fc3d115bf50` |
| `firebase_auth_web-6.2.6/lib/src/utils/web_utils.dart` | `b91bfb9ebfa68427649ad4566418113eefa7a37d345ef937d1f12fae1446e2e9` |

## 9. Official current references and remaining live gate

All following pages returned HTTP 200 on a fresh `maxAge:0` fetch on 2026-10-03
around 14:15–14:18 UTC. Firebase pages report updated **2026-10-01 UTC**; Apple
pages expose no publication/update date. An initially cached Firebase response
was not used as the freshness proof. An obsolete Apple JS documentation path
returned 404 and was replaced with the successfully opened canonical page.

- [Firebase Web Apple](https://firebase.google.com/docs/auth/web/apple): direct
  Apple ID-token/raw-nonce credential, provider setup and separate linking flow.
- [Firebase Apple-platform guide](https://firebase.google.com/docs/auth/ios/apple):
  Apple credential/nonce and authorization-code revocation example.
- [Firebase Android Apple](https://firebase.google.com/docs/auth/android/apple):
  Firebase-managed OAuth, ID-token/raw-nonce alternative and access-token revoke.
- [Firebase token verification](https://firebase.google.com/docs/auth/admin/verify-id-tokens):
  project-bound token verification and token claims.
- [Firebase sessions](https://firebase.google.com/docs/auth/admin/manage-sessions):
  ID-token refresh, authentication time and explicit revocation checking.
- [Apple token validation](https://developer.apple.com/documentation/signinwithapplerestapi/generate-and-validate-tokens):
  single-use/five-minute code, App-ID/Services-ID client identifier and redirect.
- [Apple webpage configuration](https://developer.apple.com/documentation/signinwithapple/configuring-your-webpage-for-sign-in-with-apple):
  popup promise/events, form-post response and state validation.
- [Apple environment configuration](https://developer.apple.com/documentation/signinwithapple/configuring-your-environment-for-sign-in-with-apple):
  Services ID, domains and exact absolute return URL registration.

**NOT VERIFIED:** actual console/profile/callback state; Web/native code audience
compatibility; successful untouched-code exchange after Firebase sign-in; grant
aliasing and revocation effects across devices; lost-material provider remediation;
native runtime behavior; W4-D concurrency/crash/privacy acceptance. This design
does not convert those unknowns into provider, device or release approval.
