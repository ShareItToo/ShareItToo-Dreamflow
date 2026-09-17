import assert from 'node:assert/strict';
import test from 'node:test';

import { StripeProvider } from '../src/stripe_provider.js';
import {
  applyIdentityVerificationWebhook,
  IDENTITY_CONSENT_VERSION,
  reconcilePendingIdentityVerificationSessions,
  startIdentityVerification,
} from '../src/identity_verification_workflow.js';

const actor = { id: 'user-identity-1', role: 'user', accountStatus: 'active', deactivatedAt: null };

function fakeClient() {
  const rows = [];
  const events = new Set();
  return {
    rows,
    async query(sql, params = []) {
      if (/FROM identity_verification_sessions AS session\s+LEFT JOIN identity_verification_redaction_outbox/u.test(sql)) {
        return { rows: [], rowCount: 0 };
      }
      if (/^\s*SELECT pilot_closed/u.test(sql)) {
        return { rows: [{ pilot_closed: false }], rowCount: 1 };
      }
      if (/CROSS JOIN identity_verification_control/u.test(sql)) {
        const row = rows.find((entry) => entry.id === params[0]);
        return {
          rows: row ? [{
            id: row.id,
            provider_session_id: row.providerSessionId,
            status: row.status,
            livemode: false,
            updated_at: row.updated_at,
            consent_revoked_at: null,
            pilot_closed: false,
            redaction_status: null,
          }] : [],
          rowCount: row ? 1 : 0,
        };
      }
      if (/WHERE idempotency_key/u.test(sql)) {
        const row = rows.find((entry) => entry.idempotencyKey === params[0]);
        return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
      }
      if (/WHERE user_id = \$1 AND status IN/u.test(sql)) {
        const row = rows.find((entry) => entry.userId === params[0] && ['requires_input', 'processing'].includes(entry.status));
        return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
      }
      if (/INSERT INTO identity_verification_sessions/u.test(sql)) {
        const row = {
          id: params[0], userId: params[1], user_id: params[1], providerSessionId: params[2],
          provider_session_id: params[2], status: 'requires_input', livemode: false,
          idempotencyKey: params[3], idempotency_key: params[3], request_hash: params[4],
          updated_at: new Date(),
        };
        rows.push(row);
        return { rows: [row], rowCount: 1 };
      }
      if (/UPDATE identity_verification_sessions/u.test(sql)) {
        const row = rows.find((entry) => entry.id === params[0] || entry.providerSessionId === params[0]);
        if (row) {
          if (/provider_session_id = NULL/u.test(sql)) {
            row.providerSessionId = null;
            row.provider_session_id = null;
            row.status = 'redacted';
            return { rows: [row], rowCount: 1 };
          }
          if (params.length >= 3 && typeof params[1] === 'string' && params[1].startsWith('vs_')) {
            row.providerSessionId = params[1];
            row.provider_session_id = params[1];
            row.status = params[2];
          } else {
            row.status = params[1];
          }
          row.updated_at = new Date();
        }
        return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
      }
      if (/SELECT id, user_id, provider_session_id, status, last_provider_event_created_at/u.test(sql)) {
        const row = rows.find((entry) => entry.providerSessionId === params[0]);
        return { rows: row ? [{ ...row, last_provider_event_created_at: row.lastEventAt ?? null }] : [], rowCount: row ? 1 : 0 };
      }
      if (/INSERT INTO identity_verification_webhook_events/u.test(sql)) {
        if (events.has(params[0])) return { rows: [], rowCount: 0 };
        events.add(params[0]);
        const row = rows.find((entry) => entry.providerSessionId === params[1]);
        if (row) row.lastEventAt = new Date(params[3] * 1000);
        return { rows: [], rowCount: 1 };
      }
      if (/UPDATE identity_verification_redaction_outbox/u.test(sql)) {
        return { rows: [], rowCount: 1 };
      }
      if (/UPDATE identity_verification_webhook_events/u.test(sql)) {
        return { rows: [], rowCount: 1 };
      }
      if (/INSERT INTO identity_verification_redaction_outbox/u.test(sql)) {
        return { rows: [], rowCount: 1 };
      }
      if (/INSERT INTO identity_verification_provider_tombstones/u.test(sql)) {
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`unexpected SQL: ${sql}`);
    },
  };
}

test('test-mode identity start is idempotent and never exposes client_secret', async () => {
  const client = fakeClient();
  const provider = new StripeProvider({ mode: 'memory' });
  const first = await startIdentityVerification({
    client, actor, provider, idempotencyKey: 'identity-key-12345678', consentVersion: IDENTITY_CONSENT_VERSION,
  });
  assert.equal(first.status, 'requires_input');
  assert.equal(first.url, undefined);
  assert.equal(first.testFixture, true);
  assert.equal(JSON.stringify(first).includes('verify.stripe.com'), false);
  assert.equal('clientSecret' in first, false);
  const replay = await startIdentityVerification({
    client, actor, provider, idempotencyKey: 'identity-key-12345678', consentVersion: IDENTITY_CONSENT_VERSION,
  });
  assert.equal(replay.replayed, true);
  assert.equal('clientSecret' in replay, false);
  assert.equal(client.rows.length, 1);
});

test('non-memory identity providers fail closed when the hosted entrypoint is absent', async () => {
  const client = fakeClient();
  const provider = {
    mode: 'stripe',
    enabled: true,
    async createIdentityVerificationSession() {
      return {
        id: 'vs_missing_entrypoint_123456',
        status: 'requires_input',
        livemode: false,
        url: null,
      };
    },
  };
  await assert.rejects(
    startIdentityVerification({
      client,
      actor,
      provider,
      idempotencyKey: 'identity-key-42345678',
      consentVersion: IDENTITY_CONSENT_VERSION,
    }),
    (error) => error?.code === 'identity_verification_provider_entrypoint_missing',
  );
});

test('unknown webhook is retryable and ordered terminal status cannot regress', async () => {
  const client = fakeClient();
  const provider = new StripeProvider({ mode: 'memory' });
  await startIdentityVerification({ client, actor, provider, idempotencyKey: 'identity-key-22345678', consentVersion: IDENTITY_CONSENT_VERSION });
  const sessionId = client.rows[0].providerSessionId;
  const pending = await applyIdentityVerificationWebhook({
    client,
    event: { id: 'evt_unknown_123456', type: 'identity.verification_session.verified', created: 10, data: { object: { id: 'vs_missing', object: 'identity.verification_session', status: 'verified', livemode: false } } },
  });
  assert.equal(pending.pending, true);
  const verified = await applyIdentityVerificationWebhook({
    client,
    event: { id: 'evt_verified_123456', type: 'identity.verification_session.verified', created: 20, data: { object: { id: sessionId, object: 'identity.verification_session', status: 'verified', livemode: false } } },
  });
  assert.equal(verified.matched, true);
  const stale = await applyIdentityVerificationWebhook({
    client,
    event: { id: 'evt_processing_123456', type: 'identity.verification_session.processing', created: 21, data: { object: { id: sessionId, object: 'identity.verification_session', status: 'processing', livemode: false } } },
  });
  assert.equal(stale.stale, true);
  assert.equal(client.rows[0].status, 'verified');
});

test('redaction event uses redaction.status while preserving provider session status', async () => {
  const client = fakeClient();
  const provider = new StripeProvider({ mode: 'memory' });
  await startIdentityVerification({ client, actor, provider, idempotencyKey: 'identity-key-32345678', consentVersion: IDENTITY_CONSENT_VERSION });
  const sessionId = client.rows[0].providerSessionId;
  const result = await applyIdentityVerificationWebhook({
    client,
    event: {
      id: 'evt_redacted_123456', type: 'identity.verification_session.redacted', created: 30,
      data: { object: { id: sessionId, object: 'identity.verification_session', status: 'verified', livemode: false, redaction: { status: 'redacted' } } },
    },
  });
  assert.equal(result.status, 'redacted');
  assert.equal(client.rows[0].status, 'redacted');
});

test('background reconciliation reuses the deterministic provider request after response loss', async () => {
  const row = {
    id: '33333333-3333-4333-8333-333333333333',
    user_id: actor.id,
    provider_session_id: 'pending_33333333-3333-4333-8333-333333333333',
  };
  let reconciled = false;
  const client = {
    async query(sql, params = []) {
      if (/WHERE provider_session_id LIKE 'pending_%'/u.test(sql)) {
        return reconciled ? { rows: [], rowCount: 0 } : { rows: [row], rowCount: 1 };
      }
      if (/UPDATE identity_verification_sessions/u.test(sql)) {
        reconciled = true;
        assert.equal(params[3], row.provider_session_id);
        return { rows: [{ ...row, provider_session_id: params[1], status: params[2], livemode: false, updated_at: new Date() }], rowCount: 1 };
      }
      throw new Error(`unexpected SQL: ${sql}`);
    },
  };
  const calls = [];
  const provider = {
    enabled: true,
    async createIdentityVerificationSession(args) {
      calls.push(args);
      return { id: 'vs_test_sit_reconciled', status: 'requires_input', livemode: false };
    },
  };
  let audits = 0;
  const result = await reconcilePendingIdentityVerificationSessions({
    client,
    provider,
    audit: async () => { audits += 1; },
  });
  assert.deepEqual(result, { inspected: 1, reconciled: 1, failed: 0 });
  assert.equal(calls.length, 1);
  assert.equal('ownerReference' in calls[0], false);
  assert.equal(audits, 1);
});
