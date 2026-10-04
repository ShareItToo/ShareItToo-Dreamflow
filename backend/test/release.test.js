import assert from 'node:assert/strict';
import test from 'node:test';

import { buildReleaseMetadata } from '../src/release.js';

test('release metadata exposes a deterministic immutable build identity', () => {
  const metadata = buildReleaseMetadata({
    APP_VERSION: '2026.08.08',
    APP_COMMIT: 'ABCDEF0123456789abcdef0123456789abcdef01',
    APP_BUILD_TIME: '2026-08-08T18:35:47+02:00',
    DEPLOYMENT_ENVIRONMENT: 'production',
  });

  assert.deepEqual(metadata, {
    version: '2026.08.08',
    commit: 'abcdef0123456789abcdef0123456789abcdef01',
    shortCommit: 'abcdef012345',
    buildTime: '2026-08-08T16:35:47.000Z',
    environment: 'production',
    releaseId: '2026.08.08-abcdef012345',
  });
  assert.equal(Object.isFrozen(metadata), true);
});

test('release metadata never reflects malformed deployment input', () => {
  const metadata = buildReleaseMetadata({
    APP_VERSION: 'bad version\nheader',
    APP_COMMIT: 'not-a-commit',
    APP_BUILD_TIME: 'not-a-date',
    DEPLOYMENT_ENVIRONMENT: 'customer-controlled',
  });

  assert.deepEqual(metadata, {
    version: 'development',
    commit: 'unknown',
    shortCommit: 'unknown',
    buildTime: null,
    environment: 'development',
    releaseId: 'development',
  });
});
