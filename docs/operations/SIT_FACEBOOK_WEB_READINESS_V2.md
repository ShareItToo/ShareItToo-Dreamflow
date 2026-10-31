# Facebook Web readiness v2

Source-only successor; no provider activation, configuration change, login,
account linking or deployment is performed. The existing v1 collector and its
`META_GRAPH_READBACK_CONTRACT_VERIFIED=false` guard remain unchanged.

## Official contract

The following official Meta pages were fetched with `maxAge:0`, HTTP 200 on
2026-10-31. Public documentation is not evidence of the SIT app's configuration.

- [Graph changelog](https://developers.facebook.com/docs/graph-api/changelog/):
  latest v26.0, introduced 2026-07-29; v23.0 remains supported until 2027-10-08.
- [Application](https://developers.facebook.com/docs/graph-api/reference/application/):
  `GET /v26.0/{application-id}`, App Access Token; documented `id`, `name`,
  `app_domains`. Neither `app_mode` nor `oauth_redirect_uris` is documented.
- [Roles](https://developers.facebook.com/docs/graph-api/reference/app/roles/):
  `GET /v26.0/{app-id}/roles` requires an App Access Token for that app;
  `app_id`, `user`, `role` identify role membership.
- [App Modes](https://developers.facebook.com/documentation/development/build-and-test/app-modes)
  (updated 2025-05-05): Development restricts permissions to app role users.
- [Login Security](https://developers.facebook.com/documentation/facebook-login/security/)
  (updated 2026-06-30): HTTPS, strict exact redirect matching and OAuth controls.
- [Web Login](https://developers.facebook.com/documentation/facebook-login/web/)
  (updated 2026-03-16): dashboard redirect settings; direct Meta JavaScript SDK
  toggles/domains are specific to that integration, not an additional SIT SDK.

## Read-only inputs

The new CLI is `backend/ops/staging_facebook_web_readiness_v2_cli.mjs`.
`collect` requires `--google-token-file`, `--meta-token-file`, `--dashboard`,
`--dashboard-sha256`, `--output-dir`, `--run-id`. Paths must be outside the
repository; protected inputs use owner-owned `0600` single-link regular files
with an owner-owned `0700` parent. Output directories must already exist.
Credentials are used only in Authorization headers, never request queries,
journal entries or diagnostics. No token generation or Graph writes occur.

The separately observed dashboard input has an exact schema enforced by
`validateFacebookV2Dashboard`: version 2, kind
`sit-facebook-web-dashboard-readback`, `syntheticFixture:false`, source
`meta-app-dashboard`, SHA-256 of the Meta app ID, observer identity and protected
observation evidence, observation/expiry UTC timestamps (at most one hour),
Development mode, exact Staging origin and Firebase callback, Client OAuth,
Web OAuth, Strict Mode and HTTPS all enabled, `email`/`public_profile` access
levels, and a sorted unique list of intended pilot users' SHA-256 identifiers.
The observation hash binds independently retained sanitized dashboard evidence;
the collector does not manufacture or itself authenticate that observation.
The independent reviewer must check its source and content before approval.

API collection verifies the same Firebase app/provider and Meta app, then checks
every intended user's current administrator/developer/tester role. Insights-only
membership is insufficient. Incomplete/paginated roles responses fail closed;
no next-page URL is followed. This bounded policy may reject a larger app's
otherwise valid role roster and requires a separately reviewed pagination
successor, never an unbounded traversal or a scope bypass.

Candidates/journals export only Meta app/user/collector identity hashes, fixed
URL templates and allowlisted proof fields. Raw provider responses, email,
tokens, secret values or secret hashes are never exported. Public Firebase
client identifiers and API configuration remain necessary for the existing
Web builder's exact configuration contract. Hashes are pseudonymous bindings,
not a claim that low-entropy identifiers have been anonymized.

`compose` requires `--candidate`, `--candidate-sha256`, `--journal`,
`--journal-sha256`, `--decision`, `--decision-sha256`, `--output-dir`, `--run-id`.
Decision schema 2 binds candidate/journal hashes, approved status, reviewer and
review-evidence hashes and fresh timestamps. Reviewer identity must differ
from both the API collector and dashboard observer. Approval cannot outlive
either input. Exact current committed source closure is checked at both steps.

The accepted real envelope retains the existing builder input contract. It is
eligibility evidence only; no successful sign-in, registration, account linking
or live activation is inferred. Existing-login-only backend restrictions and
Google's current provider-state binding remain separate gates.

## Verification boundary

`node --test test/tool/staging_facebook_web_readiness_v2.test.mjs` drives the
actual protected-file CLI Collect -> Compose chain with a synthetic network.
The programmatic test seam requires synthetic inputs and preserves
`syntheticFixture:true` through all outputs. The normal process CLI has no test
flag and rejects these inputs. The existing readiness consumer rejects the
synthetic output. Negative tests assert the specific failure and the request
count at that phase, including missing/stale dashboard data, foreign app/roles,
OAuth/redirect drift, leaks and altered/extra journal endpoints.
