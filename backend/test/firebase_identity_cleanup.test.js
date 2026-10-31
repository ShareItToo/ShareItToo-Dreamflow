import assert from 'node:assert/strict';
import test from 'node:test';

import {
  drainFirebaseIdentityDeletionOutbox,
  enqueueFirebaseIdentityDeletions,
} from '../src/firebase_identity_cleanup.js';

test('account erasure queues only linked social Firebase identities transactionally', async () => {
  const calls = [];
  const client = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      return { rows: [{ id: '11111111-1111-4111-8111-111111111111' }] };
    },
  };
  const ids = await enqueueFirebaseIdentityDeletions(client, { userId: 'sit-user' });
  assert.deepEqual(ids, ['11111111-1111-4111-8111-111111111111']);
  assert.deepEqual(calls[0].params, ['sit-user']);
  assert.match(calls[0].sql, /FROM auth_identities/u);
  assert.match(calls[0].sql, /provider IN \('google', 'apple', 'facebook'\)/u);
  assert.match(calls[0].sql, /ON CONFLICT \(firebase_user_id\) DO UPDATE/u);
});

test('successful provider deletion removes the durable queue row', async () => {
  const calls = [];
  const deletedProviderIds = [];
  let claimed = false;
  const client = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes('RETURNING target.id')) {
        if (claimed) return { rows: [] };
        claimed = true;
        return {
          rows: [{
            id: '22222222-2222-4222-8222-222222222222',
            firebase_user_id: 'firebase-social-user',
            provider: 'google',
            attempts: 1,
          }],
        };
      }
      return { rows: [] };
    },
  };
  const result = await drainFirebaseIdentityDeletionOutbox({
    client,
    authClientFactory: async () => ({
      deleteUser: async (uid) => deletedProviderIds.push(uid),
    }),
    ids: ['22222222-2222-4222-8222-222222222222'],
  });
  assert.deepEqual(result, { deleted: 1, retried: 0 });
  assert.deepEqual(deletedProviderIds, ['firebase-social-user']);
  assert.ok(calls.some(({ sql }) =>
    sql === 'DELETE FROM firebase_identity_deletion_outbox WHERE id = $1'));
});

test('provider user-not-found is idempotent success', async () => {
  let claimed = false;
  let queueDeleted = false;
  const client = {
    query: async (sql) => {
      if (sql.includes('RETURNING target.id')) {
        if (claimed) return { rows: [] };
        claimed = true;
        return {
          rows: [{
            id: '33333333-3333-4333-8333-333333333333',
            firebase_user_id: 'already-removed',
            provider: 'apple',
            attempts: 1,
          }],
        };
      }
      if (sql === 'DELETE FROM firebase_identity_deletion_outbox WHERE id = $1') {
        queueDeleted = true;
      }
      return { rows: [] };
    },
  };
  const result = await drainFirebaseIdentityDeletionOutbox({
    client,
    authClientFactory: async () => ({
      deleteUser: async () => {
        const error = new Error('not found');
        error.code = 'auth/user-not-found';
        throw error;
      },
    }),
  });
  assert.deepEqual(result, { deleted: 1, retried: 0 });
  assert.equal(queueDeleted, true);
});

test('provider failure keeps a sanitized retry without exposing the Firebase UID', async () => {
  let claimed = false;
  let retryCall;
  const client = {
    query: async (sql, params) => {
      if (sql.includes('RETURNING target.id')) {
        if (claimed) return { rows: [] };
        claimed = true;
        return {
          rows: [{
            id: '44444444-4444-4444-8444-444444444444',
            firebase_user_id: 'private-provider-uid',
            provider: 'facebook',
            attempts: 2,
          }],
        };
      }
      if (sql.includes("SET status = 'retry'")) retryCall = { sql, params };
      return { rows: [] };
    },
  };
  const result = await drainFirebaseIdentityDeletionOutbox({
    client,
    authClientFactory: async () => ({
      deleteUser: async () => {
        const error = new Error('sensitive provider message');
        error.code = 'auth/internal-error';
        throw error;
      },
    }),
    limit: 1,
  });
  assert.deepEqual(result, { deleted: 0, retried: 1 });
  assert.deepEqual(retryCall.params, [
    '44444444-4444-4444-8444-444444444444',
    4,
    'auth/internal-error',
  ]);
  assert.doesNotMatch(JSON.stringify(retryCall), /private-provider-uid/u);
  assert.doesNotMatch(JSON.stringify(retryCall), /sensitive provider message/u);
});

test('an account without queued social identities does not trigger a global drain', async () => {
  let queried = false;
  let factoryCalled = false;
  const result = await drainFirebaseIdentityDeletionOutbox({
    client: { query: async () => { queried = true; return { rows: [] }; } },
    authClientFactory: async () => { factoryCalled = true; return {}; },
    ids: [],
  });
  assert.deepEqual(result, { deleted: 0, retried: 0 });
  assert.equal(queried, false);
  assert.equal(factoryCalled, false);
});
