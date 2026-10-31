import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  createPublicationManifest,
  extractBuildPushDigest,
  validateExpectedPublishCommit,
  validateRegistryReadback,
} from '../../tool/validate_ghcr_publication.mjs';

const workflow = readFileSync(new URL('../../.github/workflows/regression.yml', import.meta.url), 'utf8');
const commit = '0123456789abcdef0123456789abcdef01234567';
const digest = `sha256:${'a'.repeat(64)}`;
const image = 'ghcr.io/shareittoo/shareittoo-api';

test('manual publication requires an explicit full commit and exact checkout', () => {
  assert.deepEqual(validateExpectedPublishCommit({
    eventName: 'workflow_dispatch',
    publishApiImage: true,
    expectedPublishCommit: commit,
    githubSha: commit,
    checkoutHead: commit,
  }), { status: 'passed', commit });
  assert.throws(() => validateExpectedPublishCommit({
    eventName: 'workflow_dispatch',
    publishApiImage: true,
    expectedPublishCommit: '',
    githubSha: commit,
    checkoutHead: commit,
  }), /expected_publish_commit/u);
  assert.throws(() => validateExpectedPublishCommit({
    eventName: 'workflow_dispatch',
    publishApiImage: true,
    expectedPublishCommit: 'fedcba9876543210fedcba9876543210fedcba98',
    githubSha: commit,
    checkoutHead: commit,
  }), /does not match GITHUB_SHA/u);
});

test('push and pull request events never satisfy the publication gate', () => {
  assert.deepEqual(validateExpectedPublishCommit({
    eventName: 'push',
    publishApiImage: true,
    expectedPublishCommit: '',
    githubSha: '',
    checkoutHead: '',
  }), { status: 'not-required' });
  assert.deepEqual(validateExpectedPublishCommit({
    eventName: 'pull_request',
    publishApiImage: true,
    expectedPublishCommit: '',
    githubSha: '',
    checkoutHead: '',
  }), { status: 'not-required' });
});

test('build-push digest and registry readback are fail-closed', () => {
  assert.equal(extractBuildPushDigest({ 'containerimage.digest': digest }), digest);
  assert.throws(() => extractBuildPushDigest({}), /build-push digest/u);
  assert.throws(() => extractBuildPushDigest({ 'containerimage.digest': 'sha256:abc' }), /64 hexadecimal/u);

  const readback = {
    imageRef: `${image}@${digest}`,
    manifestPresent: true,
    rawManifest: { mediaType: 'application/vnd.oci.image.manifest.v1+json' },
  };
  assert.equal(validateRegistryReadback({ image, digest, expectedCommit: commit, ociRevision: commit, readback }).imageRef, `${image}@${digest}`);
  assert.throws(() => validateRegistryReadback({ image, digest, expectedCommit: commit, ociRevision: commit, readback: undefined }), /readback/u);
  assert.throws(() => validateRegistryReadback({ image, digest, expectedCommit: commit, ociRevision: commit, readback: { ...readback, rawManifest: {} } }), /readback/u);
  assert.throws(() => validateRegistryReadback({ image, digest, expectedCommit: commit, ociRevision: commit, readback: { ...readback, imageRef: `${image}:latest` } }), /exact image@digest/u);
  assert.throws(() => validateRegistryReadback({ image, digest, expectedCommit: commit, ociRevision: 'fedcba9876543210fedcba9876543210fedcba98', readback }), /OCI revision/u);
});

test('publication manifest is immutable, identity-only, and secret-free', () => {
  const publication = createPublicationManifest({
    commit,
    tag: `${image}:${commit}`,
    digest,
    workflow: 'regression',
    runId: '123',
    runAttempt: '1',
    repository: 'owner/repo',
    eventName: 'workflow_dispatch',
  });
  assert.deepEqual(Object.keys(publication), ['schemaVersion', 'commit', 'tag', 'digest', 'workflow', 'runId', 'runAttempt', 'repository', 'eventName']);
  assert.equal(Object.hasOwn(publication, 'token'), false);
  assert.throws(() => createPublicationManifest({ ...publication, tag: `${image}:latest` }), /immutable/u);
});

test('workflow wiring is exact-commit, digest-bound, and has no mutable latest publication', () => {
  assert.match(workflow, /expected_publish_commit:[\s\S]*required: true[\s\S]*type: string/u);
  assert.match(workflow, /github\.event_name == 'workflow_dispatch' && inputs\.publish_api_image/u);
  assert.doesNotMatch(workflow, /github\.event_name == 'push'\s*\|\|/u);
  assert.match(workflow, /fetch-depth: 0[\s\S]*ref: \$\{\{ github\.sha \}\}/u);
  assert.match(workflow, /EXPECTED_PUBLISH_COMMIT.*inputs\.expected_publish_commit/u);
  assert.match(workflow, /git rev-parse HEAD.*GITHUB_SHA/u);
  assert.match(workflow, /docker buildx build[\s\S]*--push[\s\S]*--metadata-file/u);
  assert.match(workflow, /extractBuildPushDigest/u);
  assert.match(workflow, /docker buildx imagetools inspect --raw "\$IMAGE_DIGEST_REF"/u);
  assert.match(workflow, /docker pull "\$IMAGE_DIGEST_REF"/u);
  assert.match(workflow, /docker image inspect "\$IMAGE_DIGEST_REF"[\s\S]*org\.opencontainers\.image\.revision/u);
  assert.match(workflow, /actions\/upload-artifact@v4/u);
  assert.doesNotMatch(workflow, /:latest/u);
  assert.doesNotMatch(workflow, /GHCR_TOKEN.*publication-manifest/u);
});
