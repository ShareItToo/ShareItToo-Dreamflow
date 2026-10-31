# SIT Google Web current-readback profile

Status: source contract and deterministic fixture tests only. This file does not
claim that today's Firebase, Cloud Console, staging runtime, or Google login was
read, changed, built, or deployed.

The existing `staging-google-web-v2` profile remains accepted. The additive
`staging-google-web-current-readback-v3` profile is the path for fresh, exact
readbacks when that older prerequisite journal is stale. It never substitutes
synthetic values for missing provider evidence.

## Required protected envelope

Pass one canonical UTF-8 JSON envelope to `--google-web-current-readback` with
the SHA-256 of its exact bytes. The file must be a single-link, owner-owned
regular file with mode `0600`, inside an owner-owned `0700` parent directory.
The builder binds the exact source commit and `pubspec.yaml` version and rejects
readbacks more than two hours old, future timestamps, non-canonical bytes,
digest mismatch, or extra/missing fields.

The envelope contains only the public Firebase Web config and these three
separately digested records:

- Service-account Firebase/Identity Toolkit readback: ACTIVE project, present
  selected Web app and exact public config, `staging.shareittoo.com` authorized,
  Google enabled, Apple/Facebook disabled, Firebase Auth enabled, emulator
  absent, and the read-back staging API service identity, commit, and immutable
  image digest.
- Direct Cloud Console readback: exact API-key resource ID bound to SHA-256 of
  that public Web API key, exact API and website restriction sets, and the
  approved operator account hash
  `ab40c92847d70810d0da6d819491307bbaf5989e3d835ee0eb1b3d4443bad776`.
- Separate canonical Sol release decision, approved within the same two-hour
  window and binding both readback digests, config digest, source/version,
  project, Web app, and API-key resource ID.

The allowed website referrers are exactly:

- `https://staging.shareittoo.com/*`
- `https://shareittoo-staging.firebaseapp.com/*`
- `https://shareittoo-staging.web.app/*`

The Console API restriction set is exactly the 25 entries in
`GOOGLE_WEB_AUTH_APIS` in `tool/staging_google_web_current_readback.mjs`.
Service-account evidence does not assert API-key inventory: that endpoint was
403. Key resource identity and restrictions are independently read from Cloud
Console and bound to the public key hash.

The v3 profile enables Google only. It cannot be combined with Apple/Facebook
activation. V2 validation and historical artifacts are unchanged.

## Builder invocation

Use a clean source checkout and a new output directory; the evidence file must
be outside the source tree. This command only creates and validates a local
artifact; deployment and live login are separate gates.

```sh
node tool/build_staging_web.mjs ABS_CLEAN_SOURCE_ROOT EXACT_HEAD ABS_NEW_ARTIFACT_DIR \
  --google-web-current-readback ABS_PROTECTED_CURRENT_READBACK_JSON VERIFIED_ENVELOPE_SHA256
```
