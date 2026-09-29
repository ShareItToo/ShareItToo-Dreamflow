# Closed Staging Google registration

The application lane remains default-off. The schema-98 Ops successor in
`backend/ops/enable_staging_google_registration.mjs` enables exactly one
reviewed identity on the existing Green API. It does not import old account
rows, reassign an occupied identity, submit a real Google token, or claim a
successful physical login.

## Exact pre-state and inputs

- The service is the verified Green `shareittoo-staging-api`, with an immutable
  container ID, image revision/digest, two networks and exactly three mounts:
  Firebase credentials, MFA key and uploads. Runtime deployment environment is
  `test`; the externally selected project/environment is still Staging.
- Firebase authentication is already true; phone verification and Stripe live
  mode are false; payment transport is memory; the access gate is true.
- Registration is disabled with an empty/absent identity allowlist. Schema is
  exactly `098_booking_checkout_declaration_constraints.up.sql`; the ledger
  digest is `796f0e19572f4883435d5825baae9004b1f5ec2e706a4114d7731cf2a21cf196`.
- A newly captured `sit-staging-google-registration-runtime-manifest`, schema
  version 1, binds `apiContainerId`, all topology and current safety flags.
  The old Firebase-activation manifest is not accepted. Read-only reconstruction
  may retain only selected manifest fields, never raw Docker inspect/env data.
- The private mapping contains one line, `<digest>=<user-id>`, optionally with
  one final newline. Digest bytes are SHA-256 of
  `google\n<provider-subject>\n<firebase-uid>\n<lowercase-email>`.
  The ID must be absent from both the current users table and the configured
  access list. Use the verified historical stable ID when restoring the same
  approved pilot participant; preserve the old database and its audit evidence.
- Both input files must be owner-only `0600`, owned by the executing operator,
  outside the repository, opened without following symlinks. The env file is
  independently bound to its manifest owner. Evidence needs a new path inside
  an operator-owned `0700` directory outside the repository.

## Invocation and verification

Run from the exact reviewed Ops source/runtime with Docker and Node available.
Supply `STAGING_GOOGLE_REGISTRATION_RUNTIME_MANIFEST` and
`STAGING_GOOGLE_REGISTRATION_MAPPING_FILE`, then run:

```sh
node backend/ops/enable_staging_google_registration.mjs
```

This defaults to read-only preflight. It reaches the mutation boundary without
altering configuration, account data or containers. Do not infer a mapping or
reuse a manifest after the captured API identity changes.

Only for the separately reviewed execution, also set
`STAGING_GOOGLE_REGISTRATION_EXECUTE=1`,
`STAGING_GOOGLE_REGISTRATION_CONFIRM` to the manifest's exact runtime revision,
and `STAGING_GOOGLE_REGISTRATION_EVIDENCE_FILE` to the new private evidence path.

The execution atomically changes exactly three env keys: appends the single
mapped ID to `SIT_STAGING_ALLOWED_USER_IDS`, sets registration enabled, and
writes the one identity mapping. All prior allowed IDs, unrelated env bytes,
image identity and topology remain bound. It retains the stopped original API
as a rollback seal. Readbacks require exact configuration, live/ready health,
version, schema/ledger and a synthetic invalid-token response of precisely
HTTP 401 / `invalid_social_token`. The invalid-token check uses the normal
limiter; let its natural window expire before a later physical login gate.

Failure restores the original env bytes and captured container where ownership
is proven; ambiguous/concurrently changed state fails closed and reports
unrestored status rather than overwriting it. Container mutations use immutable
IDs. No raw env/container snapshot is written as evidence. The result is only
`enabled-awaiting-live-google-token-gate`.

The subsequent app journey must obtain a fresh verified Google token and the
current registration consents through the UI. Occupied IDs, wrong digests,
expired tokens and replays remain rejected by the unchanged application lane.
Registration is not a migration of historical profile or consent rows.

## Separate recurrence package

The Green promotion runner now has an explicit, digest-bound post-enrollment
profile, documented in [green-post-enrollment-auth.md](green-post-enrollment-auth.md).
The default provider-off contract is unchanged. This profile cannot be used
during open registration: actual enrollment, registration closure and a fresh
approved source manifest are prerequisites. Source support is not proof of a
live promotion, login or registration closure.
