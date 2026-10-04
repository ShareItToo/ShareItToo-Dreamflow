# Apple Web W3 — direct authorization design gate

Decision: **FIX for integration with unchanged SIT backend**. A direct Apple
authorization followed by Firebase ID-token credential sign-in is supported
in principle, but the complete SIT flow is not yet safe to activate. W3 is
research/design only: no production code, dependency, console, route, profile,
manifest or deployment change. Provider/account/runtime facts remain
**NOT VERIFIED**. Research-evidence and ShareItToo guardrails were applied.

Repository base: `f9041a045f48d5f97936e3e08b7c5059f2d18b8c`, branch
`codex/master-workflow-20260808`. Sources opened 2026-10-03,
13:45–13:53 UTC. Dates below distinguish published page dates from HTTP
Last-Modified; neither is evidence about the configured SIT account.

## Answer and decisive blockers

**Documented mechanism:** Apple JS can deliver an authorization code, Apple
ID token and state. Firebase documents constructing an `apple.com` credential
from that ID token plus the original raw nonce; the corresponding request
does not need the Apple authorization code. Firebase also explicitly supports
independent provider sign-in followed by `signInWithCredential`. [A1, F1, F2, F3]

**Inference:** if the Apple code is held only for SIT, Firebase's token-only
credential path cannot redeem that code because it never receives it. This
removes the W2 converter omission as an architectural dead end. It does not
prove a real code remains redeemable in the configured SIT/Firebase/Apple
combination. Apple makes each code single-use with a five-minute lifetime;
only SIT may perform that one exchange. [A2; installed SDK evidence below]

**Concrete integration blockers:**

1. **External exchange precedes durable ownership.** Current
   `backend/src/app.js:2958` exchanges the code; refresh material is held and
   encrypted in memory. The account transaction starts at `:2998`, and the
   identity insert/update stores material later. Identity conflict, consent,
   suspension, MFA/session writes or DB failure may occur after exchange.
   No pre-exchange durable claim or failure-path revoke of that newly issued
   material is present in this route. Therefore a successful Apple exchange
   followed by rollback/process loss can consume the code without retaining
   the new refresh material. This is a source-order finding, not a reproduced
   production incident. The unchanged backend cannot receive safety approval.
2. **Callback evidence has the wrong shape for a direct flow.** W1 fixes
   `callbackUrl` to the Firebase handler and hashes its auth domain. A direct
   flow needs a separately registered return URI controlled by SIT and bound
   identically into Apple authorization and SIT code exchange. Existing
   `APPLE_REVOCATION_REDIRECT_URI`, Services ID, team/key and provider bindings
   have not been read back. W1 evidence must not be relabeled as this approval.
   No current callback route/registration is asserted. [A2, A3, A4]
3. **End-to-end transaction proof is absent.** Live nonce validation, one-time
   redemption, cross-attempt rejection, lost-response handling, cleanup after
   account rejection and retained-material deletion/revocation are
   NOT VERIFIED. A clean client or mocked successful exchange cannot close
   these boundaries. The existing backend binds exchanged `iss/aud/sub` to
   the Firebase-verified subject, but does not receive or bind an attempt
   state/nonce; exact same-attempt server correlation is unproven.

## Candidate flow and exact bindings

The following are **proposed SIT requirements**, not claims of implemented
behavior or provider approval:

1. A single explicit action owns a principal/session epoch, SDK generation,
   independent random state, raw nonce and expiry. Generate state and nonce
   separately from a cryptographic generator; proposed size is 32 random bytes
   each. Do not derive either from account identifiers or timestamps. Bind
   approved config digest, Services ID, origin and return URI to this attempt.
2. Send the SHA256 lowercase hex of the raw nonce as Apple `nonce`. Keep the
   raw nonce for Firebase, never send it as Apple's nonce. Request only `email`
   and, if retained as an explicit product requirement, `name`; ignore the
   untrusted `user` profile object. Firebase requires the raw nonce's SHA256
   to equal the ID-token nonce claim. [F2] Apple supplies the nonce only when
   requested and describes it as a session/replay binding. [A5]
3. Use one `AppleID.auth.signIn()` promise as the response owner. Require exact
   matching state, a nonempty bounded code and Apple ID token before Firebase
   work. Reject expired, missing-state, mismatched, duplicate, unsolicited and
   late results. Atomically consume the local attempt once; do not process
   both the promise and success event. Apple documents both delivery forms,
   and state comparison for CSRF mitigation. [A1, A6]
4. After principal/generation/readiness checks, construct the installed Dart
   `OAuthProvider('apple.com').credential(idToken: appleIdToken,
   rawNonce: rawNonce)` and call the injected Firebase
   `signInWithCredential`. Do not supply an access token, authorization code,
   `serverAuthCode`, profile or a linking credential. Installed Web conversion
   forwards ID token/raw nonce to the JavaScript OAuth credential.
5. Capture the exact returned Firebase UID before post-await ownership checks;
   require current UID equality, then `getIdTokenResult(true)` and
   `signInProvider == 'apple.com'`. This local provider check is a mismatch
   guard; SIT's existing server verification remains authoritative.
6. Under a server-owned attempt/claim contract still to be designed, transmit
   only the fresh Firebase `idToken` and original `appleAuthorizationCode`
   plus the existing truthful consent fields, if applicable. Never substitute
   the Apple ID token for the Firebase token. No browser Apple `/auth/token`
   request and no Firebase popup precede or follow the direct authorization.
7. The backend must use the exact Web Services ID as client ID and the exact
   original return URI. Apple requires that redirect URI when it was included
   in the authorization request. Preserve the verified Firebase Apple subject
   comparison, allowlist, existing account controls and Google-only enrollment
   exception. A backend failure must not become an automatic resend. [A2]

Canonical proposed origin/API remain `https://staging.shareittoo.com` and
`https://staging.shareittoo.com/api/v1`. A possible return URI is
`https://staging.shareittoo.com/auth/apple/callback`, **a design candidate only,
not an existing or approved endpoint**. Require HTTPS, a real registered
domain and a full path; no localhost/IP/fragment, wildcard, path rewriting,
port alias or trailing-slash normalization. The Apple JS client ID, Firebase
Apple provider Services ID, Apple ID-token audience and backend revocation
client ID must all match. Native bundle-ID configuration cannot stand in for
the Web Services ID. [A2, A3, A4, A7]

## Popup versus redirect

| Choice | Evidence and consequence | W3 decision |
| --- | --- | --- |
| Direct Apple JS popup (`usePopup:true`) | Promise/event returns authorization data without replacing the app page. Keeps proposed state/nonce in the owning page. Popup blocking/close remains a failure; user gesture, mobile behavior and opener policies need browser proof. [A1, A8, F3] | Smallest candidate for a dormant adapter; no silent redirect fallback. |
| Direct Apple redirect | With scopes, documented authorization uses `form_post` to the registered return URI. Requires a real callback and one-time server correlation across navigation; an in-memory Dart action alone does not survive that round trip. [A9] | Separate server callback design; not in minimal W4. Never place tokens/code into query, fragment, logs or general browser storage. |
| Firebase popup/redirect | The installed Web result conversion omits Apple authorizationCode. Firebase redirect additionally has documented third-party-storage considerations; self-hosting its helper is explicitly unsupported for Apple. [F3; installed SDK] | Does not solve W2's code gap. |

Apple's public REST authorization page lists `query`, `fragment`, `form_post`;
the freshly fetched hosted JS v1.5.7 itself emits `web_message` for popup and
`code id_token` as response type. This is a documented-wrapper versus
implementation distinction, **not approval to hand-roll an undocumented
`web_message` transport**. Use the official SDK contract. The snapshot checks
message origin against `https://appleid.apple.com`; this does not replace the
application state/attempt check or establish a full transport audit. Exact
browser/window-source behavior remains an acceptance gate. [A8, A9]

## Dependency, CSP and data constraints

Apple's webpage guide loads its hosted script from
`https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js`.
This introduces third-party executable code despite requiring no new Dart
package. [A1] Proposed integration must load it only for an approved Apple lane,
await an explicit readiness/error result, prevent duplicate loaders, and never
enable a button from mere script presence.

No authoritative complete CSP allowlist was established by the opened primary
docs. **Exact CSP, CORS/SRI behavior and COOP compatibility: NOT VERIFIED**.
At minimum the script source and Apple popup destination must be reviewed;
actual `connect-src`, `frame-src`, `form-action`, other resources and opener
policy must come from observed requests/headers under the exact staging
policy. Do not invent wildcards, unsafe-inline allowances or a COOP downgrade.
The CDN path is mutable: a snapshot digest records investigated bytes, not an
SRI deployment policy or entitlement to vendor the SDK.

Retain the existing Firebase memory-only persistence, explicitly await it
before sign-in, and prove no credential/profile storage or logging in the
adapter. Firebase's default Web persistence is local; explicit memory mode
is therefore a required SIT integration assertion. [F4] Keep Apple private
keys and client-secret generation on the server. [A3]

## Account linking, replay and failure ownership

**Current facts:** Firebase sign-in can create a Firebase account even when
SIT later refuses registration. Firebase's manual credential flow is not an
existing-SIT-account admission check. [F1, F5] The SIT route also has a branch
that links an existing email-matched account after checking verified email;
an existing-account-only audience assertion is not proof of a previously
linked Apple identity. Apple account association can require explicit consent;
do not interpret verified email as universal linking permission. [F1]

**Required design:** distinguish an existing exact Apple identity from new
Firebase-user creation and SIT account linking. No automatic `linkWithCredential`,
email-conflict recovery or silent account merge. Preserve current staging
restrictions and require a separate deliberate linking/reauthentication path
when needed. Cleanup must not delete an existing Firebase user merely because
SIT denied login; new-provider-account cleanup needs exact server ownership
and separate evidence. Neither SDK sign-out nor discarding a code revokes
Apple authorization. Apple revocation needs an access or refresh token. [A10]

| Failure point | Required outcome; not yet proven live |
| --- | --- |
| Before valid response / popup closed | Invalidate attempt, clear nonce/state, bounded sanitized error, no Firebase or backend call. |
| Duplicate or stale Apple response | Consume zero additional attempts, reject before Firebase, never use an event from a successor popup. |
| Firebase succeeded, SIT rejected | Sign out only captured UID under the same SDK generation; preserve successor identity. Record unresolved new-user/Apple-authorization cleanup without claiming revocation. |
| Apple exchange explicitly rejected | No session; sanitize response, abandon this code. Retry requires a fresh user action/authorization. |
| Exchange response lost / process dies | Provider outcome unknown. Never retry a single-use code blindly or report no effect. A durable claim must distinguish unknown from failed/succeeded; recovery/re-authorization policy remains open. |
| Refresh returned, account transaction fails | Securely retain owned material for recovery or durable revocation cleanup. The inspected backend currently lacks this guarantee. |
| Commit succeeds, response is lost | Recover existing outcome by server-owned attempt identity; do not repeat exchange/account creation. |

Apple code one-time semantics prevent a second successful redemption; they do
not supply an idempotency key or recovery of a lost refresh response. [A2]
Likewise an ID-token nonce comparison is not a server ledger of completed SIT
login attempts. Do not claim global nonce replay prevention from a browser-only
map. Missing backend same-attempt/unknown-outcome proof is an explicit gate.

## Smallest safe W4 package

**W4-A: source-only Apple exchange ownership/failure proof.** Add an isolated,
config-free contract harness for the current `/auth/social` ordering. Drive
successful synthetic Apple exchange followed by identity conflict, transaction
rollback, process/response loss, duplicate requests and prior-material overwrite.
Prove the consumed-code/new-refresh gap before changing behavior. Specify a
versioned server-owned attempt state machine with durable claim, exact
principal/Services-ID/redirect binding, encrypted material ownership,
unknown-outcome handling and cleanup. Do not put raw credentials in evidence.

Only after that design/fix is reviewed should **W4-B** add a dormant direct-JS
adapter and W1-v2 configuration contract: injected bridge/CSPRNG/clock,
single-flight state/nonce ownership, token-only Firebase credential, exact code
payload, expiry and adversarial callback tests in VM and Chrome. No production
consumer, real script load or flags until the provider/runtime gates pass.
This ordering avoids integrating a known non-atomic external exchange.

Required later evidence: fresh sanitized Services-ID/domain/return-URL/key/
Firebase/backend binding readback; exact SDK/CDN/CSP candidate; desktop and
mobile browser popup behavior; invalid state/nonce/issuer/audience/expired
tokens; cross-user/cross-attempt/replayed code; existing identity versus linking;
rate limits; actual code exchange once; durable refresh/rollback/unknown-result
handling; same-UID/generation cleanup; account deletion and independently read
back revocation. No current source-only PASS substitutes for these results.

## Source register

All official sources below were opened during this W3 run, 2026-10-03.
Apple documentation HTML is a JavaScript shell; substantive content was
freshly fetched over HTTPS from Apple's corresponding
`/tutorials/data/documentation/<same-path>.json` resources with `Cache-Control:
no-cache`, HTTP 200. Apple publication dates were not displayed; those JSON
responses carried Last-Modified **2026-08-14 13:53:57 GMT**, not a guaranteed
editorial update date. Moved/404 URLs were discarded in favor of the live paths.
Firebase pages and Apple's account-help page were additionally fetched directly
with `Cache-Control: no-cache` at 13:51–13:53 UTC, HTTP 200; decisive redirect
guidance was checked in the returned page body, not just its status code.

| ID | Direct official source | Displayed version/date and supported claim |
| --- | --- | --- |
| A1 | [Apple webpage configuration](https://developer.apple.com/documentation/signinwithapple/configuring-your-webpage-for-sign-in-with-apple) | Undated; JS inclusion, popup promise/events, response shape and scope handling. |
| A2 | [Apple token validation](https://developer.apple.com/documentation/signinwithapplerestapi/generate-and-validate-tokens) | Undated; single-use five-minute code, server exchange, redirect binding and refresh response. |
| A3 | [Apple environment configuration](https://developer.apple.com/documentation/signinwithapple/configuring-your-environment-for-sign-in-with-apple) | Undated; Services ID, primary app, registered domains/return URLs and server keys. It also states an existing App Store app using Apple sign-in is required; SIT eligibility is NOT VERIFIED. |
| A4 | [Apple web capability configuration](https://developer.apple.com/help/account/capabilities/configure-sign-in-with-apple-for-the-web/) | Undated live HTML; primary App ID/Services ID association, domains/return URLs; no uploaded domain verification file required. |
| A5 | [Apple nonce](https://developer.apple.com/documentation/signinwithapplejs/clientconfigi/nonce) | Undated; session and replay binding. |
| A6 | [Apple state](https://developer.apple.com/documentation/signinwithapplejs/clientconfigi/state) | Undated; returned state comparison. |
| A7 | [Apple ID-token claims](https://developer.apple.com/documentation/signinwithapplejs/authorizationi/id_token) | Undated; issuer, subject, audience, expiry, nonce; email may be absent. No guaranteed `c_hash` documented here, so do not invent it as an available pair-binding field. |
| A8 | [Apple usePopup](https://developer.apple.com/documentation/signinwithapplejs/clientconfigi/usepopup), [official hosted SDK](https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js) | Property undated; fetched SDK v1.5.7, HTTP Last-Modified 2026-08-25 22:11:37 GMT; observed `web_message`, origin filtering. |
| A9 | [Apple authorization endpoint](https://developer.apple.com/documentation/signinwithapplerestapi/request-an-authorization-to-the-sign-in-with-apple-server.) | Undated; code/id_token response modes, required form_post for scopes, redirect syntax and state. |
| A10 | [Apple token revocation](https://developer.apple.com/documentation/signinwithapplerestapi/revoke-tokens) | Undated; access/refresh token and matching client ID required to revoke. |
| A11 | [Apple user verification](https://developer.apple.com/documentation/signinwithapple/verifying-a-user) | Undated; server signature/nonce/issuer/audience/expiry verification responsibilities. |
| A12 | [Apple authentication overview](https://developer.apple.com/documentation/signinwithapple/authenticating-users-with-sign-in-with-apple), [redirectURI](https://developer.apple.com/documentation/signinwithapplejs/clientconfigi/redirecturi), [signIn](https://developer.apple.com/documentation/signinwithapplejs/authi/signin) | Undated; first-time data, developer-controlled callback and per-call configuration. Context sources, not independent live SIT evidence. |
| F1 | [Firebase Apple Web guide](https://firebase.google.com/docs/auth/web/apple) | Last updated 2026-10-01 UTC; manual Apple ID-token/raw-nonce credential, new Firebase users, association consent. |
| F2 | [Firebase OAuthCredentialOptions](https://firebase.google.com/docs/reference/js/auth.oauthcredentialoptions), [OAuthProvider](https://firebase.google.com/docs/reference/js/auth.oauthprovider) | Options last updated 2022-07-22 UTC; Provider 2024-01-19 UTC; freshly served current references for nonce SHA256 equality and token credential shape. |
| F3 | [Firebase redirect best practices](https://firebase.google.com/docs/auth/web/redirect-best-practices) | Last updated 2026-10-01 UTC; independent provider flow option, popup caveats and Apple helper limitation. |
| F4 | [Firebase persistence](https://firebase.google.com/docs/auth/web/auth-state-persistence) | Last updated 2026-10-01 UTC; local default versus explicit memory persistence. |
| F5 | [Firebase Auth REST](https://firebase.google.com/docs/reference/rest/auth#section-sign-in-with-oauth-credential), [account linking](https://firebase.google.com/docs/auth/web/account-linking) | Last updated 2026-10-01 UTC; token-based credential exchange, account collision/linking distinctions. |

Source caveat: A11's narrative mentions `nonce` in a token-validation call,
whereas A2's concrete exchange schema lists code/client/secret/redirect fields;
do not invent a backend request field from that prose. Nonce is carried in
authorization and verified in the ID token. This packet does not resolve every
SDK transport/security detail by implication.

## Version-bound local evidence

Read on 2026-10-03; package files resolved from `.dart_tool/package_config.json`.
Public package-relative paths below avoid host-specific account locators.

| Source | SHA256 / finding |
| --- | --- |
| `firebase_auth_web` 6.2.6 `lib/src/utils/web_utils.dart` | `b91bfb9ebfa68427649ad4566418113eefa7a37d345ef937d1f12fae1446e2e9`; omits popup authorizationCode but forwards OAuth ID token/rawNonce. |
| `firebase_auth_web` 6.2.6 `lib/firebase_auth_web.dart` | `0deb657909603454a412f494cfd590af09d09776cb8362243cd15ac7e2d3d344`; signInWithCredential delegates through the converter. |
| `firebase_auth_platform_interface` 9.0.6 `lib/src/providers/oauth.dart` | `3615097cfa30b2ad5cd73bbbdf1b139dc80c9457818cb6c0a48f90ff10794db1`; generic credential accepts ID token/rawNonce. |
| Official hosted Apple JS, fetched 13:48:13 UTC, 42,880 bytes | `d443b6ff67b95e7d5811d53447365c980c9c4f3dd13317024853672298d75790`; inspected in memory, not copied into repository. |
| `backend/src/app.js` | `ed66b274d8d26ab142bf51d2b04440eb7c6d78e43a08e90f8215b301d18d0647`; external exchange before account transaction/material persistence. |
| `backend/src/apple_revocation.js` | `e3e83a54ed7bb3818231ffadf39d2482193be19d20a880598fefffab46a7aae5`; fixed Apple HTTPS endpoint, subject/audience binding, one code exchange and refresh-token revocation. |
| `lib/services/web_apple_auth_config.dart` | `ccd35c803fae3cf12a25c914879bcbd8d48bb13f86e07f207ebd2e5cac541c6e`; W1 Firebase-handler binding, not a direct-flow callback approval. |

Verification for this document: source hash/readback and targeted whitespace/
secret/path checks only. No source test was added merely to freeze the unsafe
ordering; W4 must reproduce the failure rather than make that ordering a green
behavioral invariant. No account login, authorization, token-exchange or
revocation endpoint was invoked; only public documentation/SDK bytes were read.
