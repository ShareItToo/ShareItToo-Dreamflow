# Staging Web Listing-AI readiness input

The Staging Web build keeps `SIT_BLUE_OCEAN_LISTING_ASSISTANT=false` by default.
It accepts no free-form Dart defines. To expose the Web assistant in external
mode, the builder accepts one protected, digest-bound input:

```sh
node tool/build_staging_web.mjs ABS_SOURCE_ROOT EXACT_WEB_HEAD ABS_NEW_ARTIFACT_DIR \
  --listing-ai-web-readiness ABS_OWNER_ONLY_READINESS_JSON SHA256
```

The JSON file must be a single-link regular file, mode `0600`, in an owner-only
`0700` directory outside the source checkout. It binds the exact Web commit and
client version to the promoted Staging runtime commit/image digest and Green
106→106 promotion receipt digest, the reviewed OpenAI model, bounded budget and
external-execution boundary, and a sanitized authenticated capability readback. The capability must
be available with provider `openai`, mode `external`, the exact client version,
at most four images, and disclosure/configuration hashes. Automatic publication
must remain false. The record also binds the provider-secret metadata validator
receipt (regular non-symlink file outside Git, validated mode and read-only
runtime mount) and a proof digest for rollback to mock.

The record also carries an independent Gemini decision bound to those same Web,
runtime, image, receipt, capability and configuration digests. Readiness and
decision validity windows are limited to one hour. The builder does not contact
the provider or VPS. It enables only `SIT_BLUE_OCEAN_LISTING_ASSISTANT`; Stage-A
non-binding mode remains false, the pilot ID remains empty, and other profile
flags retain their existing values.

The sealed artifact uses manifest schema 8 and records its underlying provider
profile schema plus readiness, configuration, capability, decision and
validation-time digests. Candidate validation checks freshness again before
deployment. Artifact, archive, deployment and served release-identity readbacks
revalidate the evidence binding and profile digest.
