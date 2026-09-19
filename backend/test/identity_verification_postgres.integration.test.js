import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { once } from 'node:events';
import pg from 'pg';
import test from 'node:test';

import { buildAccountExport } from '../src/privacy_export.js';
import { StripeProvider } from '../src/stripe_provider.js';
import { stripeSignatureHeader } from '../src/payment_domain.js';
import {
  drainIdentityVerificationRedactions,
  expireIdentityVerificationInputs,
  pruneIdentityVerificationRecords,
} from '../src/identity_verification_cleanup.js';
import { runMigrations } from '../src/migrations.js';
import {
  IDENTITY_CONSENT_VERSION,
  applyIdentityVerificationWebhook,
  reconcilePendingIdentityVerificationSessions,
  revokeIdentityVerification,
  refreshIdentityVerification,
  startIdentityVerification,
} from '../src/identity_verification_workflow.js';

const databaseUrl = process.env.TEST_DATABASE_URL?.trim();

if (!databaseUrl) {
  test.skip('Identity PostgreSQL workflow integration requires TEST_DATABASE_URL');
} else {
  async function withIdentityDatabase(run) {
    const pool = new pg.Pool({ connectionString: databaseUrl, max: 12 });
    const schema = await fs.readFile(new URL('../sql/schema.sql', import.meta.url), 'utf8');
    const suffix = crypto.randomUUID().replaceAll('-', '');
    const userId = `identity-pg-user-${suffix}`;
    const actor = { id: userId, role: 'user', accountStatus: 'active', deactivatedAt: null };
    await pool.query(schema);
    await runMigrations(pool);
    await pool.query(
      `INSERT INTO users (id, email, profile) VALUES ($1, $2, '{}'::jsonb)`,
      [userId, `${suffix}@example.invalid`],
    );
    try {
      return await run({ pool, suffix, userId, actor });
    } finally {
      await pool.query('DELETE FROM users WHERE id = $1', [userId]).catch(() => {});
      await pool.end();
    }
  }

  test('identity starts, lost-response reconciliation, revoke intent, and pilot gate are server-authoritative', async () => {
    const pool = new pg.Pool({ connectionString: databaseUrl, max: 8 });
    const schema = await fs.readFile(new URL('../sql/schema.sql', import.meta.url), 'utf8');
    const suffix = crypto.randomUUID().replaceAll('-', '');
    const userId = `identity-pg-user-${suffix}`;
    const actor = { id: userId, role: 'user', accountStatus: 'active', deactivatedAt: null };
    await pool.query(schema);
    await runMigrations(pool);
    await pool.query(
      `INSERT INTO users (id, email, profile) VALUES ($1, $2, '{}'::jsonb)`,
      [userId, `${suffix}@example.invalid`],
    );
    let providerCreates = 0;
    let lostOnce = true;
    const provider = {
      enabled: true,
      livemode: false,
      async createIdentityVerificationSession({ providerIdempotencyKey }) {
        providerCreates += 1;
        if (lostOnce) {
          lostOnce = false;
          throw new Error('simulated_response_loss');
        }
        return {
          id: `vs_pg_${providerIdempotencyKey.slice(-16)}`,
          status: 'requires_input',
          url: 'https://verify.stripe.com/test/pg',
          livemode: false,
        };
      },
      async retrieveIdentityVerificationSession(providerSessionId) {
        return { id: providerSessionId, status: 'requires_input', livemode: false };
      },
    };
    try {
      await assert.rejects(startIdentityVerification({
        client: pool,
        actor,
        provider,
        idempotencyKey: `identity-pg-key-${suffix}`,
        consentVersion: IDENTITY_CONSENT_VERSION,
      }), /simulated_response_loss/u);
      assert.equal((await pool.query(
        `SELECT count(*)::int AS count FROM identity_verification_sessions
          WHERE user_id = $1 AND provider_session_id LIKE 'pending_%'`, [userId],
      )).rows[0].count, 1);
      const reconciled = await reconcilePendingIdentityVerificationSessions({
        client: pool,
        provider,
        limit: 10,
      });
      assert.equal(reconciled.reconciled, 1);
      assert.ok(providerCreates >= 2);
      const active = await pool.query(
        `SELECT id, provider_session_id, status FROM identity_verification_sessions
          WHERE user_id = $1`, [userId],
      );
      assert.equal(active.rows.length, 1);
      assert.match(active.rows[0].provider_session_id, /^vs_pg_/u);

      const revoked = await revokeIdentityVerification({ client: pool, actor });
      assert.equal(revoked.redactionStatus, 'queued');
      await assert.rejects(startIdentityVerification({
        client: pool,
        actor,
        provider,
        idempotencyKey: `identity-pg-new-${suffix}`,
        consentVersion: IDENTITY_CONSENT_VERSION,
      }), (error) => error?.code === 'identity_verification_deletion_in_progress');
      assert.equal((await pool.query(
        `SELECT count(*)::int AS count FROM identity_verification_redaction_outbox
          WHERE identity_session_id IN (SELECT id FROM identity_verification_sessions WHERE user_id = $1)
            AND status IN ('pending', 'processing', 'retry')`, [userId],
      )).rows[0].count, 1);
    } finally {
      await pool.query('DELETE FROM users WHERE id = $1', [userId]);
      await pool.end();
    }
  });

  test('concurrent starts converge on one provider session and one local active row', async () => {
    await withIdentityDatabase(async ({ pool, suffix, actor }) => {
      let providerCreates = 0;
      let sharedCreate;
      const provider = {
        enabled: true,
        livemode: false,
        async createIdentityVerificationSession() {
          if (!sharedCreate) {
            providerCreates += 1;
            sharedCreate = new Promise((resolve) => setTimeout(() => resolve({
              id: `vs_concurrent_${suffix}`,
              status: 'requires_input',
              url: 'https://verify.stripe.com/test/concurrent',
              livemode: false,
            }), 20));
          }
          return sharedCreate;
        },
        async retrieveIdentityVerificationSession(id) {
          return { id, status: 'requires_input', livemode: false };
        },
      };
      const [first, second] = await Promise.all([
        startIdentityVerification({
          client: pool, actor, provider,
          idempotencyKey: `identity-concurrent-a-${suffix}`,
          consentVersion: IDENTITY_CONSENT_VERSION,
        }),
        startIdentityVerification({
          client: pool, actor, provider,
          idempotencyKey: `identity-concurrent-b-${suffix}`,
          consentVersion: IDENTITY_CONSENT_VERSION,
        }),
      ]);
      assert.equal(first.sessionId, second.sessionId);
      assert.equal(providerCreates, 1);
      const rows = await pool.query(
        `SELECT count(*)::int AS count FROM identity_verification_sessions WHERE user_id = $1`,
        [actor.id],
      );
      assert.equal(rows.rows[0].count, 1);
    });
  });

  test('webhook signature, replay, ordering and unknown events are server-authoritative', async () => {
    await withIdentityDatabase(async ({ pool, suffix, actor }) => {
      const provider = {
        enabled: true,
        livemode: false,
        async createIdentityVerificationSession() {
          return {
            id: `vs_webhook_${suffix}`,
            status: 'requires_input',
            url: 'https://verify.stripe.com/test/webhook',
            livemode: false,
          };
        },
        async retrieveIdentityVerificationSession(id) {
          return { id, status: 'requires_input', livemode: false };
        },
      };
      const started = await startIdentityVerification({
        client: pool, actor, provider,
        idempotencyKey: `identity-webhook-${suffix}`,
        consentVersion: IDENTITY_CONSENT_VERSION,
      });
      const event = (id, type, created, status) => ({
        id,
        type,
        created,
        data: {
          object: {
            object: 'identity.verification_session',
            id: started.providerSessionId ?? `vs_webhook_${suffix}`,
            status,
            livemode: false,
          },
        },
      });
      const secret = `whsec_${suffix}`;
      const signatureTimestamp = Math.floor(Date.now() / 1000);
      const raw = JSON.stringify(event(
        `evt-webhook-${suffix}`,
        'identity.verification_session.processing',
        2_000,
        'processing',
      ));
      const parser = new StripeProvider({ mode: 'stripe', secretKey: 'sk_test_identity' });
      const parsed = parser.parseWebhookEvent({
        rawBody: Buffer.from(raw),
        signatureHeader: stripeSignatureHeader({ payload: raw, secret, timestamp: signatureTimestamp }),
        webhookSecret: secret,
      });
      const applied = await applyIdentityVerificationWebhook({ client: pool, event: parsed });
      assert.equal(applied.status, 'processing');
      const replay = await applyIdentityVerificationWebhook({ client: pool, event: parsed });
      assert.equal(replay.replayed, true);
      const stale = await applyIdentityVerificationWebhook({
        client: pool,
        event: event(
          `evt-webhook-stale-${suffix}`,
          'identity.verification_session.requires_input',
          1_999,
          'requires_input',
        ),
      });
      assert.equal(stale.stale, true);
      await assert.rejects(
        applyIdentityVerificationWebhook({
          client: pool,
          event: { ...parsed, id: `evt-webhook-unknown-${suffix}`, type: 'identity.verification_session.unknown' },
        }),
        (error) => error?.code === 'identity_verification_webhook_event_invalid',
      );
      await assert.throws(
        () => parser.parseWebhookEvent({
          rawBody: Buffer.from(raw),
          signatureHeader: stripeSignatureHeader({ payload: `${raw}tampered`, secret, timestamp: signatureTimestamp }),
          webhookSecret: secret,
        }),
        (error) => error?.code === 'invalid_webhook_signature',
      );
    });
  });

  test('refresh racing a verified webhook cannot regress the server status', async () => {
    await withIdentityDatabase(async ({ pool, suffix, actor }) => {
      let retrievalStarted;
      let releaseRetrieval;
      const retrievalReady = new Promise((resolve) => { retrievalStarted = resolve; });
      const retrievalGate = new Promise((resolve) => { releaseRetrieval = resolve; });
      const provider = {
        enabled: true,
        livemode: false,
        async createIdentityVerificationSession() {
          return { id: `vs-refresh-${suffix}`, status: 'requires_input', url: 'https://verify.stripe.com/test/refresh', livemode: false };
        },
        async retrieveIdentityVerificationSession(id) {
          retrievalStarted();
          await retrievalGate;
          return { id, status: 'processing', livemode: false };
        },
      };
      const started = await startIdentityVerification({
        client: pool, actor, provider,
        idempotencyKey: `identity-refresh-${suffix}`,
        consentVersion: IDENTITY_CONSENT_VERSION,
      });
      const refreshing = refreshIdentityVerification({ client: pool, actor, provider });
      await retrievalReady;
      await applyIdentityVerificationWebhook({
        client: pool,
        event: {
          id: `evt-refresh-${suffix}`,
          type: 'identity.verification_session.verified',
          created: 3_000,
          data: { object: {
            object: 'identity.verification_session',
            id: `vs-refresh-${suffix}`,
            status: 'verified',
            livemode: false,
          } },
        },
      });
      releaseRetrieval();
      const refreshed = await refreshing;
      assert.equal(refreshed.status, 'verified');
      assert.equal((await pool.query(
        `SELECT status FROM identity_verification_sessions WHERE user_id = $1`, [actor.id],
      )).rows[0].status, 'verified');
    });
  });

  test('provider response lost after local revoke is fail-closed and queues the real provider redaction', async () => {
    await withIdentityDatabase(async ({ pool, suffix, actor }) => {
      let createStarted;
      let releaseCreate;
      const createReady = new Promise((resolve) => { createStarted = resolve; });
      const createGate = new Promise((resolve) => { releaseCreate = resolve; });
      const providerSessionId = `vs-revoke-race-${suffix}`;
      const provider = {
        enabled: true,
        livemode: false,
        async createIdentityVerificationSession() {
          createStarted();
          await createGate;
          return { id: providerSessionId, status: 'requires_input', url: 'https://verify.stripe.com/test/revoke-race', livemode: false };
        },
      };
      const starting = startIdentityVerification({
        client: pool, actor, provider,
        idempotencyKey: `identity-revoke-race-${suffix}`,
        consentVersion: IDENTITY_CONSENT_VERSION,
      });
      await createReady;
      const revoked = await revokeIdentityVerification({ client: pool, actor });
      assert.equal(revoked.redactionStatus, 'queued');
      releaseCreate();
      await assert.rejects(starting, (error) => error?.code === 'identity_verification_deletion_in_progress');
      const queued = await pool.query(
        `SELECT provider_session_id, status FROM identity_verification_redaction_outbox
          WHERE provider_session_id = $1`, [providerSessionId],
      );
      assert.equal(queued.rows[0].provider_session_id, providerSessionId);
      assert.equal(queued.rows[0].status, 'pending');
    });
  });

  test('revoke, redaction and a worker restart leave only redacted local truth', async () => {
    await withIdentityDatabase(async ({ pool, suffix, actor }) => {
      const provider = {
        enabled: true,
        livemode: false,
        async createIdentityVerificationSession() {
          return { id: `vs-redact-${suffix}`, status: 'requires_input', url: 'https://verify.stripe.com/test/redact', livemode: false };
        },
        async retrieveIdentityVerificationSession(id) {
          return { id, status: 'requires_input', livemode: false };
        },
        async redactIdentityVerificationSession(id) {
          return { id, status: 'requires_input', livemode: false, redaction: { status: 'redacted' } };
        },
      };
      await startIdentityVerification({
        client: pool, actor, provider,
        idempotencyKey: `identity-redact-${suffix}`,
        consentVersion: IDENTITY_CONSENT_VERSION,
      });
      await revokeIdentityVerification({ client: pool, actor });
      const outbox = await pool.query(
        `SELECT id FROM identity_verification_redaction_outbox
          WHERE identity_session_id IN (SELECT id FROM identity_verification_sessions WHERE user_id = $1)`,
        [actor.id],
      );
      const firstDrain = await drainIdentityVerificationRedactions({
        client: pool, provider, ids: outbox.rows.map((row) => row.id),
      });
      assert.deepEqual(firstDrain, { redacted: 1, retried: 0 });
      const secondDrain = await drainIdentityVerificationRedactions({
        client: pool, provider, ids: outbox.rows.map((row) => row.id),
      });
      assert.deepEqual(secondDrain, { redacted: 0, retried: 0 });
      const state = await pool.query(
        `SELECT status, provider_session_id, provider_session_hash FROM identity_verification_sessions WHERE user_id = $1`,
        [actor.id],
      );
      assert.equal(state.rows[0].status, 'redacted');
      assert.equal(state.rows[0].provider_session_id, null);
      assert.match(state.rows[0].provider_session_hash, /^[0-9a-f]{64}$/u);
      assert.equal((await pool.query(
        `SELECT status, provider_session_id, provider_session_hash
           FROM identity_verification_redaction_outbox WHERE id = $1`,
        [outbox.rows[0].id],
      )).rows[0].status, 'redacted');
    });
  });

  test('24-hour expiry and 30-day retention boundaries are enforced', async () => {
    await withIdentityDatabase(async ({ pool, suffix, actor }) => {
      const otherUserId = `identity-pg-other-${suffix}`;
      const exactUserId = `identity-pg-exact-${suffix}`;
      await pool.query(
        `INSERT INTO users (id, email, profile) VALUES ($1, $2, '{}'::jsonb)`,
        [otherUserId, `other-${suffix}@example.invalid`],
      );
      await pool.query(
        `INSERT INTO users (id, email, profile) VALUES ($1, $2, '{}'::jsonb)`,
        [exactUserId, `exact-${suffix}@example.invalid`],
      );
      const oldId = `identity-old-${suffix}`;
      const freshId = `identity-fresh-${suffix}`;
      const exactId = `identity-exact-${suffix}`;
      const oldProvider = `vs-old-${suffix}`;
      const freshProvider = `vs-fresh-${suffix}`;
      const exactProvider = `vs-exact-${suffix}`;
      for (const [id, ownerId, providerId, age] of [
        [oldId, actor.id, oldProvider, '25 hours'],
        [freshId, otherUserId, freshProvider, '23 hours 59 minutes 59 seconds'],
        [exactId, exactUserId, exactProvider, '24 hours'],
      ]) {
        await pool.query(
          `INSERT INTO identity_verification_sessions
             (id, user_id, provider, provider_session_id, status, livemode, idempotency_key, request_hash, consent_version, consented_at, created_at, updated_at)
           VALUES ($1, $2, 'stripe_identity', $3, 'requires_input', false, $4, $5, $6, now(), now() - $7::interval, now() - $7::interval)`,
          [id, ownerId, providerId, `identity-key-${id}`, 'a'.repeat(64), IDENTITY_CONSENT_VERSION, age],
        );
      }
      const expired = await expireIdentityVerificationInputs(pool, { limit: 10 });
      assert.equal(expired, 2);
      const statuses = await pool.query(
        `SELECT id, status FROM identity_verification_sessions WHERE id IN ($1, $2, $3) ORDER BY id`,
        [oldId, freshId, exactId],
      );
      assert.equal(statuses.rows.find((row) => row.id === oldId).status, 'canceled');
      assert.equal(statuses.rows.find((row) => row.id === freshId).status, 'requires_input');
      assert.equal(statuses.rows.find((row) => row.id === exactId).status, 'canceled');

      const redactedId = `identity-retention-old-${suffix}`;
      const exactRetentionId = `identity-retention-exact-${suffix}`;
      const freshRetentionId = `identity-retention-fresh-${suffix}`;
      for (const [id, hash, age] of [
        [redactedId, 'b'.repeat(64), '31 days'],
        [exactRetentionId, 'c'.repeat(64), '30 days'],
        [freshRetentionId, 'd'.repeat(64), '29 days 23 hours 59 minutes 59 seconds'],
      ]) {
        await pool.query(
          `INSERT INTO identity_verification_sessions
             (id, user_id, provider, provider_session_id, provider_session_hash, status, livemode, idempotency_key, request_hash, consent_version, consented_at, created_at, updated_at)
           VALUES ($1, $2, 'stripe_identity', NULL, $3, 'redacted', false, $4, $5, $6, now(), now() - $7::interval, now() - $7::interval)`,
          [id, actor.id, hash, `identity-retention-key-${id}`, 'c'.repeat(64), IDENTITY_CONSENT_VERSION, age],
        );
        await pool.query(
          `INSERT INTO identity_verification_redaction_outbox
             (provider_session_id, provider_session_hash, identity_session_id, status, created_at, updated_at)
           VALUES (NULL, $1, $2, 'redacted', now() - $3::interval, now() - $3::interval)`,
          [hash, id, age],
        );
        await pool.query(
          `INSERT INTO audit_log (actor_id, actor_role, action, resource_type, resource_id, metadata, created_at)
           VALUES (NULL, 'system', 'identity_verification.redacted', 'identity_verification_session', $1, '{}'::jsonb, now() - $2::interval)`,
          [id, age],
        );
      }
      const pruned = await pruneIdentityVerificationRecords(pool, { limit: 20 });
      assert.equal(pruned.outbox, 2);
      assert.equal(pruned.audit, 2);
      assert.equal(pruned.sessions, 2);
      assert.equal((await pool.query(
        `SELECT count(*)::int AS count FROM identity_verification_sessions WHERE id = $1`, [redactedId],
      )).rows[0].count, 0);
      assert.equal((await pool.query(
        `SELECT count(*)::int AS count FROM identity_verification_sessions WHERE id = $1`, [exactRetentionId],
      )).rows[0].count, 0);
      assert.equal((await pool.query(
        `SELECT count(*)::int AS count FROM identity_verification_sessions WHERE id = $1`, [freshRetentionId],
      )).rows[0].count, 1);
      await pool.query('DELETE FROM users WHERE id = $1', [otherUserId]);
      await pool.query('DELETE FROM users WHERE id = $1', [exactUserId]);
    });
  });

  test('identity audit retention deletes only old redacted rows and never permits updates or unrelated deletes', async () => {
    await withIdentityDatabase(async ({ pool, suffix, actor }) => {
      const redactedId = `identity-audit-redacted-${suffix}`;
      const youngId = `identity-audit-young-${suffix}`;
      const activeId = `identity-audit-active-${suffix}`;
      for (const [id, status, providerId, age] of [
        [redactedId, 'redacted', null, '31 days'],
        [youngId, 'redacted', null, '29 days'],
        [activeId, 'canceled', `vs-audit-${suffix}`, '31 days'],
      ]) {
        await pool.query(
          `INSERT INTO identity_verification_sessions
             (id, user_id, provider, provider_session_id, provider_session_hash, status, livemode, idempotency_key, request_hash, consent_version, consented_at, created_at, updated_at)
           VALUES ($1, $2, 'stripe_identity', $3, $4, $5, false, $6, $7, $8, now(), now() - $9::interval, now() - $9::interval)`,
          [id, actor.id, providerId, providerId ? null : 'd'.repeat(64), status,
            `identity-audit-key-${id}`, 'e'.repeat(64), IDENTITY_CONSENT_VERSION, age],
        );
        await pool.query(
          `INSERT INTO audit_log (actor_id, actor_role, action, resource_type, resource_id, metadata, created_at)
           VALUES (NULL, 'system', 'identity_verification.audit', 'identity_verification_session', $1, '{}'::jsonb, now() - $2::interval)`,
          [id, age],
        );
      }
      await pool.query(
        `INSERT INTO audit_log (actor_id, actor_role, action, resource_type, resource_id, metadata, created_at)
         VALUES (NULL, 'system', 'unrelated.audit', 'user', $1, '{}'::jsonb, now() - interval '31 days')`,
        [actor.id],
      );
      await pool.query(`SELECT set_config('sit.identity_audit_retention', '1', true)`);
      await assert.rejects(
        pool.query(`UPDATE audit_log SET action = 'tampered' WHERE resource_id = $1`, [redactedId]),
        /append-only/u,
      );
      await assert.rejects(
        pool.query(`DELETE FROM audit_log WHERE resource_type = 'user' AND resource_id = $1`, [actor.id]),
        /append-only/u,
      );
      const result = await pruneIdentityVerificationRecords(pool, { limit: 50 });
      assert.equal(result.audit, 1);
      assert.equal((await pool.query(
        `SELECT count(*)::int AS count FROM audit_log WHERE resource_id = $1`, [redactedId],
      )).rows[0].count, 0);
      assert.equal((await pool.query(
        `SELECT count(*)::int AS count FROM audit_log WHERE resource_id = $1`, [youngId],
      )).rows[0].count, 1);
      assert.equal((await pool.query(
        `SELECT count(*)::int AS count FROM audit_log WHERE resource_id = $1`, [activeId],
      )).rows[0].count, 1);
      assert.equal((await pool.query(
        `SELECT count(*)::int AS count FROM audit_log WHERE resource_type = 'user' AND resource_id = $1`, [actor.id],
      )).rows[0].count, 1);
    });
  });

  test('pilot close lock wins over a concurrent start after an existing session', async () => {
    await withIdentityDatabase(async ({ pool, suffix, actor, userId }) => {
      const provider = {
        enabled: true,
        livemode: false,
        async createIdentityVerificationSession() {
          return { id: `vs-race-${suffix}`, status: 'requires_input', url: 'https://verify.stripe.com/test/race', livemode: false };
        },
      };
      await startIdentityVerification({
        client: pool, actor, provider,
        idempotencyKey: `identity-race-initial-${suffix}`,
        consentVersion: IDENTITY_CONSENT_VERSION,
      });
      const lock = await pool.connect();
      await lock.query('BEGIN');
      await lock.query(`SELECT pilot_closed FROM identity_verification_control WHERE id = true FOR UPDATE`);
      const starting = startIdentityVerification({
        client: pool, actor, provider,
        idempotencyKey: `identity-race-${suffix}`,
        consentVersion: IDENTITY_CONSENT_VERSION,
      });
      await new Promise((resolve) => setTimeout(resolve, 20));
      await lock.query(`UPDATE identity_verification_control SET pilot_closed = true, closed_at = now(), updated_at = now() WHERE id = true`);
      await lock.query('COMMIT');
      lock.release();
      await assert.rejects(starting, (error) => error?.code === 'identity_verification_pilot_closed');
      const accountExport = await buildAccountExport(pool, userId);
      assert.ok(accountExport);
      await pool.query('DELETE FROM users WHERE id = $1', [userId]);
      assert.equal(await buildAccountExport(pool, userId), null);
      assert.equal((await pool.query(
        `SELECT count(*)::int AS count FROM identity_verification_sessions WHERE user_id = $1`, [userId],
      )).rows[0].count, 0);
    });
  });

  test('HTTP webhook keeps raw-body signature truth and export/deletion removes raw provider data', async () => {
    await withIdentityDatabase(async ({ pool, suffix, actor, userId }) => {
      process.env.DATABASE_URL = databaseUrl;
      process.env.DEPLOYMENT_ENVIRONMENT = 'test';
      process.env.IDENTITY_VERIFICATION_TRANSPORT = 'stripe';
      process.env.IDENTITY_STRIPE_SECRET_KEY = 'rk_test_identityfixture';
      process.env.IDENTITY_VERIFICATION_WEBHOOK_SECRET = `whsec_http${suffix}`;
      const [{ createApp, eraseAccount }, { pool: appPool }] = await Promise.all([
        import('../src/app.js'),
        import('../src/db.js'),
      ]);
      const parser = new StripeProvider({ mode: 'stripe', secretKey: 'rk_test_identityfixture' });
      const app = createApp({ identityVerificationProvider: parser });
      const server = app.listen(0, '127.0.0.1');
      await once(server, 'listening');
      const address = server.address();
      const baseUrl = `http://127.0.0.1:${address.port}`;
      const providerSessionId = `vs-http-${suffix}`;
      const sessionId = `identity-http-${suffix}`;
      await pool.query(
        `INSERT INTO identity_verification_sessions
           (id, user_id, provider, provider_session_id, status, livemode, idempotency_key, request_hash, consent_version, consented_at)
         VALUES ($1, $2, 'stripe_identity', $3, 'requires_input', false, $4, $5, $6, now())`,
        [sessionId, userId, providerSessionId, `identity-http-key-${suffix}`, 'f'.repeat(64), IDENTITY_CONSENT_VERSION],
      );
      const event = {
        id: `evt-http-${suffix}`,
        type: 'identity.verification_session.processing',
        created: Math.floor(Date.now() / 1000),
        livemode: false,
        data: { object: {
          object: 'identity.verification_session',
          id: providerSessionId,
          status: 'processing',
          livemode: false,
        } },
      };
      const raw = JSON.stringify(event);
      const secret = process.env.IDENTITY_VERIFICATION_WEBHOOK_SECRET;
      const signed = stripeSignatureHeader({ payload: raw, secret });
      try {
        const invalid = await fetch(`${baseUrl}/v1/identity-verification/webhook`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'stripe-signature': 't=1,v1=bad' },
          body: raw,
        });
        assert.equal(invalid.status, 400);
        const liveRaw = JSON.stringify({ ...event, id: `evt-http-live-${suffix}`, livemode: true });
        const live = await fetch(`${baseUrl}/v1/identity-verification/webhook`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'stripe-signature': stripeSignatureHeader({ payload: liveRaw, secret }),
          },
          body: liveRaw,
        });
        assert.equal(live.status, 409);
        const accepted = await fetch(`${baseUrl}/v1/identity-verification/webhook`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'stripe-signature': signed },
          body: raw,
        });
        assert.equal(accepted.status, 200);
        const unknownEvent = { ...event, id: `evt-http-unknown-${suffix}`, data: { object: { ...event.data.object, id: `vs-unknown-${suffix}` } } };
        const unknownRaw = JSON.stringify(unknownEvent);
        const unknown = await fetch(`${baseUrl}/v1/identity-verification/webhook`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'stripe-signature': stripeSignatureHeader({ payload: unknownRaw, secret }),
          },
          body: unknownRaw,
        });
        assert.equal(unknown.status, 409);
      } finally {
        await new Promise((resolve, reject) => {
          server.close((error) => error ? reject(error) : resolve());
        });
        await appPool.end();
      }

      const user = (await pool.query('SELECT * FROM users WHERE id = $1', [userId])).rows[0];
      await eraseAccount(pool, user, { actorRole: 'user', source: 'integration' });
      const redactionIds = (await pool.query(
        `SELECT id FROM identity_verification_redaction_outbox WHERE identity_session_id = $1`, [sessionId],
      )).rows.map((row) => row.id);
      const redactionProvider = {
        async retrieveIdentityVerificationSession(id) { return { id, status: 'processing', livemode: false }; },
        async redactIdentityVerificationSession(id) { return { id, status: 'processing', livemode: false, redaction: { status: 'redacted' } }; },
      };
      await drainIdentityVerificationRedactions({ client: pool, provider: redactionProvider, ids: redactionIds });
      const exported = await buildAccountExport(pool, userId);
      const identity = exported.data.trustAndSafety;
      assert.equal(identity.identityVerificationSessions.length, 1);
      assert.equal(identity.identityVerificationWebhookEvents.length, 1);
      assert.equal(identity.identityVerificationRedactionOutbox.length, 1);
      assert.equal(identity.identityVerificationAudit.length >= 1, true);
      assert.equal(identity.identityVerificationTombstones.length, 1);
      const serialized = JSON.stringify(identity);
      for (const secretValue of [providerSessionId, 'f'.repeat(64), 'identity-http-key']) {
        assert.equal(serialized.includes(secretValue), false);
      }
      for (const forbidden of ['provider_session_id', 'provider_session_hash', 'idempotency_key', 'request_hash', 'verify.stripe.com']) {
        assert.equal(serialized.includes(forbidden), false);
      }
      assert.equal((await pool.query(
        `SELECT provider_session_id, provider_session_hash FROM identity_verification_sessions WHERE id = $1`, [sessionId],
      )).rows[0].provider_session_id, null);
      assert.match((await pool.query(
        `SELECT provider_session_hash FROM identity_verification_sessions WHERE id = $1`, [sessionId],
      )).rows[0].provider_session_hash, /^[0-9a-f]{64}$/u);
    });
  });
}
