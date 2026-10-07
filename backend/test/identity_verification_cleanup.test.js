import assert from 'node:assert/strict';
import test from 'node:test';

import { drainIdentityVerificationRedactions } from '../src/identity_verification_cleanup.js';

test('pending redaction recovers a deleted local claim with the deterministic provider key', async () => {
  const outboxId = '11111111-1111-4111-8111-111111111111';
  const localId = '22222222-2222-4222-8222-222222222222';
  const pending = `pending_${localId}`;
  const updates = [];
  let claimed = false;
  const client = {
    async query(sql, params = []) {
      if (/UPDATE identity_verification_redaction_outbox AS target/u.test(sql)) {
        if (claimed) return { rows: [], rowCount: 0 };
        claimed = true;
        return { rows: [{ id: outboxId, provider_session_id: pending, attempts: 1 }], rowCount: 1 };
      }
      if (/SELECT id, user_id, provider_session_id/u.test(sql)) return { rows: [], rowCount: 0 };
      if (/UPDATE identity_verification_redaction_outbox SET provider_session_id/u.test(sql)) {
        updates.push(['bind', params]);
        return { rows: [], rowCount: 1 };
      }
      if (/UPDATE identity_verification_redaction_outbox\s+SET status = 'redacted'/u.test(sql)) {
        updates.push(['redacted', params]);
        return { rows: [], rowCount: 1 };
      }
      if (/INSERT INTO identity_verification_provider_tombstones/u.test(sql)) return { rows: [], rowCount: 1 };
      if (/UPDATE identity_verification_sessions\s+SET status = 'redacted'/u.test(sql)) {
        updates.push(['session-redacted', params]);
        return { rows: [], rowCount: 0 };
      }
      if (/UPDATE identity_verification_webhook_events/u.test(sql)) {
        updates.push(['events-redacted', params]);
        return { rows: [], rowCount: 1 };
      }
      if (/UPDATE identity_verification_redaction_outbox\s+SET status = 'retry'/u.test(sql)) {
        updates.push(['retry', params]);
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`unexpected SQL: ${sql}`);
    },
  };
  const calls = [];
  const provider = {
    async createIdentityVerificationSession(args) {
      calls.push(args);
      return { id: 'vs_test_sit_recovered', livemode: false, status: 'requires_input' };
    },
    async retrieveIdentityVerificationSession() {
      return { id: 'vs_test_sit_recovered', livemode: false, status: 'requires_input' };
    },
    async redactIdentityVerificationSession() {
      return { id: 'vs_test_sit_recovered', livemode: false, status: 'requires_input', redaction: { status: 'redacted' } };
    },
  };
  const result = await drainIdentityVerificationRedactions({ client, provider, ids: [outboxId] });
  assert.deepEqual(result, { redacted: 1, retried: 0 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].providerIdempotencyKey, `sit_identity_${localId.replaceAll('-', '')}`);
  assert.equal('ownerReference' in calls[0], false);
  assert.equal(updates.some(([kind]) => kind === 'redacted'), true);
});
