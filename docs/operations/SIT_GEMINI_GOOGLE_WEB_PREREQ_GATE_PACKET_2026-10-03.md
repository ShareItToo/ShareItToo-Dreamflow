# SIT Google Web prerequisite — prepared Gemini gate packet

Status: **PREPARED / NOT SENT**. Gate `SIT-GOOGLE-WEB-PREREQ-01` has no
accepted Gemini decision in this package. Successor preparation date: 2026-10-03.
This document is a review packet, not an execution instruction or live approval.

## Exact boundary and authority

- Project: ShareItToo/SIT; repository
  `ShareItToo/ShareItToo-Dreamflow`. All source paths below are relative.
- Branch: `codex/master-workflow-20260808`; reviewed source predecessor:
  `86cc23ac876ddb3c9b1c5818ac1996b9ce3939ab` (`86cc23ac`). This is the
  immutable implementation commit immediately preceding this documentation
  successor, not a claim that a future packet commit is its own source HEAD.
  Local Git resolves that predecessor and its registered bytes; no remote,
  deployment or clean-tree claim follows. The runner is
  `backend/ops/staging_google_web_prerequisites.mjs`, SHA-256
  `e964986ae0a208f5205a6f54ec346fbd7fb9d37f969fef4e81ed7188d972c193`.
- Scope: prepare one access/security decision about exactly one Firebase Web
  app in the existing Staging-runtime Firebase project, plus addition of only
  `staging.shareittoo.com` to its existing authorized-domain set, followed by
  sanitized independent readback. This is not a new Firebase project.
- Explicit user authorization for that bounded successor already exists in
  the current task instruction. Do not ask for permission again after exact
  account, mode, source and provider preflight and an accepted A decision.
  The preparation worker itself has no authority to send or mutate anything.
  This packet supplies neither a live adapter nor executable gate approval.
- The source-bound excerpts, focused checks and hashes below are the technical
  handoff. Gemini is not assumed to have access to local files, private GitHub,
  provider consoles, runtime, credentials or prior conversations. Sol supplies
  the verified technical capsule; Gemini freshly opens official platform
  sources. Missing local access is not cured by pretending a path was opened.
- The mutable phase capsule is excluded from the current source register and
  was not read for this refresh. Neither its earlier provider/runtime reports
  nor earlier UI observations establish today's account, project, domain,
  Web-app inventory, deployment or emulator state.

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
> disabled? Return exactly one decision: **A PASS**, **B PASS** or **C BLOCK**.
> A means the narrow plan may proceed after the preserved fresh preflight;
> it never means provider creation, domain change, authentication or release has
> succeeded. B accepts only source-only preparation/contract readiness, lists
> remaining execution proofs, and does not authorize any provider mutation.
> The runner accepts only an exactly bound, unexpired A PASS for execution;
> B must never be translated into A. C identifies a missing decisive source, unsafe mismatch,
> unresolved contradiction or required out-of-scope action. Do not review or
> activate later login, rollout, Mission, payment or other provider work.

Before sending, the coordinator must verify the visible correct SIT Google AI
Pro account/thread and the selector **Pro** with **Extended**, immediately
before submission. Signed-out state, Flash/Flash-Lite, another mode, or a Pro
quota block means no send and no accepted answer; preserve the packet and wait.
Earlier signed-out/Flash-Lite reports are historical, not a current UI
assertion. No Gemini login, browser access or provider request was performed
in this refresh. Existing user authorization remains intact; successful
preflight and the accepted A decision do not require another permission ask.

Historical/non-accepting: a prior Gemini answer returned **C BLOCK** because
it had no web access. Preserve that outcome as evidence of the access failure,
not as a current source review or acceptance. No fresh Gemini answer is recorded
here. If fresh direct access is still unavailable, return C BLOCK again; do not
substitute B PASS, cached knowledge, invented citations or a guessed approval.

Anti-hallucination rules for the reviewer: freshly open every decisive official
page; record the actual access status/date and displayed version/update date;
quote only what was accessible; label an unavailable date as unavailable.
Distinguish directly opened primary sources from supplied repository excerpts
and sanitized operator facts. Never assert private-file, provider, browser,
account or runtime access you did not have. Do not invent project values,
operation outcomes, API concurrency guarantees, tests, live evidence or approval.
Expose contradictions and missing evidence before choosing a result. The exact
Pro/Extended observation and fresh sources are prerequisites, not assumptions.

## Evidence classes and decisive technical facts

Use `FACT`, `INFERENCE`, `PROPOSAL` and `OPEN` explicitly. A fact about what a
repository document reports is not a verified fact about a current provider.

| Class | Claim and decisive source | Limit |
|---|---|---|
| OPEN — live prerequisite baseline | Zero Web apps, staging domain missing, Google provider/client configuration present, backend auth enabled, matching runtime/service-account/native project and no emulator are required baseline checks for the proposed two-change plan. | None was queried in this refresh. All are NOT VERIFIED until the immediate independent read-only provider/runtime preflight with protected evidence; earlier capsule claims are not current proof. |
| FACT — source | `backend/src/config.js` derives `firebaseProjectId` from `FIREBASE_PROJECT_ID`, supplies it to `socialAuth`; `firebase_social_auth.js` validates the service account against it and initializes the named auth app with the same project. `firebase_service_account.js` rejects another project. | Proves configured binding logic; does not reveal or verify today's project ID or running environment. |
| FACT — source/SDK | `verifyFirebaseSocialToken` uses `auth.verifyIdToken(token, true)` outside its explicit injected test seam. Locked and locally installed `firebase-admin` is 14.2.0; its token verifier checks exact `aud === projectId` and `iss === 'https://securetoken.google.com/' + projectId`. | Injected unit verification is not a real signed-token/audience/issuer test. Live dependency bytes and emulator absence require runtime readback. |
| FACT — source | `WebGooglePublicConfig.isBound` requires Web-app/sender/project shape, matching backend project, default project Firebase auth domain, exact Staging origin and an approved public-config SHA-256; `optionsFor` additionally requires Google/backend flags and exact Staging API URL. | Hashing guessed configuration is not approval or provider evidence. No real project ID, app ID, client ID or key is supplied here. |
| FACT — source | The bound Google Web path in `auth_service.dart` uses `signInWithPopup`, account selection and a fresh ID token, then the principal-bound remote transaction and `/auth/social` exchange. Web initialization uses memory persistence. | This does not claim Google is the only implemented Web provider. Wiring is source evidence, not a provider or login result. |
| FACT — source | The default `tool/staging_web_contract.mjs` profile keeps all social/activation flags false. Its explicit `staging-google-web-v1` successor accepts a validated seven-field config plus independently reviewed digest and enables exactly Google and activation-validation; Apple/Facebook stay false. `backend/src/app.js` checks the transaction-resolved principal against the Staging allowlist before consequential writes and retains consent/MFA/session gates. | The optional build path exists; this packet neither invokes it nor changes any flag, allowlist, account, session or policy. |
| FACT — source | `staging_google_web_prerequisites.mjs` implements an injected-adapter, default-read-only state machine, exact source/gate/baseline binding, protected journal, one create submission, guarded domain update and public-config export. | No live transport or CLI exists. Adapter completeness, provider concurrency guarantees and live effects remain unverified. |
| FACT — historical checks | The older packet at `75b7e19dba55579a2b1a8df0e6746e61b5c57874` recorded 14 focused tests on 2026-10-03 (3 wiring, 6 token, 5 service-account). The reviewed runner package recorded 59/59 focused; standard backend 2,422 passed / 26 skipped / 0 failed (2,448 total); consumer closure 2,992/2,992. | Local log summaries were checked in this documentation refresh; no tests were rerun here. Historical/synthetic proof is not live acceptance. |
| INFERENCE | If the fresh independent baseline proves every stated prerequisite, one Web-app registration and one authorized-domain addition are the smallest missing provider prerequisites identified by this plan. | The baseline and sufficiency for later login remain unverified; do not infer either from source tests. |
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
  GOOGLE_WEB_PROFILE = 'staging-google-web-v1'
  default profile:
  SIT_SOCIAL_GOOGLE_ENABLED: 'false'
  SIT_SOCIAL_APPLE_ENABLED: 'false'; SIT_SOCIAL_FACEBOOK_ENABLED: 'false'
  SIT_SOCIAL_PROVIDER_ACTIVATION_VALIDATED: 'false'
  explicit bound Google profile:
  SIT_SOCIAL_GOOGLE_ENABLED = 'true'
  SIT_SOCIAL_PROVIDER_ACTIVATION_VALIDATED = 'true'
backend/ops/staging_google_web_prerequisites.mjs:
  execute = false
  binding.sourceCommit === git rev-parse HEAD
  binding.gate.decision === 'A PASS' before execution
  save({ phase: 'create_intent' }) before createWebApp
  updateMask: 'authorizedDomains'
  status: 'prerequisites-verified-config-awaiting-review'
  providerApprovalInferred: false; buildExecuted: false
```

These abbreviated excerpts state the checked predicates, not standalone
executable code. The local SDK additionally reads `FIREBASE_AUTH_EMULATOR_HOST`;
its absence cannot be established by repository search. The runtime check must
also exclude an already initialized mismatched named app or emulator mode.

## Preconditions, exact mutation and independent readback

1. Sol verifies the current task's unchanged authorization, exact source bytes
   and visible Gemini account/mode. The register binds predecessor `86cc23ac`,
   not this future documentation commit. Before execution, explicitly rebind
   the reviewed gate to the actual checkout HEAD (the runner requires exact
   equality), runner digest, current baseline digest, evidence digest and expiry.
   Document any intervening documentation-only commit and verify every decisive
   source is unchanged; changed decisive bytes require a successor review.
   Never transplant an old A onto another source/baseline or silently relabel
   the predecessor as current. Keep deployed Web, API runtime and repository HEAD identities
   separate. No current deployed Web/API identity is established by this
   source refresh; obtain those identities in the immediate read-only preflight
   instead of carrying forward historical capsule values.
2. Before accepting A, obtain a current sanitized operator fact capsule with
   read time and protected evidence locator. Before mutation, repeat the
   identity and mutable-state check: correct authorized provider account;
   exact existing project matches Staging runtime, service account and native
   binding; runtime auth enabled; exact audience/issuer implementation and no
   emulator; Google enabled/client config present; zero Web apps and the
   Staging domain absent. The adapter must supply complete paginated inventories,
   exact project ID/number/backend binding, revision, all domains/apps and
   full unrelated-auth/provider/other-app/runtime fingerprints, including
   secret-bearing settings by digest only. Preserve the complete baseline
   privately; a count-only or truncated snapshot is insufficient. Abort on
   missing access, ambiguity, project/account mismatch, changed baseline,
   unconfirmed project sharing/blast radius, or stale evidence. Never create a
   duplicate app when a fresh read shows the prerequisite already exists.
3. An independently reviewed provider adapter must enforce bounded transport
   deadlines and no automatic mutation retries. It must prove either a
   provider-enforced conditional update (CAS against the observed revision) or
   an exclusive lease excluding **all** configuration writers for the entire
   read/patch/readback window. `updateMask`, a read-before-write check and the
   local journal lock are not CAS or an all-writer lease. Do not invent ETag,
   revision or lease support from the runner interface; absent official and
   operational proof blocks the live lane. Review pagination, operation identity,
   public SDK retrieval, IAM scope and ancillary effects before accepting A.
   With A and all preconditions true, create one Web app only in that verified
   existing project, using provider-issued identity. Add the exact bare host
   `staging.shareittoo.com` once, preserving every pre-existing authorized
   domain and unrelated setting. For an API patch, constrain `updateMask` to
   `authorizedDomains` and derive the complete preserved set from immediate
   readback; do not overwrite it from the old capsule. No wildcard, root
   Production host, localhost, custom auth domain or redirect/client edits.
4. Before submission persist exactly one create intent to the append-only,
   fsynced, current-user-owned `0600`, regular single-link external journal in
   a protected `0700` directory. Reject symlinks, foreign/stale/tampered journal
   state, changed bindings and unsafe output. A known pending operation resumes
   only by its original operation identity with independent app-inventory
   readback, never by count alone. A lost create response leaves `create_intent`:
   fail closed with unknown outcome, preserve partial state and **do not retry
   create**, even when inventory appears unchanged. Read-only investigation
   cannot itself authorize a second create. An operation acknowledgment is
   not completion. If app creation succeeds but the domain step fails, record
   partial completion, preserve identity privately and stop; no automatic
   deletion, credential rollback, duplicate create or broader corrective write.
5. Independently re-fetch app inventory, registered app configuration, domain
   set and Google provider settings; do not accept mutation responses alone.
   Require app count 0→1 with exact project binding and domain set delta exactly
   `{staging.shareittoo.com}`. Verify no existing domain removal and unchanged
   Google client/provider configuration, other providers, MFA/access policy,
   app flags, runtime and deployment. Unexpected ancillary changes fail closed.
   Persist domain intent before submitting the guarded patch. After response
   loss, reconcile only by fresh readback; an exact expected result may advance
   the same journal, but unchanged/ambiguous/drifted state fails closed. **Never
   replay that patch**, including after an apparently unchanged read, or
   reconstruct its preserved set from stale data. Recheck gate/lease expiry
   immediately before mutation and baseline/revision immediately before patch.
   If either mutation's final state remains ambiguous, report partial/unknown
   completion and stop the mutating lane, preserving the original operation
   identity privately. Do not undo a confirmed create or widen scope to force
   a successful readback.
6. Report only whitelisted booleans/counts, exact added hostname, timestamps,
   source/evidence hashes and private evidence locators. No tokens, cookies,
   account identifiers, client IDs/secrets, service-account values, OAuth codes,
   API keys or raw SDK/config payloads in Gemini/Git/chat. A digest accompanying
   visible sanitized evidence must hash those visible bytes; any digest of a
   private snapshot must be explicitly labeled as such.
7. Read only the provider-issued public SDK config for the exact verified app.
   Export exactly seven string fields, in canonical digest order:
   `projectId`, `messagingSenderId`, `appId`, `apiKey`, `authDomain`,
   `backendProjectId`, `authorizedOrigin`. Use the existing
   `bindGoogleWebConfig` / `readGoogleWebConfig` contract: compact UTF-8 JSON
   SHA-256, default `projectId.firebaseapp.com` auth domain, matching project/
   sender/app/backend and exact `https://staging.shareittoo.com` origin. The
   output is an exclusive-created owned `0600` single-link external file in a
   protected `0700` non-symlink directory, never overwritten. These are public
   SDK values, not service-account/OAuth secrets, but remain out of Git/chat/logs.
   A generated digest proves integrity only: independent review of the public
   values against provider/backend readback must approve that digest separately.
   Do not pass an automatically generated digest straight through as approval.
8. End this successor as prerequisite readback/config-awaiting-review only.
   A later separately authorized build uses `tool/build_staging_web.mjs` with
   `--google-web-config ABS_PUBLIC_CONFIG_JSON REVIEWED_CONFIG_SHA256` and an
   exact clean source HEAD. Schema 2 binds `staging-google-web-v1`, its config
   digest and complete profile; only Google/activation-validation become true.
   Build success, sealed artifact/archive verification, deploy/route/release
   identity readback, and real popup/login/cancel/logout plus session/MFA/
   allowlist/consent acceptance are separate evidence stages. Neither source
   tests, public config, A PASS nor a build proves deploy or successful login.

## Historical official-source preparation register — fresh reviewer check required

The earlier packet records accesses to all six pages on **2026-10-03**. They
were **not reopened in this source-only refresh**; the recorded OPENED/status
dates below are historical observations, not current external verification.
Their current content, availability and last-update dates remain NOT VERIFIED
here. No platform/API claim is freshly certified by this update. Gemini must
freshly reopen every
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

The six recorded pages do not by themselves prove conditional-update support,
an all-writer lease, complete pagination, operation lookup or exact SDK-config
retrieval semantics. The adapter review must freshly open the decisive official
references for those operations and append their exact URLs, versions, dates
and supported claims to its answer register. Missing references or unsupported
concurrency semantics block A; no undocumented API behavior may be assumed.

## Immutable repository source register

Owner/issuer for every row: ShareItToo repository. Version: the exact reviewed
source predecessor `86cc23ac876ddb3c9b1c5818ac1996b9ce3939ab`, not this packet's
future commit or a deployment identity.
Access: immutable local Git blob on 2026-10-03. Paths are relative
to the verified root. Hashes are SHA-256 of complete file bytes, not excerpts.
There are **23 tracked sources**. Rows are a local provenance register; Sol
must not describe them as sources Gemini independently opened.

All 23 hashes were recomputed from the exact predecessor Git blobs and matched
to current source bytes during this refresh. The earlier `75b7e19d` packet
binding and its earlier d1f target are superseded as current review inputs;
historical audit
records are not rewritten. The phase capsule is deliberately not an input.
Before send, review any accepted successor and rebind if decisive bytes change;
this register remains exact-source evidence, not a clean-tree or runtime claim.

```text
124729bf8cf1a12eca02f769e3090fa13ba2f7fe17a6b859510795e4ecb028da  AGENTS.md
685fb3387eb9c4a27a64faf2d397071f2f37abfe007e9dc000ade852d4a57bfa  docs/operations/SIT_CODEX_CONTEXT_CREDIT_EFFICIENCY_RULES_V1.md
379b3e61a577bd531c7bf188be9e3190058d4f64a6af2d9228311f68d78f9b08  lib/services/web_google_auth.dart
f427159aa20ba071d0e764b85c981db98059564d1ec4ea9ac3838c3ef2447249  lib/services/firebase_runtime.dart
aa6d5b9cba2345f0469d4b317197175d58c234a9adda47da6d6ea6729089e00e  lib/services/auth_service.dart
3e3f14e987d02c3677fb90bee886f6e26b4c44dfcfcda334d4fe79d7f02d78f9  lib/services/remote_auth_attempt_transaction.dart
0877f2ecdf5157fedb6906b0adfa1a8ade3a730fe7929c395e1f10ac8cb9bd77  backend/src/config.js
58843e34ac407b429d2d1886d56fce54a37645e5f92e75ef282953003c235399  backend/src/firebase_social_auth.js
5756f6ce32390c841336c3082d03f04bb73ec9f606bfda7a02fc6e26c82badc6  backend/src/firebase_service_account.js
c822d43a0980846193e948b155133ecc2ad2754bcd80a98d01c8ddb58c6e2b00  backend/src/app.js
2c5fbdceda06da27acdd977cef4458e7a2629775a87b65a7c16f452617e08b3c  backend/package.json
0a757fc74c04c83889b21a0969b498406cffde26eefdd7f9b4c75d08574f3982  backend/pnpm-lock.yaml
5f61cf910cd5d1260e8bbc3eecc24bc605a43fe1d80095fe434ad212bbc234fb  tool/staging_web_contract.mjs
73708e7e2b4646fc924960abaed4b4bd2306c1400e6fae68413890f2e3edd494  test/tool/web_google_auth_wiring.test.mjs
7f7db0f5e0e4b3a5adb97306c53ffc8f139c2324692b8493d80ea3b50a50b8a8  backend/test/firebase_social_auth.test.js
a133153667b63a41e9c8284cd79fc20d2c109e53850e8621a35a555214f01478  backend/test/firebase_service_account.test.js
35fdedc04694572db461deccb030e474328a6326e96e41153849086511ecb542  test/web_google_auth_test.dart
71472890295d1fa37f9a3754d439eaf78b2eb7c5e3ad882957d21e92f7789b27  test/tool/staging_web_contract.test.mjs
e964986ae0a208f5205a6f54ec346fbd7fb9d37f969fef4e81ed7188d972c193  backend/ops/staging_google_web_prerequisites.mjs
d0f640a4ed633fc5d0cabb07358ce78533574fb03af47dd20b81bd36889d9da2  backend/test/staging_google_web_prerequisites.test.js
f81c97f12b1e8d1bdb704a422eb00e1dda9863748c328df6ec447790c71c4191  tool/build_staging_web.mjs
33378a471d2771a606a8b818aa804fea92ec5175badab81b87fe8dbbbbb9cedb  test/tool/staging_web_google_profile.test.mjs
1fea32813a3def7c94722ffd42d1ca6200b27b4d22864c98495018c291363395  docs/operations/STAGING_WEB_PILOT.md
```

Claim mapping: AGENTS/efficiency policy = authority and evidence routing;
Web/runtime/auth/transaction =
configuration and principal handling; backend config/social/service account/app
= project binding, token verification and security gates; package/lock = SDK
version; Web contract/builder/pilot guide = default-off and optional bound
schema-2 profile; prerequisite runner = source-only transition state machine;
test rows = historical focused proof and reviewable synthetic cases. No tests
were executed in this documentation-only refresh. Hashing is not execution.

The following **three installed dependency snapshots**, recorded as rechecked
with unchanged SHA-256 values in the earlier 2026-10-03 packet, are preserved
historically (not rechecked in this documentation successor), separate from Git source and
live-runtime evidence. Issuer:
Firebase Admin SDK; installed version 14.2.0 matches the manifest/lock. They
explain SDK audience/issuer enforcement and the emulator-sensitive call path;
they do not prove deployment integrity.

```text
663b3eb9e67a3d1c84d1bd0ab5de068dab98fa7a93a27af96a8e0856498c79f2  backend/node_modules/firebase-admin/lib/auth/token-verifier.js
6178605144b7c8be922ada92f3d56f6a20bb7b5eca80c08a33479421daf9de98  backend/node_modules/firebase-admin/lib/auth/base-auth.js
0f4f70aad87d1ffb5844a368e6e89bd2d754696028c8e41e6460156cf9b78f56  backend/node_modules/firebase-admin/lib/auth/auth-api-request.js
```

Historical check provenance: the earlier packet's 14-test command was:

```sh
node --test test/tool/web_google_auth_wiring.test.mjs backend/test/firebase_social_auth.test.js backend/test/firebase_service_account.test.js
```

The implementation package's final runner command was
`node --test backend/test/staging_google_web_prerequisites.test.js` (59/59).
Its retained local log basenames are `sit-google-prerequisite-runner-final.log`,
`sit-google-prerequisite-backend-final.log` and
`sit-google-prerequisite-consumers.log`; the coordinator holds their external
locations. Their count summaries were read locally for this successor, not
independently opened by Gemini. The runner cases cover default read-only,
source/gate/baseline binding, pending/lost/foreign operation, no-repeat create
and patch, full inventory/unrelated-state drift, conditional/all-writer guard,
tampered journal shape, permissions/symlink/hardlink/path boundaries, config
shape/digest and sanitized adapter/cleanup failures. The profile test command
is `node --test test/tool/staging_web_google_profile.test.mjs`; its compiler
seam is synthetic, not a Flutter build or provider login.

## Required Gemini answer and handoff

Return `RESULT: A PASS | B PASS | C BLOCK`, then `EVIDENCE`, `BLOCKER`, `NEXT`.
Use the exact decision meanings above; B is source-only acceptance and cannot
close the execution gate. With no fresh decisive web access, return C BLOCK.
Include a complete source register with issuer/title, direct URL or exact
technical capsule locator, version/last-update date, own access date/status,
supported claim and FACT/INFERENCE/PROPOSAL/OPEN class. Identify which sources
were directly opened and which are explicitly operator-supplied facts. End
with a source-freshness and contradiction self-check. Do not claim local or
provider access, invent a locator, or hide an unavailable decisive source.

Preparation outcome: documentation successor and local source/hash/link
consistency checks are complete; no fresh test execution, send or live action.
Fresh Gemini mode/account, provider/runtime readback with a protected evidence
locator, independently reviewed provider adapter/concurrency proof,
source revalidation at send, and the actual A/B/C decision remain
OPEN. A later A is an access/security plan decision only, not provider mutation
completion, successful authentication, professional approval or pilot readiness.
