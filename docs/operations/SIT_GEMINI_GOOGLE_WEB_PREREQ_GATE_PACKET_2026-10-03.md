# SIT Google Web prerequisite — prepared Gemini gate packet

Status: **PREPARED / NOT SENT**. Gate `SIT-GOOGLE-WEB-PREREQ-01` has no
accepted Gemini decision in this package. Preparation date: 2026-10-03.

## Exact boundary and authority

- Project: ShareItToo/SIT; repository
  `ShareItToo/ShareItToo-Dreamflow`. All source paths below are relative.
- Branch: `codex/master-workflow-20260808`; product/source HEAD:
  `d1f12132b0be20878cff1d69fea7264c25ca0995`, copied from `git rev-parse HEAD`.
- Scope: prepare one access/security decision about exactly one Firebase Web
  app in the existing Staging-runtime Firebase project, plus addition of only
  `staging.shareittoo.com` to its existing authorized-domain set, followed by
  sanitized independent readback. This is not a new Firebase project.
- Explicit user authorization for that bounded successor already exists in
  the current task instruction. Do not ask for permission again after exact
  account, mode, source and provider preflight and an accepted A decision.
  The preparation worker itself has no authority to send or mutate anything.
- Current capsule, source-bound excerpts and hashes below are the technical
  handoff. Gemini is not assumed to have access to local files, private GitHub,
  provider consoles, runtime, credentials or prior conversations. Sol supplies
  the verified technical capsule; Gemini freshly opens official platform
  sources. Missing local access is not cured by pretending a path was opened.

Excluded: app/build flag activation, deployment or build, real login/token test,
Apple/Facebook, Production, Google Play, payment, API/runtime changes, account
or session changes, allowlist/MFA changes, OAuth consent changes, manual OAuth
client creation or key rotation, new APIs/services, Hosting/custom auth-domain
setup, Analytics, DNS, billing, secret export and legal/pilot approval. Required side effects
outside this boundary mean C BLOCK; they are not silently added to the package.

## Ready-to-send question

> Review only `SIT-GOOGLE-WEB-PREREQ-01`. Is the proposed smallest provider
> mutation safe and sufficient as a prerequisite package: register exactly one
> Firebase Web app in the already existing, freshly matched Staging-runtime
> project and add only `staging.shareittoo.com` to its existing authorized
> domains, then independently read back the exact delta while Google Web stays
> disabled? Return exactly one decision: **A PASS**, **B FIX** or **C BLOCK**.
> A means the narrow plan may proceed after the preserved fresh preflight;
> it never means provider creation, domain change, authentication or release has
> succeeded. B identifies a concrete correction within this exact scope and
> the proof required. C identifies a missing decisive source, unsafe mismatch,
> unresolved contradiction or required out-of-scope action. Do not review or
> activate later login, rollout, Mission, payment or other provider work.

Before sending, the coordinator must verify the visible correct SIT Google AI
Pro account/thread and the selector **Pro** with **Extended**, immediately
before submission. Signed-out state, Flash/Flash-Lite, another mode, or a Pro
quota block means no send and no accepted answer; preserve the packet and wait.
The capsule's earlier signed-out/Flash-Lite observation is historical, not a
current UI assertion. No Gemini login or UI access was performed to prepare it.

## Evidence classes and decisive technical facts

Use `FACT`, `INFERENCE`, `PROPOSAL` and `OPEN` explicitly. A fact about what a
repository document reports is not a verified fact about a current provider.

| Class | Claim and decisive source | Limit |
|---|---|---|
| FACT — repository report | Capsule lines 110–125 record a fresh read-only Firebase Management/Identity Toolkit check: zero Web apps, staging domain missing, Google provider enabled with client configuration present, backend auth enabled, service-account/runtime/native projects matching and no emulator. | Historical report only. Raw provider evidence and its current locator were not supplied or independently reopened in this package; current live status is NOT VERIFIED. |
| FACT — source | `backend/src/config.js` derives `firebaseProjectId` from `FIREBASE_PROJECT_ID`, supplies it to `socialAuth`; `firebase_social_auth.js` validates the service account against it and initializes the named auth app with the same project. `firebase_service_account.js` rejects another project. | Proves configured binding logic; does not reveal or verify today's project ID or running environment. |
| FACT — source/SDK | `verifyFirebaseSocialToken` uses `auth.verifyIdToken(token, true)` outside its explicit injected test seam. Locked and locally installed `firebase-admin` is 14.2.0; its token verifier checks exact `aud === projectId` and `iss === 'https://securetoken.google.com/' + projectId`. | Injected unit verification is not a real signed-token/audience/issuer test. Live dependency bytes and emulator absence require runtime readback. |
| FACT — source | `WebGooglePublicConfig.isBound` requires Web-app/sender/project shape, matching backend project, default project Firebase auth domain, exact Staging origin and an approved public-config SHA-256; `optionsFor` additionally requires Google/backend flags and exact Staging API URL. | Hashing guessed configuration is not approval or provider evidence. No real project ID, app ID, client ID or key is supplied here. |
| FACT — source | `auth_service.dart` permits only Google on Web when ready; uses `signInWithPopup`, account selection and a fresh ID token, then the existing principal-bound remote transaction and `/auth/social` exchange. Web initialization uses memory persistence. | Existing wiring is dormant source; source readiness does not prove a provider client exists or login works. |
| FACT — source | `tool/staging_web_contract.mjs` pins Google, Apple, Facebook and provider-activation validation flags to false. `backend/src/app.js` retains account-active/consent, Staging access/allowlist, MFA-challenge and session issuance paths. | No flag, allowlist, account, session or MFA policy may change in this package. |
| FACT — focused check | On 2026-10-03, exact-source Web wiring 3/3, social-token unit 6/6 and service-account validation 5/5 passed (14 total, zero failures/skips). | Synthetic/local tests only. The capsule's earlier 9/9 is separate provenance, not a newly performed provider test. |
| INFERENCE | Given a fresh reproduction of the capsule's provider state, one Web-app registration and one authorized-domain addition are the smallest currently identified missing provider prerequisites. | Not an assertion that all subsequent Web login prerequisites are satisfied. |
| PROPOSAL | Execute only the two changes after A and preserved preflight, then stop after independent sanitized readback. | No mutation happened during packet preparation. |
| OPEN | Fresh account/project/runtime identity, Web-app/domain/provider state, emulator absence, provider behavior/side effects, OAuth consent status and actual login outcome. | Never invent values or convert these into facts from memory, snippets or an AI answer. OAuth consent/login remain outside this package. |

Decisive sanitized excerpts (full bytes bound in the register):

```text
backend/src/firebase_social_auth.js:
  validateFirebaseServiceAccount(..., config.socialAuth.firebaseProjectId)
  initializeApp({ credential: cert(serviceAccount),
                  projectId: config.socialAuth.firebaseProjectId }, 'shareittoo-auth')
  const decoded = await verify(token, true)
lib/services/web_google_auth.dart:
  backendProjectId == projectId
  authorizedOrigin == stagingOrigin
  approvedDigest == publicConfigDigest
  origin == 'https://staging.shareittoo.com'
  apiBaseUrl == 'https://staging.shareittoo.com/api/v1'
tool/staging_web_contract.mjs:
  SIT_SOCIAL_GOOGLE_ENABLED: 'false'
  SIT_SOCIAL_APPLE_ENABLED: 'false'; SIT_SOCIAL_FACEBOOK_ENABLED: 'false'
  SIT_SOCIAL_PROVIDER_ACTIVATION_VALIDATED: 'false'
```

These abbreviated excerpts state the checked predicates, not standalone
executable code. The local SDK additionally reads `FIREBASE_AUTH_EMULATOR_HOST`;
its absence cannot be established by repository search. The runtime check must
also exclude an already initialized mismatched named app or emulator mode.

## Preconditions, exact mutation and independent readback

1. Sol verifies the current task's unchanged authorization, exact source bytes
   and visible Gemini account/mode. If HEAD or any decisive source differs,
   rebind/review the successor before sending; do not silently use this packet
   as current. Keep deployed Web, API runtime and repository HEAD identities
   separate. The capsule reports Web `967958f6c6a4d580f4f05e6849b32991db233603`
   and API `6c0ef70db2656df3e378add858d5f5157388127e`; neither is freshly
   verified here.
2. Before accepting A, obtain a current sanitized operator fact capsule with
   read time and protected evidence locator. Before mutation, repeat the
   identity and mutable-state check: correct authorized provider account;
   exact existing project matches Staging runtime, service account and native
   binding; runtime auth enabled; exact audience/issuer implementation and no
   emulator; Google enabled/client config present; zero Web apps and the
   Staging domain absent. Preserve other domains and configuration. Abort on
   missing access, ambiguity, project/account mismatch, changed baseline,
   unconfirmed project sharing/blast radius, or stale evidence. Never create a
   duplicate app when a fresh read shows the prerequisite already exists.
3. With A and all preconditions true, create one Web app only in that verified
   existing project, using provider-issued identity. Add the exact bare host
   `staging.shareittoo.com` once, preserving every pre-existing authorized
   domain and unrelated setting. For an API patch, constrain `updateMask` to
   `authorizedDomains` and derive the complete preserved set from immediate
   readback; do not overwrite it from the old capsule. No wildcard, root
   Production host, localhost, custom auth domain or redirect/client edits.
4. Reconcile any pending/uncertain create with read-only operation/app lookup;
   never blindly repeat create after a timeout. An operation acknowledgment is
   not completion. If app creation succeeds but the domain step fails, record
   partial completion, preserve identity privately and stop; no automatic
   deletion, credential rollback, duplicate create or broader corrective write.
5. Independently re-fetch app inventory, registered app configuration, domain
   set and Google provider settings; do not accept mutation responses alone.
   Require app count 0→1 with exact project binding and domain set delta exactly
   `{staging.shareittoo.com}`. Verify no existing domain removal and unchanged
   Google client/provider configuration, other providers, MFA/access policy,
   app flags, runtime and deployment. Unexpected ancillary changes fail closed.
6. Report only whitelisted booleans/counts, exact added hostname, timestamps,
   source/evidence hashes and private evidence locators. No tokens, cookies,
   account identifiers, client IDs/secrets, service-account values, OAuth codes,
   API keys or raw SDK/config payloads in Gemini/Git/chat. A digest accompanying
   visible sanitized evidence must hash those visible bytes; any digest of a
   private snapshot must be explicitly labeled as such.
7. End the provider successor as prerequisite readback only. App activation,
   a reviewed external public configuration/digest, login/cancel/logout and
   subsequent account/session/MFA acceptance are separate bounded work.

## Official primary-source register

All six pages below were opened during preparation on **2026-10-03**. This
records preparation access, not Gemini access. Gemini must freshly reopen every
decisive page at send time and register its own access date/status, current
version/last-update date and supported claim. An older last-update date does
not itself make a freshly opened authoritative API reference obsolete; resolve
currentness and contradictions explicitly. API reference URLs document semantics
only and are not evidence that any API request or project configuration exists.

| ID | Issuer/title and direct URL | Version / displayed last update | Supported claim; preparation access |
|---|---|---|---|
| G1 | Firebase — [Add Firebase to your JavaScript project](https://firebase.google.com/docs/web/setup) | 2026-10-01 UTC | Register Web app within a Firebase project and receive project configuration; OPENED. |
| G2 | Firebase — [Authenticate Using Google with JavaScript](https://firebase.google.com/docs/auth/web/google-signin) | 2026-10-01 UTC | Existing Google-provider/Web popup flow; custom auth-domain instructions are a separate scope and are not proposed; OPENED. |
| G3 | Firebase — [Verify ID Tokens](https://firebase.google.com/docs/auth/admin/verify-id-tokens) | 2026-10-01 UTC | Firebase-project audience/issuer and signature validation semantics; OPENED. |
| G4 | Firebase Management — [projects.webApps.create](https://firebase.google.com/docs/reference/firebase-management/rest/v1beta1/projects.webApps/create) | v1beta1; 2024-10-24 UTC | Web-app creation returns an operation requiring completion/readback; OPENED. |
| G5 | Google Cloud Identity Platform — [projects.updateConfig](https://docs.cloud.google.com/identity-platform/docs/reference/rest/v2/projects/updateConfig) | v2; 2025-05-30 UTC | Field-mask-scoped configuration update semantics; OPENED. |
| G6 | Google Cloud Identity Platform — [Config](https://docs.cloud.google.com/identity-platform/docs/reference/rest/v2/Config) | v2; 2026-03-09 UTC | `authorizedDomains` is the OAuth-redirect domain list; MFA and other configuration are separate fields; OPENED. |

No claim of a correct OAuth consent screen, project identity, console status,
client ID, API enablement, legal approval or success follows from these docs.
Do not use remembered documentation, search snippets, prior AI statements or
screenshots as current primary proof. Missing source/access/freshness means
`NOT VERIFIED` or `STALE`, and prevents A. A disagreement must identify the
current source that supersedes the older claim.

## Immutable repository source register

Owner/issuer for every row: ShareItToo repository. Version: exact HEAD above.
Access: immutable local Git blob on 2026-10-03. Paths are relative
to the verified root. Hashes are SHA-256 of complete file bytes, not excerpts.
There are **19 tracked sources**. Rows are a local provenance register; Sol
must not describe them as sources Gemini independently opened.

Concurrent-worktree note: after initial capture, an independent package added
an acceptance-outcome fixture rule to `AGENTS.md`. Its dirty bytes are outside
this packet's source target and are not substituted for the recorded Git blob.
The rule was read; it does not expand this provider package. Other concurrent
Mission files are likewise excluded. Before send, Sol must review the final
accepted successor HEAD and rebind this packet if its source target changes;
the present register remains immutable d1f provenance, not a clean-tree claim.

```text
1049df34c0a93cbac3b56b2021e368c7ba2838d4f74505d2a3e86a515c49dcbd  AGENTS.md
685fb3387eb9c4a27a64faf2d397071f2f37abfe007e9dc000ade852d4a57bfa  docs/operations/SIT_CODEX_CONTEXT_CREDIT_EFFICIENCY_RULES_V1.md
0c9b844842a2f32d41d762f93963e400f1521d85bc724a0fd0fa64d3b44ca6d0  docs/operations/SIT_PILOT_PHASE_CAPSULE_2026-09-23.md
8b0117bd73268817e404eac265485a57549942145a3d12e16ea800bc167a40ea  lib/services/web_google_auth.dart
f9d7c4cd29512d0e22dbe867260341537f3dff564e8fad6fe629d24bdbf230d5  lib/services/firebase_runtime.dart
e2d8cb65e3d0fee369694165733c74e3b86fbf53b4b2091665488d1866a37922  lib/services/auth_service.dart
3e3f14e987d02c3677fb90bee886f6e26b4c44dfcfcda334d4fe79d7f02d78f9  lib/services/remote_auth_attempt_transaction.dart
b2a29054cdfc65e77c981d1d02c3a0af5f1b8c2a08cc536c58847d5f4c80f515  backend/src/config.js
58843e34ac407b429d2d1886d56fce54a37645e5f92e75ef282953003c235399  backend/src/firebase_social_auth.js
5756f6ce32390c841336c3082d03f04bb73ec9f606bfda7a02fc6e26c82badc6  backend/src/firebase_service_account.js
ac867635b2d02c992347416a0ba3f1f2b681b5902963728c99f89457703863e2  backend/src/app.js
2c5fbdceda06da27acdd977cef4458e7a2629775a87b65a7c16f452617e08b3c  backend/package.json
f41350e5684d8dad431221f9e7d046609fddd279ac271b8574f4ff195575ad9c  backend/pnpm-lock.yaml
6e936b68a9c691a07e06e757869fd5599668fbdb051859887313d65ae492cd7a  tool/staging_web_contract.mjs
2b097d89aaa23253e578af1da1d7c77e899613f7f9faec0c35a6690e6b58eedd  test/tool/web_google_auth_wiring.test.mjs
7f7db0f5e0e4b3a5adb97306c53ffc8f139c2324692b8493d80ea3b50a50b8a8  backend/test/firebase_social_auth.test.js
a133153667b63a41e9c8284cd79fc20d2c109e53850e8621a35a555214f01478  backend/test/firebase_service_account.test.js
986abc9768dde27812a56e5b21672c2665cb8f960800cecf5ca685259a73c736  test/web_google_auth_test.dart
9280ab9d3196818a1dce91bdf9b93ef9489ae21962bb11018039a9bf419542e3  test/tool/staging_web_contract.test.mjs
```

Claim mapping: AGENTS/efficiency policy = authority and evidence routing;
capsule = historical provider/runtime report; Web/runtime/auth/transaction =
configuration and principal handling; backend config/social/service account/app
= project binding, token verification and security gates; package/lock = SDK
version; Web contract = inactive flags; test rows = focused proof and additional
reviewable synthetic cases. Dart and profile test files were inspected, not
executed in this documentation-only package.

The following **three installed dependency snapshots**, inspected locally on
2026-10-03, are separate from Git source and live-runtime evidence. Issuer:
Firebase Admin SDK; installed version 14.2.0 matches the manifest/lock. They
explain SDK audience/issuer enforcement and the emulator-sensitive call path;
they do not prove deployment integrity.

```text
663b3eb9e67a3d1c84d1bd0ab5de068dab98fa7a93a27af96a8e0856498c79f2  backend/node_modules/firebase-admin/lib/auth/token-verifier.js
6178605144b7c8be922ada92f3d56f6a20bb7b5eca80c08a33479421daf9de98  backend/node_modules/firebase-admin/lib/auth/base-auth.js
0f4f70aad87d1ffb5844a368e6e89bd2d754696028c8e41e6460156cf9b78f56  backend/node_modules/firebase-admin/lib/auth/auth-api-request.js
```

Reproduce the focused local proof from the verified root:

```sh
node --test test/tool/web_google_auth_wiring.test.mjs backend/test/firebase_social_auth.test.js backend/test/firebase_service_account.test.js
```

## Required Gemini answer and handoff

Return `RESULT: A PASS | B FIX | C BLOCK`, then `EVIDENCE`, `BLOCKER`, `NEXT`.
Include a complete source register with issuer/title, direct URL or exact
technical capsule locator, version/last-update date, own access date/status,
supported claim and FACT/INFERENCE/PROPOSAL/OPEN class. Identify which sources
were directly opened and which are explicitly operator-supplied facts. End
with a source-freshness and contradiction self-check. Do not claim local or
provider access, invent a locator, or hide an unavailable decisive source.

Preparation outcome: the packet and 14 focused local checks are complete.
Fresh Gemini mode/account, provider/runtime readback with a protected evidence
locator, source revalidation at send, and the actual A/B/C decision remain
OPEN. A later A is an access/security plan decision only, not provider mutation
completion, successful authentication, professional approval or pilot readiness.
