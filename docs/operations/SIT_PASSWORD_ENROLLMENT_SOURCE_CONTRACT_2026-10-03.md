# Closed-cohort password enrollment — source contract

Scope: dormant backend/API enrollment for ShareItToo Staging. This package
does not activate a frontend control, configure recipients, send invitations,
alter SMTP/APP_PUBLIC_URL, provision accounts or deploy any source/schema.

`SIT_STAGING_PASSWORD_ENROLLMENT_ENABLED` defaults to `false`; the checked-in
template explicitly preserves false and an empty invitation configuration.
Enabling requires a valid Staging/test access gate, the private-adult pilot
profile and no live-money flag. Existing normal registration stays closed
under the access gate when this lane is disabled. Production cannot enable it.

An operator may use the pure `prepareStagingPasswordInvitation` helper to
prepare a random 256-bit bearer invitation in protected storage. The configured
entry binds its digest, token-salted normalized-email digest, a preallocated
principal already present in `SIT_STAGING_ALLOWED_USER_IDS`, and a maximum
24-hour issue/expiry interval. No invitation generation/delivery endpoint or
CLI is added. Neither invitation nor private config belongs in URLs, Git, logs
or account exports. Expired configuration denies enrollment without breaking
API restart. Future/malformed/overlong configuration fails startup.

The existing `/v1/auth/register` request may carry `enrollmentToken` only in this
enabled lane. Consent facts/action label and password rules remain intact.
No client-supplied principal, trusted email-verification flag or user profile
can replace the configured eligibility. An Authorization header cannot switch
an existing principal through this route. Existing IP/registration limits apply.
The ordinary client does not yet collect or submit this field; a later bounded
client package must preserve principal epochs and clear the invitation on exit.

The transaction first reserves the spent-token digest, rejects any preexisting
email or principal, then creates that exact user, consent/audit and initial
session. A transaction failure rolls back every part. Concurrent requests have
one winner; all consumed, missing, foreign, expired and duplicate/conflicting
eligibility attempts fail closed with the same generic lane error. The existing
middleware may reject an invalid bearer earlier as 401. No replay returns a
stored session or triggers another verification email. If a successful response
is lost, use normal login/recovery; never retry enrollment as an idempotent
credential-retrieval mechanism. Account creation plus static preauthorization
provide atomic effective admission without editing a shared runtime allowlist.

Migration 105 stores only token digest, creation time and expiry. It contains
no email, user ID, password, session, invitation bytes or legal declaration.
The credential worker purges expired rows at its existing six-hour interval;
redemption also enforces expiry with the database clock. A live spent-token
marker survives account erasure until expiry to prevent recreation with the
same invitation. Account export excludes this credential material, while
retention inventory exposes aggregate counts/timestamps only. Private operator
configuration remains separately controlled; remove expired invitations there
without copying their bindings into application history. Rollback refuses to
drop unexpired spent-token protection. Existing legal-declaration retention
and account tombstoning are unchanged.

Verification uses run-scoped synthetic principals and local PostgreSQL16:
concurrency/replay, duplicate email/principal, all consent negatives, default-off
HTTP behavior, limiter, session-failure rollback, verify/login/refresh/reset/
logout, nonempty export exclusion, account erasure, hard-delete storage
compatibility, expiry cleanup and migration rollback guard. This proves source
contracts only. No browser, mail delivery, provider, device or release PASS
follows; live Green promotion remains bound to its published schema 98.

## Local verification — 2026-10-03

- Final isolated PostgreSQL16 enrollment run: 9/9 passed, `passed-and-cleaned`,
  via `SIT_POSTGRES_FOCUSED_PASSWORD_ENROLLMENT=1 node tool/run_local_postgres_integration.mjs`.
- Domain/default-off HTTP/cleanup/runner cluster: 24/24; R9 source contracts:
  10/10; current support-scanner binding consumer: 8/8.
- Standard backend `pnpm test`: 2,338 passed, 25 explicitly skipped integration
  cases, zero failed. The dedicated PostgreSQL proof above is separate.
- Standard repository `node --test test/tool/*.test.mjs`: 3,818/3,818 passed.
- At the shared FB-W1 checkpoint, current consumer closure, privacy/retention
  validators, working-tree secret scan and whitespace checks passed. Backend
  syntax checks also passed. Readiness/approval fields remain unchanged.
- Shared-source coordination preserved the concurrently added notification PG
  group and refreshed the finalized Firebase-runtime digest supplied by its
  owner in both current manifests. No foreign source or capsule was rewritten.
- A subsequent, separately owned `lib/services/auth_service.dart` W2 edit made
  the shared privacy binding stale after that checkpoint. Its owner/Sol must
  refresh final W2 bindings and close the combined gate; earlier green results
  do not certify those later client bytes. This password package is unchanged.

Tested password source SHA-256: module
`ab5689a26b0bd2014c4bf079ac8f7f9fe40b58b705b3907a2e37eba3bbb6d3a8`,
`backend/src/app.js`
`ed66b274d8d26ab142bf51d2b04440eb7c6d78e43a08e90f8215b301d18d0647`,
`backend/src/config.js`
`9759813ec5af32956a2485beaf7aeeb39420eec33c19c382a0c2c937f0bc82d8`.

Next: Sol reviews this dormant API contract and its exact diff. A later client
invitation-entry package, protected provisioning/delivery decision, runtime
promotion and actual browser acceptance remain separate. No commit or push was
performed by this worker.
