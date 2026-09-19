# WP260-F — Identity sandbox validator and mode boundary

## Result

The Identity staging path now has a sanitized account/session readback
validator and an external webhook mode boundary. The validator is
`backend/ops/validate_identity_staging_account_readback.mjs`; it reads only
0600/no-follow private files, initializes Stripe SDK 22.6.1 with the actual
`rk_test_` restricted key, performs read-only `accounts.retrieve()` and
`identity.verificationSessions.retrieve(id)` calls, binds the returned account
ID/context hash and session-ID hash to the evidence, and requires the
authoritative VerificationSession readback to contain `livemode: false`. It
deliberately rejects an invented `account.livemode` field rather than treating
that field as provider truth. The evidence file never replaces provider
readback and contains no secret or raw provider session ID.

The Identity webhook route now requires both the signed event envelope and
the fetched/object payload to be test-mode (`livemode === false`) before any
transaction or state mutation. Existing raw-body signature, replay, ordering,
redaction and retention semantics remain unchanged. The Flutter CTA is
reachable from the verification profile route; its status is loaded from the
authenticated backend, its entrypoint is restricted to `https://verify.stripe.com`
and it does not expose a client secret or query-parameter status hint.

## Verification

- Account-readback validator (including SDK-shaped account/session fixtures),
  secret gate and identity workflow: **10/10**.
- Flutter Identity client/CTA contract: **9/9 passed**.
- PostgreSQL 16 Identity integration, including raw-body HTTP webhook,
  invalid signature, live-mode rejection, replay/order, response-loss
  reconciliation, revoke/redaction and retention: **10/10 passed**.
- `node --check` and `git diff --check`: passed.

## Scope and hold

This is technical sandbox readiness only. No Stripe Identity account was
created/read, no provider request or CLI authorization occurred, no real
document/selfie was used, and no public KYC/legal/payment decision is claimed.
Provider activation and owner/legal evidence remain separate gates.
