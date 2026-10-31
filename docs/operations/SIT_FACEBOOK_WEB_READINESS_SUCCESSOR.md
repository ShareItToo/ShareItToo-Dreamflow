# Facebook Web readiness successor

This is a staging-only, read-only evidence producer. It does not enable the
Firebase provider, change Meta settings, build/deploy the app, or prove a user
login. `NOT_VERIFIED` means a required authenticated read was unavailable or
did not match the fixed staging contract.

The collector accepts current Google/Firebase and Meta bearer tokens only from
separate owner-only files (`0600` in an existing `0700` directory outside the
repository). It performs only the exact GETs in
`backend/ops/staging_facebook_web_readonly_collector.mjs`, without redirects,
retries, query-string credentials, or response-body output. The current
official Meta reference for Graph version and application fields could not be
verified during review (developers.facebook.com returned HTTP 429). Therefore
the collector stops before any Meta Graph request and returns `NOT_VERIFIED`;
no candidate, journal, or readiness file is published. Do not treat the mock
tests as external provider evidence. Before enabling Graph collection, verify
the exact current version, endpoint/token binding, and fields (`app_mode`,
`app_domains`, `oauth_redirect_uris`) against official Meta documentation and
update the pinned contract and tests. The Firebase provider secret is checked
only for presence/shape; response evidence hashes a redacted representation.

Production CLI runs also require a clean, committed source snapshot matching
the exact CLI, collector, writer, and readiness-contract import closure. An
uncommitted or drifted source tree is rejected before output reservation.

Create a fresh output directory owned by the operator with mode `0700`, and
prepare token files outside Git with mode `0600`. Then collect:

```sh
node backend/ops/staging_facebook_web_readiness_cli.mjs collect \
  --google-token-file /protected/google-bearer-token \
  --meta-token-file /protected/meta-app-bearer-token \
  --output-dir /protected/output \
  --run-id RUN_ID
```

A collection can publish files only after every required readback succeeds.
Review the sanitized candidate and complete GET/read-hash register independently. The
reviewer decision file must be canonical JSON with exactly these fields:
`schemaVersion`, `kind`, `decision`, `syntheticFixture`, `candidateSha256`,
`journalSha256`, `collectorIdentitySha256`, `reviewerIdentitySha256`,
`reviewEvidenceSha256`, `decidedAtUtc`, `validUntilUtc`. Use
`schemaVersion: 1`, `kind: "sit-facebook-web-independent-decision"`,
`decision: "approved"`, `syntheticFixture: false`; reviewer and collector
identity hashes must differ. Decision validity is capped at one hour and the
candidate/journal byte hashes must match the collector output.

Compose after independent review using a fresh run ID:

```sh
node backend/ops/staging_facebook_web_readiness_cli.mjs compose \
  --candidate /protected/output/RUN_ID.candidate.json --candidate-sha256 CANDIDATE_SHA256 \
  --journal /protected/output/RUN_ID.journal.json --journal-sha256 JOURNAL_SHA256 \
  --decision /protected/independent-decision.json --decision-sha256 DECISION_SHA256 \
  --output-dir /protected/output --run-id COMPOSE_RUN_ID
```

The readiness output is a protected input to the existing Web builder:
`--facebook-web-readiness /protected/output/COMPOSE_RUN_ID.readiness.json EVIDENCE_SHA256`.
It only makes the artifact eligible for the existing staging build contract;
it is not provider activation or successful-login evidence. Failed runs may
leave no output names; the writer uses private temporary files and publishes
no-clobber names only after complete fsync/readback.
