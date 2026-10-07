const FULL_COMMIT_SHA = /^[0-9a-f]{40}$/u;
const OCI_DIGEST = /^sha256:[0-9a-f]{64}$/u;
const IMAGE_NAME = /^ghcr\.io\/[a-z0-9._-]+\/[a-z0-9._-]+$/u;

function fail(message) {
  throw new Error(`GHCR publication: ${message}`);
}

function requireFullCommit(value, field) {
  if (!FULL_COMMIT_SHA.test(value ?? '')) {
    fail(`${field} must be a full lowercase 40-character commit SHA`);
  }
}

function requireDigest(value, field) {
  if (!OCI_DIGEST.test(value ?? '')) {
    fail(`${field} must be a sha256 digest with exactly 64 hexadecimal characters`);
  }
}

export function validateExpectedPublishCommit({
  eventName,
  publishApiImage,
  expectedPublishCommit,
  githubSha,
  checkoutHead,
}) {
  if (eventName !== 'workflow_dispatch' || publishApiImage !== true) {
    return { status: 'not-required' };
  }

  requireFullCommit(expectedPublishCommit, 'expected_publish_commit');
  requireFullCommit(githubSha, 'GITHUB_SHA');
  requireFullCommit(checkoutHead, 'checkout HEAD');
  if (expectedPublishCommit !== githubSha) {
    fail('expected_publish_commit does not match GITHUB_SHA');
  }
  if (checkoutHead !== githubSha) {
    fail('checkout HEAD does not match GITHUB_SHA');
  }
  return { status: 'passed', commit: githubSha };
}

export function extractBuildPushDigest(metadata) {
  const digest = metadata?.['containerimage.digest'];
  requireDigest(digest, 'build-push digest');
  return digest;
}

export function validateRegistryReadback({
  image,
  digest,
  expectedCommit,
  ociRevision,
  readback,
}) {
  if (!IMAGE_NAME.test(image ?? '')) {
    fail('registry image must be a GHCR image name without a tag or digest');
  }
  requireDigest(digest, 'registry digest');
  requireFullCommit(expectedCommit, 'expected publication commit');
  const expectedImageRef = `${image}@${digest}`;
  if (readback?.imageRef !== expectedImageRef) {
    fail('registry readback did not use the exact image@digest reference');
  }
  if (
    readback?.manifestPresent !== true
    || !readback.rawManifest
    || typeof readback.rawManifest !== 'object'
    || Array.isArray(readback.rawManifest)
    || typeof readback.rawManifest.mediaType !== 'string'
    || readback.rawManifest.mediaType.length === 0
  ) {
    fail('registry manifest readback is missing or invalid');
  }
  if (ociRevision !== expectedCommit) {
    fail('registry OCI revision does not match the exact publication commit');
  }
  return {
    image,
    imageRef: expectedImageRef,
    digest,
    manifestPresent: true,
    ociRevision,
  };
}

export function createPublicationManifest({
  commit,
  tag,
  digest,
  workflow,
  runId,
  runAttempt,
  repository,
  eventName,
}) {
  requireFullCommit(commit, 'publication commit');
  requireDigest(digest, 'publication digest');
  if (typeof tag !== 'string' || tag.length === 0 || tag.endsWith(':latest') || !tag.endsWith(`:${commit}`)) {
    fail('publication tag must be immutable and bound to the exact commit');
  }
  for (const [field, value] of Object.entries({ workflow, runId, runAttempt, repository, eventName })) {
    if (typeof value !== 'string' || value.length === 0 || value.length > 256) {
      fail(`publication ${field} identity is missing or invalid`);
    }
  }
  return {
    schemaVersion: 1,
    commit,
    tag,
    digest,
    workflow,
    runId,
    runAttempt,
    repository,
    eventName,
  };
}
