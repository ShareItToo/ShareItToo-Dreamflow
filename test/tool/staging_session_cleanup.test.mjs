import assert from 'node:assert/strict';
import test from 'node:test';

import {
  registerStagingSessionForCleanup,
  withStagingSessionCleanup,
} from '../../tool/staging_session_cleanup.mjs';

test('revokes every registered session in reverse order after success', async () => {
  const revoked = [];
  const result = await withStagingSessionCleanup(async (refreshToken) => {
    revoked.push(refreshToken);
  }, async () => {
    registerStagingSessionForCleanup('refresh-token-owner-0123456789');
    registerStagingSessionForCleanup('refresh-token-renter-0123456789');
    return 'completed';
  });

  assert.equal(result, 'completed');
  assert.deepEqual(revoked, [
    'refresh-token-renter-0123456789',
    'refresh-token-owner-0123456789',
  ]);
});

test('revokes a registered session after the operation throws', async () => {
  const revoked = [];
  await assert.rejects(
    () => withStagingSessionCleanup(async (refreshToken) => {
      revoked.push(refreshToken);
    }, async () => {
      registerStagingSessionForCleanup('refresh-token-owner-0123456789');
      throw new Error('synthetic operation failure');
    }),
    /synthetic operation failure/u,
  );
  assert.deepEqual(revoked, ['refresh-token-owner-0123456789']);
});

test('fails closed if any registered session cannot be revoked', async () => {
  await assert.rejects(
    () => withStagingSessionCleanup(async () => {
      throw new Error('private revocation detail');
    }, async () => {
      registerStagingSessionForCleanup('refresh-token-owner-0123456789');
      return 'completed';
    }),
    /session could not be revoked/u,
  );
});
