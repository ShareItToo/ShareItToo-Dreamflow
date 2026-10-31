# Apple Web: bounded read-only prerequisite packet

## Result and source binding

Source review target: `1351bb97cc3c784acb18279c812f94531cf52bcc`.
During review HEAD advanced to `a55887a408cc22c08b58139bfd8ad2fcc09e16ff`;
the complete delta consists of four Facebook v2 files. Apple source is
unchanged. The current three-file Apple producer source gate passed with
inventory SHA-256
`4df1e4f8a0e6255aacb764d89dccf5c11753eeca8d13ab5d68477deb75a7b12a`.
The producer, builder and acquisition-boundary cluster passed 127 tests.
This is local source evidence, not a provider login or live configuration read.

The Direct-Web client, server ownership v2 protocol and protected readiness
producer already exist. No duplicate collector or activation flag change is
needed for the next step. Current Apple/provider/runtime facts remain
`NOT VERIFIED` in this package. Do not convert the historical Android readiness
manifest or October 3 console-login failure into current Web evidence.

## Scope and stop boundary

Execute only authenticated readbacks for the already existing ShareItToo
Staging project. No new accounts, identifiers, keys, role changes, Firebase
provider enablement, callback edits, test login, code exchange, deletion,
revocation call, database write, restart or deployment. No secrets, tokens,
raw account identifiers or key-content digests in chat, Git or public evidence.

First resolve the already verified SIT target host, active immutable container
identity and actual mounted configuration paths from the current deployment
record. Do not guess host aliases or credential locations. If the expected
service identity or account access cannot be confirmed, record that narrow
blocker and continue only independent public/source checks.

Read-only capability discovery is the immediate package. Any missing or false
required field produces an explicit gap record; never fill an eligible
readiness JSON with assumed true values. `collect`/`compose` below are later
steps only if every prerequisite is positively observed.

## Evidence acquisition order

| Step | Read-only action | Sanitized output / stop rule |
| --- | --- | --- |
| 1. Source/runtime identity | Read the current source commit, served Web manifest, fixed Staging `GET /api/v1/version`, and label-verified active container/image identity. Compare actual schema/ledger with the deployed runtime contract. | Separate client candidate source, runtime commit/image and current schema evidence. Migration `106_apple_ownership_v2` must be present for v2. No inference from source migration files. |
| 2. Existing Firebase project/app | In the already authorized session, read the selected existing Web app configuration and `defaultSupportedIdpConfigs/apple.com` for `shareittoo-staging`. | Exact public project/app/authDomain/origin binding; provider enabled, Services ID and team/key identity agreement, OAuth secret configured. Read only necessary fields, redact credentials before retaining or hashing. A disabled provider ends activation readiness; do not turn it on. |
| 3. Existing Apple account | Read the authorized Apple Developer account's existing primary App ID, Sign in with Apple capability, associated Web Services ID, enabled signing key, configured domain and Return URL. Refresh official Apple/Firebase field semantics before interpreting unfamiliar console fields. | Presence, association and equality proofs; team/key IDs represented as hashes. Use the actual configured **Direct-Web HTTPS Return URL under Staging**, never a fixture or the older Firebase-handler URL. Missing membership/access/key/configuration is a blocker, not permission to create it. |
| 4. Effective backend configuration | On the exact container bound in step 1, inspect the already configured runtime values through a separately reviewed, read-only status procedure. Retain only configuration booleans and approved nonsecret digests. | Firebase Auth enabled, emulator absent; revocation enabled/configured; ownership configured, protocol 2, acquisition enabled, profile digest, exact Services ID/Return URL/team/key bindings and enforced allowlist. No full `docker inspect`, environment dump or raw config serialization. False/unknown means not eligible. |
| 5. Protected mounts | Resolve the real signing, encryption and coordination mounts from step 4. Inspect file identity, owner/mode, non-symlink status, mounts and readability by the actual runtime UID, without exporting file contents or hashes of secret bytes. | Signing/encryption use protected files; coordination exists and its configured distinct-key check passed. Record hashes of sanitized metadata only. Do not chmod, rotate, generate or remount anything. |
| 6. Existing identities/cohort | Use a bounded read-only transaction on the exact Staging DB to verify chosen accounts are active, already linked to `provider='apple'` with the exact subject/Firebase UID pair, and permitted by both Staging and Apple ownership allowlists. | Only boolean/count/pseudonymous cohort binding in retained evidence; no email-based linking, account creation or seeded fixture substitution. No existing eligible identity means the current lane cannot serve that user. |
| 7. Cleanup/service readiness | Read existing service/worker status and sanitized unresolved Apple ownership/revocation queue counts for the same runtime. | Confirm the deployed worker includes ownership cleanup and Firebase identity/revocation cleanup; do not invoke cleanup/revocation to prove it. Unknown or unresolved operational state is an open gate. |

The fixed Firebase endpoints are derived from the freshly confirmed project
number and Web app ID:

- `https://firebase.googleapis.com/v1beta1/projects/{project-number}/webApps/{web-app-id}/config`
- `https://identitytoolkit.googleapis.com/admin/v2/projects/shareittoo-staging/defaultSupportedIdpConfigs/apple.com`

Credentials stay in the authorized transport/session and must not enter URLs,
console output or retained raw response bodies. This packet does not provide
or authorize credential acquisition.

## Evidence provenance limitation

`backend/src/app.js` serves only `releaseMetadata` from `/version`. It does
**not** publish Apple ownership, revocation, file protection or cohort facts.
Never attribute step 4-7 observations to that HTTP response. Retain separate
protected records for container/configuration, sanitized mount metadata and
cohort/worker observations, with independent review locators outside Git.
`backendReadback.runtimeReadbackSha256` must bind the actual sanitized version
readback; other fields need the separately retained supporting observations.
The existing source register's six slots are not a claim that `/version`
contains all backend fields. If the reviewer cannot trace an asserted field
to current evidence, stop before readiness composition.

Existing config sources are `backend/src/apple_revocation_secret_files.js`
and `backend/src/apple_ownership_config.js`. Required configured values include
`APPLE_REVOCATION_ENABLED`, `APPLE_REVOCATION_CLIENT_ID`,
`APPLE_REVOCATION_TEAM_ID`, `APPLE_REVOCATION_KEY_ID`,
`APPLE_REVOCATION_REDIRECT_URI`, protected signing/encryption files,
`APPLE_OWNERSHIP_COORDINATION_KEY_FILE`, `APPLE_OWNERSHIP_CONFIG_GENERATION`,
`APPLE_OWNERSHIP_ACQUISITION_ENABLED` and `APPLE_OWNERSHIP_WEB_TEST_USER_IDS`.
Historical ownership profiles must be inspected if present; never introduce
an empty replacement ring or discard retained profiles. Current main Staging
Compose source does not itself establish Apple secret/flag forwarding, and
the Green recovery profiles explicitly force Apple off. Only actual effective
runtime evidence can resolve this gap.

## Existing producer and independent decision

Once all prerequisites are true, assemble the exact protected input schema in
`backend/ops/staging_apple_web_readiness_producer.mjs`; do not copy synthetic
fixtures or relabel their evidence. Re-read the current source snapshot rather
than reusing the commit in this document. Inputs are outside Git in existing
owner-owned `0700` directories, single-link `0600` files. Keep observed/expiry
timestamps within one hour and leave sufficient time for independent review.

1. Run the existing `staging_apple_web_readiness_cli.mjs collect` with the
   independently verified input-file digest, protected output directory and
   fresh run ID. It produces a candidate with `activationEligible:false`.
2. A distinct reviewer checks every source/field binding, existing-account-only
   eligibility, protected file evidence and exact current source/runtime.
   The decision binds candidate, configuration, readiness and backend digests;
   it expires no later than the underlying observations.
3. Only then run the existing `compose` with candidate and decision file
   digests. This produces eligibility evidence, not deployment or login proof.
4. A separately scoped Web artifact must use this Apple evidence and a newly
   compatible Google V3 provider readback. Co-enabled providers must share the
   exact Firebase Web app. Never reuse a Google readback stating Apple=false
   to build Apple=true.

## Later acceptance, outside this packet

An enabled candidate still needs a separately authorized real browser/provider
check: SDK/CSP/popup and cancellation; exact existing principal; single-use code
exchange into server-owned v2 acquire/status/session; uncertain-response
recovery without code replay; logout; bounded revocation/deletion acceptance
without disturbing unrelated sessions. Local tests do not close those gates.

No new Gemini gate is required for read-only inventory. An actual contradiction
in Apple/Firebase token semantics or ownership/revocation evidence should become
one narrowly bound protocol gate, not a general request to approve missing
credentials or unobserved runtime facts.
