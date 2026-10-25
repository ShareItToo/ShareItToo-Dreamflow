# Apple Web readiness producer successor

This is a protected, read-only evidence producer for the existing Apple Web
readiness consumer. It does not configure Apple or Firebase, call a sign-in
provider, or enable a provider. Until real authenticated readbacks have been
collected and independently reviewed, status remains unverified.

## Official field semantics

- Apple Services ID, primary App ID association, web domains, and return URLs:
  [Configure Sign in with Apple for the web](https://developer.apple.com/help/account/capabilities/configure-sign-in-with-apple-for-the-web/).
- Firebase Apple provider, Services ID, Apple team/key setup, and Firebase web
  authentication configuration:
  [Firebase: Authenticate Using Apple](https://firebase.google.com/docs/auth/web/apple).
- Read-only Firebase web-app configuration and Apple supported-provider
  readbacks use the documented Firebase Management and Identity Toolkit API
  endpoints embedded in the source register. The producer accepts only those
  exact project/app-bound URLs; these endpoints are evidence inputs, not a
  request to change configuration.
- Runtime evidence is the fixed staging `GET /api/v1/version` readback. Secret
  evidence is limited to protected file metadata and SHA-256 digests. Private
  key bytes, OAuth secrets, access tokens, API response bodies containing
  credentials, and their digests are prohibited from the input artifact.

## Protected inputs and outputs

Prepare the readback JSON outside the repository in an owner-owned `0700`
directory as a single-link `0600` regular file. Supply its raw SHA-256 to the
CLI. The exact JSON schema is enforced by
`backend/ops/staging_apple_web_readiness_producer.mjs`: source commit and
collector identity; UTC observation/expiry (at most one hour); configured
Apple/Firebase values; sanitized Apple Console, Firebase web-app/provider,
backend runtime and protected-secret metadata readbacks; and a complete
source register whose hashes bind to those readbacks. `syntheticFixture` must
be `false` for the production CLI. Any unknown, extra, stale, mismatched, or
synthetic field is rejected.

The source commit must be the current clean commit, and the CLI verifies the
committed blob plus current-byte digest for its complete three-file import
closure. Outputs are written outside the repository, into an owner-owned
`0700` directory, as new `0600` files with no-clobber publication:

```sh
node backend/ops/staging_apple_web_readiness_cli.mjs collect \
  --readbacks /protected/path/apple-readbacks.json \
  --readbacks-sha256 <raw-sha256> \
  --output-dir /protected/output \
  --run-id <unique-run-id>

node backend/ops/staging_apple_web_readiness_cli.mjs compose \
  --candidate /protected/output/<run-id>.candidate.json \
  --candidate-sha256 <raw-sha256> \
  --decision /protected/path/independent-decision.json \
  --decision-sha256 <raw-sha256> \
  --output-dir /protected/output \
  --run-id <unique-run-id>
```

The decision file is a fresh, independently authored approval bound to the
candidate/configuration/readiness/backend digests; reviewer identity must
differ from collector identity. `collect` produces a candidate awaiting review.
`compose` produces readiness evidence only; it is not provider activation or
proof of a successful user sign-in. Positive tests use explicitly synthetic
fixtures and prove only local schema/writer behavior. The production CLI
rejects synthetic inputs before publishing any output.
