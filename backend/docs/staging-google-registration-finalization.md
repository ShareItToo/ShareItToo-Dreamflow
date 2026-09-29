# Close the one-time Google registration lane

`backend/ops/finalize_staging_google_registration.mjs` is a separate, default
read-only finalizer. It closes registration after the approved physical
enrollment; it does not submit a valid Google token or claim a physical login.
It reuses the enable runner's bounded startup, immutable-container replacement,
exact-configuration comparison and failure/response-loss recovery engine.

## Fresh private inputs

After the physical enrollment, capture a new owner-only `0600` manifest outside
the repository. The shape is the registration runtime manifest, with:

- `kind`: `sit-staging-google-registration-finalization-runtime-manifest`;
- `schemaVersion`: `1`;
- the freshly observed current `apiContainerId`, image revision/digest, env
  path/owner, exact three mounts and two networks;
- `finalizationBinding` with exactly `mappingDigest`, `allowedUserIdsDigest`
  and integer `allowedUserIdsCount`.

`mappingDigest` is SHA-256 of the exact private `digest=userId` line without its
optional trailing newline. `allowedUserIdsDigest` hashes the exact ordered
comma-separated `SIT_STAGING_ALLOWED_USER_IDS` value, without normalization;
the count must match. Do not put raw identity material or user IDs in the
manifest. Reuse only the verified private mapping file, owner-only `0600` and
outside the repository. The pre-enrollment activation manifest is not accepted.

Required pre-state: environment `test`, Firebase auth true, phone false,
payment memory, Stripe false, access gate true, registration true and exactly
the one expected mapping. The target ID must occur once in the exact bound
access list. Schema 98 and the existing exact migration-ledger digest are
required. Read-only SQL must prove one target user, one Google identity for
that user, and one active, verified, matching identity digest including provider
subject, Firebase UID and normalized linked email. The user's current email
must match the linked email. Missing, duplicate, different or inactive records
fail closed. SQL arguments contain hashes, not raw identities or user IDs.

## Default preflight

Supply `STAGING_GOOGLE_REGISTRATION_FINALIZE_RUNTIME_MANIFEST` and
`STAGING_GOOGLE_REGISTRATION_FINALIZE_MAPPING_FILE`, then invoke:

```sh
node backend/ops/finalize_staging_google_registration.mjs
```

Expected status is `preflight-passed-no-mutation`. No evidence success file is
created. Preflight imports the exact current image's real configuration with
registration false and empty mapping in that process only; the target must
remain access-allowed. It does not change files, containers or database data.

For a separately authorized execution only, additionally provide
`STAGING_GOOGLE_REGISTRATION_FINALIZE_EXECUTE=1`,
`STAGING_GOOGLE_REGISTRATION_FINALIZE_CONFIRM` equal to the bound runtime
revision, and `STAGING_GOOGLE_REGISTRATION_FINALIZE_EVIDENCE_FILE` as an unused
file in an owner-only `0700` directory. The enable runner's EXECUTE/CONFIRM
namespace does not authorize finalization.

## Exact transition and recovery

Execution changes exactly two env keys: registration becomes `false` and its
mapping becomes empty. The allowed-ID value and all unrelated bytes remain
unchanged. The same digest-pinned image and topology are recreated; the enabled
original is retained under a distinct finalization rollback name. Readbacks
verify configuration equality outside those two deltas, bounded live/ready
startup, version, schema/ledger, HTTP 401 `invalid_social_token`, the exact
existing identity, and final env bytes. No registration or account row changes
are performed. Evidence is exclusive `0600`, hash/count-only and explicitly
states that no valid token was submitted.

Any failure restores the exact enabled env and original container where
ownership is proven. Concurrent env changes, ambiguous containers or failed
restoration are reported as unrestored rather than overwritten or called
successful. Keep the private rollback seal/evidence until separately reviewed;
do not delete the previous registration-enable seal.

After successful closure, the schema-4 [Green auth profile](green-post-enrollment-auth.md)
can be freshly prepared from the verified closed state. A physical existing
Google login is still a separate live gate. Local PG16 integration proves the
real application route accepts a synthetic existing Google identity with the
registration lane disabled and rejects a new identity, without creating users
or identities; that is not real-provider evidence.
