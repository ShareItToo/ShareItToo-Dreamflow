import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const databaseUrl = process.env.TEST_DATABASE_URL?.trim();

if (!databaseUrl) {
  test.skip('staging Google registration integration requires TEST_DATABASE_URL');
} else {
  test('staging Google registration creates and reconnects only the allowlisted identity', async () => {
    const userId = `staging-google-${crypto.randomUUID()}`;
    const email = `${userId}@example.invalid`;
    const subject = `google-subject-${crypto.randomUUID()}`;
    const token = 'synthetic-google-token-a'.repeat(8);
    const token2 = 'synthetic-google-token-b'.repeat(8);
    const token3 = 'synthetic-google-token-c'.repeat(8);
    const token4 = 'synthetic-google-token-d'.repeat(8);
    const tokenApple = 'synthetic-apple-token'.repeat(8);
    const tokenExpired = 'synthetic-expired-token'.repeat(8);
    const tokenUnlisted = 'synthetic-unlisted-token'.repeat(8);
    const tokenExistingUnlisted = 'synthetic-existing-unlisted-token'.repeat(8);
    const nowSeconds = Math.floor(Date.now() / 1000);
    const identity = {
      provider: 'google',
      subject,
      firebaseUserId: `firebase-${subject}`,
      email,
      emailVerified: true,
      displayName: 'Synthetic staging pilot',
      tokenIssuedAt: nowSeconds - 30,
      tokenExpiresAt: nowSeconds + 600,
      tokenDigest: crypto.createHash('sha256').update(token, 'utf8').digest('hex'),
    };
    const identityDigest = crypto.createHash('sha256')
      .update(`google\n${subject}\n${identity.firebaseUserId}\n${email}`, 'utf8')
      .digest('hex');
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sit-staging-google-registration-'));
    const serviceAccountFile = path.join(tempDir, 'firebase-service-account.json');
    await fs.writeFile(serviceAccountFile, JSON.stringify({
      type: 'service_account',
      project_id: 'shareittoo-staging',
      private_key_id: 'a'.repeat(40),
      private_key: '-----BEGIN PRIVATE KEY-----\nsynthetic-test-material\n-----END PRIVATE KEY-----\n',
      client_email: 'synthetic-test@shareittoo-staging.iam.gserviceaccount.com',
      client_id: '123456789012345678901',
      token_uri: 'https://oauth2.googleapis.com/token',
    }), { mode: 0o600 });
    Object.assign(process.env, {
      DATABASE_URL: databaseUrl,
      NODE_ENV: 'production',
      DEPLOYMENT_ENVIRONMENT: 'test',
      JWT_SECRET: crypto.randomBytes(48).toString('base64url'),
      PAYMENT_TRANSPORT: 'memory',
      STRIPE_LIVEMODE: 'false',
      MAIL_TRANSPORT: 'memory',
      FIREBASE_AUTH_ENABLED: 'true',
      FIREBASE_PROJECT_ID: 'shareittoo-staging',
      FIREBASE_SERVICE_ACCOUNT_FILE: serviceAccountFile,
      SIT_STAGING_ACCESS_GATE_ENABLED: 'true',
      SIT_STAGING_ALLOWED_USER_IDS: userId,
      SIT_STAGING_GOOGLE_REGISTRATION_ENABLED: 'true',
      SIT_STAGING_GOOGLE_REGISTRATION_PROVIDER: 'google',
      SIT_STAGING_GOOGLE_REGISTRATION_ALLOWLIST: `${identityDigest}=${userId}`,
    });

    const { default: pg } = await import('pg');
    const { runMigrations } = await import('../src/migrations.js');
    const setupPool = new pg.Pool({ connectionString: databaseUrl, max: 4 });
    let server;
    try {
      const schema = await fs.readFile(new URL('../sql/schema.sql', import.meta.url), 'utf8');
      await setupPool.query(schema);
      await runMigrations(setupPool);
      const { createApp } = await import('../src/app.js');
      const withTokenDigest = (rawToken) => ({
        ...identity,
        tokenDigest: crypto.createHash('sha256').update(rawToken, 'utf8').digest('hex'),
      });
      const identities = new Map([
        [token, withTokenDigest(token)],
        [token2, withTokenDigest(token2)],
        [token3, withTokenDigest(token3)],
        [token4, withTokenDigest(token4)],
        [tokenApple, {
          ...withTokenDigest(tokenApple),
          provider: 'apple',
          subject: 'apple-existing-subject',
        }],
        [tokenExpired, {
          ...withTokenDigest(tokenExpired),
          tokenExpiresAt: nowSeconds - 1,
        }],
        [tokenUnlisted, {
          ...withTokenDigest(tokenUnlisted),
          subject: 'google-unlisted-subject',
          email: 'unlisted@example.invalid',
          firebaseUserId: 'firebase-unlisted',
        }],
        [tokenExistingUnlisted, {
          ...withTokenDigest(tokenExistingUnlisted),
          subject: 'google-existing-unlisted-subject',
          email: 'existing-unlisted@example.invalid',
          firebaseUserId: 'firebase-existing-unlisted',
        }],
      ]);
      const app = createApp({
        verifySocialToken: async (rawToken, options) => {
          assert.equal(options.requireFreshToken, true);
          const verified = identities.get(rawToken);
          if (!verified || verified.tokenExpiresAt <= Math.floor(Date.now() / 1000)) {
            const error = new Error('invalid_social_token');
            error.status = 401;
            error.code = 'invalid_social_token';
            throw error;
          }
          return verified;
        },
      });
      server = http.createServer(app);
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      const baseUrl = `http://127.0.0.1:${server.address().port}`;
      const request = (idToken) => fetch(`${baseUrl}/v1/auth/social`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken,
          termsAccepted: true,
          privacyAccepted: true,
          minimumAgeConfirmed: true,
        }),
      });
      await setupPool.query(
        `INSERT INTO users (id, email, profile)
         VALUES ($1, 'other-owner@example.invalid', '{}'::jsonb)`,
        [userId],
      );
      const occupiedIdentity = await request(token3);
      assert.equal(occupiedIdentity.status, 403);
      assert.equal((await occupiedIdentity.json()).error, 'staging_google_identity_conflict');
      await setupPool.query('DELETE FROM users WHERE id = $1', [userId]);
      const parallel = await Promise.all([request(token3), request(token4)]);
      assert.deepEqual(parallel.map((response) => response.status).sort(), [200, 200]);
      assert.deepEqual(
        (await Promise.all(parallel.map((response) => response.json()))).map((body) => body.user.id),
        [userId, userId],
      );
      const replay = await request(token3);
      assert.equal(replay.status, 409);
      assert.equal((await replay.json()).error, 'staging_google_registration_replay');
      const reconnected = await request(token2);
      assert.equal(reconnected.status, 200);
      assert.equal((await reconnected.json()).user.id, userId);
      await setupPool.query(
        `INSERT INTO auth_identities (
           user_id, provider, provider_subject, firebase_user_id,
           email_at_link, email_verified, last_login_at
         ) VALUES ($1, 'apple', 'apple-existing-subject', 'apple-firebase-user', $2, true, now())`,
        [userId, email],
      );
      const appleExisting = await request(tokenApple);
      assert.equal(appleExisting.status, 200);
      assert.equal((await appleExisting.json()).user.id, userId);
      const expired = await request(tokenExpired);
      assert.equal(expired.status, 401);
      assert.equal((await expired.json()).error, 'invalid_social_token');
      const unlisted = await request(tokenUnlisted);
      assert.equal(unlisted.status, 403);
      assert.equal((await unlisted.json()).error, 'staging_google_identity_not_allowlisted');
      const nonAllowlistedUserId = `existing-unlisted-${crypto.randomUUID()}`;
      await setupPool.query(
        `INSERT INTO users (id, email, profile)
         VALUES ($1, 'existing-unlisted@example.invalid', '{}'::jsonb)`,
        [nonAllowlistedUserId],
      );
      await setupPool.query(
        `INSERT INTO auth_identities (
           user_id, provider, provider_subject, firebase_user_id,
           email_at_link, email_verified, last_login_at
         ) VALUES ($1, 'google', 'google-existing-unlisted-subject',
                   'firebase-existing-unlisted', $2, true, now())`,
        [nonAllowlistedUserId, 'existing-unlisted@example.invalid'],
      );
      const existingNonAllowlisted = await request(tokenExistingUnlisted);
      assert.equal(existingNonAllowlisted.status, 403);
      assert.equal((await existingNonAllowlisted.json()).error, 'staging_account_not_allowlisted');
      await setupPool.query('DELETE FROM users WHERE id = $1', [nonAllowlistedUserId]);
      const stored = await setupPool.query(
        `SELECT u.id, i.provider, i.provider_subject
           FROM users AS u
           JOIN auth_identities AS i ON i.user_id = u.id
          WHERE u.id = $1`,
        [userId],
      );
      assert.deepEqual(stored.rows, [
        { id: userId, provider: 'google', provider_subject: subject },
        { id: userId, provider: 'apple', provider_subject: 'apple-existing-subject' },
      ]);
      const replayRows = await setupPool.query(
        'SELECT identity_digest FROM staging_google_registration_replays WHERE identity_digest = $1',
        [identityDigest],
      );
      assert.equal(replayRows.rowCount, 2);
      const { reserveStagingGoogleRegistrationReplay } = await import(
        '../src/staging_google_registration.js'
      );
      const rollbackTokenDigest = crypto.createHash('sha256')
        .update('synthetic-rollback-token', 'utf8')
        .digest('hex');
      const rollbackClient = await setupPool.connect();
      try {
        await rollbackClient.query('BEGIN');
        await reserveStagingGoogleRegistrationReplay(rollbackClient, {
          tokenDigest: rollbackTokenDigest,
          identityDigest,
          expiresAt: new Date(Date.now() + 600_000),
        });
        await rollbackClient.query('ROLLBACK');
      } finally {
        rollbackClient.release();
      }
      const rolledBackReplay = await setupPool.query(
        'SELECT 1 FROM staging_google_registration_replays WHERE token_digest = $1',
        [rollbackTokenDigest],
      );
      assert.equal(rolledBackReplay.rowCount, 0);
    } finally {
      if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      await setupPool.query('DELETE FROM users WHERE id = $1', [userId]);
      await setupPool.end();
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });
}
