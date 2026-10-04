# Green post-enrollment authentication preservation

This is an explicit successor contract, not permission to promote live. The
schema-3 Green target keeps its provider-off defaults and historical digest.
A source API with Firebase already enabled cannot use that default contract.

After the exact approved Google participant has enrolled and registration has
been closed, a freshly reviewed schema-4 `sit-green-staging-target` manifest
adds this `authProfile` object before computing `targetDigest`:

```json
{
  "kind": "google-post-enrollment",
  "schemaVersion": 1,
  "sourceImageDigest": "sha256:<exact prePromotionImageDigest>",
  "allowedUserIdsDigest": "<sha256 of exact comma-separated ordered IDs>",
  "allowedUserIdsCount": 4,
  "googleUserIdDigest": "<sha256 of the approved stable Google user ID>"
}
```

The count shown is illustrative; the approved readback determines it. Never
write raw user IDs, identity subjects, email addresses or registration mappings
into this manifest or public evidence. Whitespace, duplicate IDs, reordered
IDs, missing IDs and extra IDs are rejected, not normalized. Both profile and
target digest bind the source image. Existing hard-coded source image/topology
and retained-seal checks still apply; historical manifests do not become
current merely by adding this profile. Any later live execution needs its own
fresh exact source inventory and reviewed target update.

Protected env bytes, the running source, stopped candidate, candidate runtime,
final replacement and forward recovery must preserve Firebase auth `true`,
phone verification `false`, access gate `true`, registration `false`, empty
registration mapping and the exact allowed-ID digest/count. The hashed Google
ID must be a member of that list. Source, restored isolated DB and canonical DB
must each contain exactly one matching active Google-linked account; forward
recovery repeats that check before starting a successor. No account or identity
is created by the promotion runner.

Payment, Stripe, mail, push, identity-provider and external-AI restrictions
remain unchanged. The candidate/final launch inherits the validated env file;
it does not switch Google off or synthesize another access list. Candidate
probes emit only allowed-ID hashes/counts. Emergency rollback compares the
captured original container's complete configuration and network identity;
auth/list drift refuses restoration rather than starting an unverified
container. After canonical mutation, only the verified successor may recover.

Focused source gate:

```sh
cd backend
node --import ./test_setup.js --test test/green_auth_profile.test.js test/green_staging_promotion.test.js
```

These tests cover both default and enrolled orchestration, source/candidate/
final drift, missing Google enrollment, stale profile binding, rollback drift
and existing failure/recovery cases. They do not substitute for a physical
Google login or a separately authorized live promotion.
