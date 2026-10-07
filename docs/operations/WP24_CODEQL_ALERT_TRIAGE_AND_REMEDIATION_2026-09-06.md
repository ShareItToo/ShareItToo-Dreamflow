# WP24 CodeQL alert triage and remediation

## Outcome

WP24 is complete at implementation HEAD
`3ab44472885dab14e88808e3684c1f13cf0c5cc6`. The exact PR #7 merge
analysis has zero open CodeQL alerts. Six original alerts were removed by
source changes; one intermediate password-flow alert exposed by the first
correction was also removed. The four remaining intentional egress alerts were
reviewed and dismissed individually with path-specific reasons. There is no
global query exclusion, workflow ignore, severity reduction or broad source
suppression.

PR #7 remains Draft, open, mergeable and unmerged. No candidate, Pixel,
OnePlus, Google Play, Production, payment, provider configuration, Firebase
Console, Cloud/VPS/DNS or public-registration state changed.

## Structural corrections

- Owner-only build profiles, Listing-AI image fixtures and Stripe Staging
  secrets are opened with no-follow descriptors and validated through the
  opened descriptor before use. The password-change test uses the same safe
  read pattern.
- The password-reset source assertion now escapes every regular-expression
  metacharacter rather than only `?`.
- The password-change recovery journal no longer publishes or stores a fast
  digest derived from credential-bearing JSON. Its private source-vault
  integrity check uses HMAC-SHA-256 plus constant-time comparison; the key,
  MAC and replacement credential remain inside the same owner-only private
  journal and none is included in public evidence.
- A first GitHub scan showed that a remaining generic SHA helper still received
  password-tainted data through a public-state projection. The projection and
  helper were removed completely rather than hidden or relabelled.

## Intentional egress triage

The `js/file-access-to-http` query correctly identified four deliberate data
flows, so they were not represented as source vulnerabilities that could be
fixed without removing required functionality:

- Alert 530: the separately gated server-only Listing-AI adapter sends an
  owner-only API credential and consent-screened WebP derivative only to the
  fixed official OpenAI Responses endpoint. Dismissed as `won't fix` with the
  exact boundary rationale.
- Alert 532: the owner-only password-reset diagnostic verifies a protected
  fixture only at the fixed non-production ShareItToo Staging login endpoint.
  Dismissed as `used in tests`.
- Alerts 539 and 540: the owner-only physical-device messaging diagnostic sends
  only its required protected fixture inputs to the fixed non-production SIT
  origin; paths are relative and validated and resource identifiers are
  encoded. Dismissed individually as `used in tests`.

All three source paths carry a durable `SIT-INTENTIONAL-EGRESS` audit marker,
and regression tests lock the fixed endpoint, no-follow credential boundary,
runtime gates, relative-path validation and identifier encoding. The alert
history remains visible in GitHub; only the exact reviewed instances were
triaged.

## Verification

- Focused WP24 and affected security tests: 39 passed.
- Complete repository tool suite: 2,324 passed.
- Focused backend OpenAI/Stripe secret checks: 20 passed.
- N17 readiness validator and its source binding: passed.
- Complete local technical regression: passed, including Flutter/analyzer,
  Web/Wasm, loopback smoke and Android minSdk 24 build.
- GitHub CodeQL run `34024441466`: success on exact implementation HEAD.
- GitHub Regression run `34024441534`: success on exact implementation HEAD;
  Backend, PostgreSQL, Flutter and independent clean-checkout reproducibility
  all passed. The production image-publish job remained skipped.
- Exact PR merge analysis SHA:
  `ae19d7eadb9584dc6265f9d14e193925a79474fa`.
- Exact open-alert query after remediation and triage: zero.

The N17 source ratchet changed only the exact SHA-256 binding for
`backend/src/openai_listing_ai_provider.js`, whose source-local intentional-
egress marker changed. N17 status, provider selection, execution flags, budget,
billing truth, activation state and Production eligibility did not change.

## Remaining risks

The four dismissed flows remain security-sensitive by design and must retain
their fixed destinations, owner-only secret handling, explicit gates and
regression coverage. Any endpoint, redirect, payload, credential source or
activation-boundary change must reopen security review rather than inherit
this triage.

WP24 creates no successor Android candidate and does not supersede the exact
WP23 candidate `1.0.0+2026090606` at source
`637c80d0086f7ad1aa08fe5ba1df5c1624b3e545` or its physical evidence.
