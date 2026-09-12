import assert from 'node:assert/strict';
import test from 'node:test';

import {
  drainCrashlyticsReportDeletionOutbox,
  enqueueCrashlyticsReportDeletions,
  getOrCreateCrashlyticsSubject,
} from '../src/crashlytics_cleanup.js';

test('creates a pseudonymous subject without exposing the SIT user id to Firebase', async () => {
  const calls = [];
  const client = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      return { rows: [{ subject_id: '11111111-1111-4111-8111-111111111111' }] };
    },
  };
  const subject = await getOrCreateCrashlyticsSubject(client, {
    userId: 'sit-user',
    platform: 'android',
    firebaseAppId: '1:123456789:android:abcdef123456',
  });
  assert.equal(subject, '11111111-1111-4111-8111-111111111111');
  assert.deepEqual(calls[0].params, [
    'sit-user',
    'android',
    '1:123456789:android:abcdef123456',
  ]);
  assert.match(calls[0].sql, /RETURNING subject_id/u);
});

test('moves a subject to the provider queue before deleting the account link', async () => {
  const calls = [];
  const client = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      return { rows: [{ id: '22222222-2222-4222-8222-222222222222' }] };
    },
  };
  const ids = await enqueueCrashlyticsReportDeletions(client, {
    userId: 'sit-user',
    platform: 'ios',
  });
  assert.deepEqual(ids, ['22222222-2222-4222-8222-222222222222']);
  assert.deepEqual(calls[0].params, ['sit-user', 'ios']);
  assert.match(calls[0].sql, /DELETE FROM crashlytics_subjects/u);
  assert.match(calls[0].sql, /INSERT INTO crashlytics_report_deletion_outbox/u);
  assert.doesNotMatch(calls[0].sql, /user_id[^\n]*crashlytics_report_deletion_outbox/u);
});

test('provider acceptance removes the durable queue row', async () => {
  let claimed = false;
  let removed = false;
  const targets = [];
  const client = {
    query: async (sql) => {
      if (sql.includes('RETURNING target.id')) {
        if (claimed) return { rows: [] };
        claimed = true;
        return { rows: [{
          id: '33333333-3333-4333-8333-333333333333',
          firebase_app_id: '1:123456789:android:abcdef123456',
          subject_id: '44444444-4444-4444-8444-444444444444',
          attempts: 1,
        }] };
      }
      if (sql === 'DELETE FROM crashlytics_report_deletion_outbox WHERE id = $1') {
        removed = true;
      }
      return { rows: [] };
    },
  };
  const result = await drainCrashlyticsReportDeletionOutbox({
    client,
    deleteReports: async (target) => {
      targets.push(target);
      return { targetCompleteTime: '2026-08-17T16:00:00Z' };
    },
    ids: ['33333333-3333-4333-8333-333333333333'],
  });
  assert.deepEqual(result, { accepted: 1, retried: 0 });
  assert.equal(removed, true);
  assert.deepEqual(targets, [{
    firebaseAppId: '1:123456789:android:abcdef123456',
    subjectId: '44444444-4444-4444-8444-444444444444',
  }]);
});

test('provider failure preserves a sanitized retry without identifiers in the error field', async () => {
  let claimed = false;
  let retryParams;
  const client = {
    query: async (sql, params) => {
      if (sql.includes('RETURNING target.id')) {
        if (claimed) return { rows: [] };
        claimed = true;
        return { rows: [{
          id: '55555555-5555-4555-8555-555555555555',
          firebase_app_id: '1:123456789:ios:abcdef123456',
          subject_id: '66666666-6666-4666-8666-666666666666',
          attempts: 2,
        }] };
      }
      if (sql.includes("SET status = 'retry'")) retryParams = params;
      return { rows: [] };
    },
  };
  const error = new Error('raw provider body contains private detail');
  error.code = 'provider_http_503';
  const result = await drainCrashlyticsReportDeletionOutbox({
    client,
    deleteReports: async () => { throw error; },
    ids: ['55555555-5555-4555-8555-555555555555'],
  });
  assert.deepEqual(result, { accepted: 0, retried: 1 });
  assert.deepEqual(retryParams, [
    '55555555-5555-4555-8555-555555555555',
    4,
    'provider_http_503',
  ]);
  assert.equal(retryParams.join(' ').includes('private detail'), false);
  assert.equal(retryParams.join(' ').includes('66666666'), false);
});

test('an empty scoped request never drains another account queue', async () => {
  let queried = false;
  const result = await drainCrashlyticsReportDeletionOutbox({
    client: { query: async () => { queried = true; return { rows: [] }; } },
    deleteReports: async () => ({}),
    ids: [],
  });
  assert.deepEqual(result, { accepted: 0, retried: 0 });
  assert.equal(queried, false);
});
