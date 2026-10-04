# Password invitation registry importer — FIX, no unsafe bridge

Project: ShareItToo/SIT. Audited source HEAD: `8f5c5757`. Scope: local source
design/readback only. No importer, runtime-file load, flag change, deployment,
real invitation or delivery was performed.

## Decisive blocking condition

The current runtime cannot directly consume a protected invitation file:

| Source | Exact current behavior | Required successor |
|---|---|---|
| `backend/src/staging_password_enrollment.js:42–60` | Parses `SIT_STAGING_PASSWORD_ENROLLMENT_INVITATIONS` JSON from the supplied environment object; no file reader. `_FILE` is ignored. | Descriptor-based protected-file reader; never bridge bytes into `process.env`, shell substitution, command arguments or configuration output. |
| `backend/src/config.js:45–46` | Passes `process.env` directly to the enrollment parser at startup. | Explicit file-backed, in-memory parse boundary; status/count/hash-only readback. |
| All `backend/compose*.yml`, particularly staging lines 144–146 | No enrollment registry path or mount. Other provider file mounts do not cover this lane. | Optional read-only exact file mount with `create_host_path: false`; no automatic enrollment activation. |
| `backend/Dockerfile:28–34` | Runtime is non-root `shareittoo`; numeric UID is not fixed in this file. | Verify runtime UID/GID and provision the registry with correct ownership, still 0600. Do not solve access with 0644 or root runtime. |

Therefore the user-specified **FIX branch applies**. An importer whose output
must be copied into environment JSON is not a safe completion. No such bridge
or speculative unconsumed registry writer was added. The existing independent
backend/Web flags remain default-OFF and the Staging access gate remains intact.

## Safe successor design (not implemented or authorized for activation)

1. Build and verify the file-consumer/mount/UID boundary first. Path-only
   configuration is acceptable; invitation records must not enter process
   environment, CLI values, rendered Compose configuration or diagnostics.
   Preserve current off semantics; no automatic enablement from file presence.
   Reject ambiguous simultaneous environment-record and file-record sources.
2. Import only explicitly selected `server-record.json` files: owned regular
   0600, single link, no symlink components, stable descriptor metadata and
   bounded bytes; exact schema `sit-staging-password-invitation`, integer
   version 1 and five data fields. Never discover/open `handoff.json`, original
   request files, token or plaintext email. Validate a protected exact allowlist.
3. Validate 64-character lowercase hex digests; allowlisted principal; canonical
   UTC ISO timestamps; issuedAt <= clock; 0 < TTL <=24h; new entries unexpired.
   Reject extra fields, duplicate JSON keys, duplicate tokenDigest,
   emailDigest or userId across incoming/existing records. The backend already
   rejects duplicate token/principal, **not duplicate emailDigest**: importer
   would be intentionally stricter without changing redemption semantics.
4. Runtime bytes must be the backend's exact five-field record array, without
   schema/version envelope: `tokenDigest`, `emailDigest`, `userId`, `issuedAt`,
   `expiresAt`; 1–20 records. Preserve every existing valid unexpired record
   byte-for-value. No replacement/upsert of conflicting records, eviction to
   fit the limit, or silently ignored collisions. Expired existing entries may
   be removed only by an explicit pruning operation; report aggregate counts.
5. Serialize generation from one protected base registry and bind expected
   base hash. A private lock plus revalidation prevents concurrent lost updates;
   produce a new immutable 0600 snapshot with exclusive atomic publication,
   never overwrite the existing/runtime-mounted inode. Separate authorized
   runtime selection/restart must later consume the exact approved snapshot.
   Mounting one file pins an inode: a host rename is not proof of runtime reload.
6. Dry run reads/validates and returns only status, counts and proposed content
   hash; it creates no registry or activation. Readback must independently
   validate the output descriptor, permissions, canonical bytes and hash, then
   exercise the exact backend parser in memory, not via OS environment. Logs
   contain no identities, records, per-record digests or handoff material.

Two important contract limits must remain explicit:

- Email digest is token-salted. Equal-email/different-token invitations normally
  have different emailDigest values; rejecting duplicate digests is **not** a
  plaintext-email uniqueness guarantee. Without token/email the importer can
  check representation, not recompute or authenticate the binding. Trust comes
  from the protected generator output and backend token/email redemption check.
- The enabled backend parser rejects an empty array. Pruning the final record
  must not silently change that behavior or toggle flags: fail with a sanitized
  “no enabled-compatible registry” result until a separately authorized lane
  shutdown/configuration choice is made. Expired entries are presently allowed
  at startup but rejected at redemption; do not conflate those checks.

## Executed evidence and pending tests

A synthetic in-memory probe exercised the **actual** backend parser/resolver:
13 assertions passed, confirming default-OFF, ignored `_FILE`, enabled file-only
denial, exact five-field acceptance, envelope rejection, unknown principal,
token/principal collision, empty-array rejection, >24h rejection, expired
startup acceptance, exact-expiry redemption denial, current duplicate-email-
digest acceptance and absence of enrollment wiring in every Compose source.
Only aggregate result booleans/count were printed. No protected file or live
runtime was read. The probe created no invitations/accounts or environment state.

Importer permission/race/collision/pruning/leakage tests were **not run**, since
no importer was implemented; the prior generator's tests do not close this gap.
The successor must add red-first filesystem, concurrent-writer, retained-record,
explicit-prune/empty-result, canonical-hash and backend-parser compatibility
tests, plus Docker inspection proving contents absent from environment/config
and correct non-root file ownership. Linux/container proof remains separate.

Next gate: authorize the narrowly scoped default-OFF protected registry reader
and optional mount contract, then implement importer/readback against that
verified consumer. Private delivery is separately bounded by
`SIT_PASSWORD_INVITATION_PRIVATE_HANDOFF_2026-10-03.md`.
