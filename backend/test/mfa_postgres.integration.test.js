import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import pg from 'pg';

import { createEphemeralAcceptancePassword } from '../ops/ephemeral_acceptance_password.mjs';

const databaseUrl = process.env.TEST_DATABASE_URL?.trim();

if (!databaseUrl) {
  test('MFA PostgreSQL/HTTP integration requires TEST_DATABASE_URL', { skip: true }, () => {});
} else {
  test('MFA HTTP contract persists lockouts, gates sessions, and supports social reauth', async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.JWT_SECRET ??= `mfa-integration-${'x'.repeat(48)}`;
    process.env.MFA_ENCRYPTION_KEY ??= Buffer.alloc(32, 9).toString('base64url');
    process.env.DEPLOYMENT_ENVIRONMENT = 'test';
    process.env.PAYMENT_TRANSPORT = 'memory';
    process.env.MAIL_TRANSPORT = 'memory';
    process.env.SIT_LISTING_AI_PROVIDER = 'mock';

    const database = new pg.Pool({ connectionString: databaseUrl, max: 8 });
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const schema = await fs.readFile(path.join(root, 'sql/schema.sql'), 'utf8');
    await database.query(schema);
    const { runMigrations } = await import('../src/migrations.js');
    await runMigrations(database);
    const { hashPassword, verifyPassword } = await import('../src/security.js');
    const { totpCode } = await import('../src/mfa_totp.js');
    const { createApp } = await import('../src/app.js');

    let credential = createEphemeralAcceptancePassword();
    const credentialUser = 'mfa-http-credential-user';
    const socialUser = 'mfa-http-social-user';
    const credentialEmail = `${credentialUser}@example.invalid`;
    const socialEmail = `${socialUser}@example.invalid`;
    await database.query('DELETE FROM users WHERE id = ANY($1::text[])', [[credentialUser, socialUser]]);
    const passwordHash = await hashPassword(credential);
    await database.query(
      `INSERT INTO users (id, email, password_hash, profile, email_verified_at,
          terms_accepted_at, privacy_accepted_at, minimum_age_confirmed_at,
          private_use_confirmed_at)
       VALUES ($1, $2, $3, '{"emailVerified":true}'::jsonb, now(), now(), now(), now(), now())`,
      [credentialUser, credentialEmail, passwordHash],
    );
    await database.query(
      `INSERT INTO users (id, email, password_hash, profile, email_verified_at,
          terms_accepted_at, privacy_accepted_at, minimum_age_confirmed_at,
          private_use_confirmed_at)
       VALUES ($1, $2, NULL, '{"emailVerified":true}'::jsonb, now(), now(), now(), now(), now())`,
      [socialUser, socialEmail],
    );
    const passwordCheck = await database.query(
      'SELECT password_hash, account_status, deactivated_at FROM users WHERE id = $1',
      [credentialUser],
    );
    assert.equal(passwordCheck.rows[0].account_status, 'active');
    assert.equal(await verifyPassword(credential, passwordCheck.rows[0].password_hash), true);
    await database.query(
      `INSERT INTO auth_identities (user_id, provider, provider_subject, firebase_user_id,
          email_at_link, email_verified, last_login_at)
       VALUES ($1, 'google', 'social-subject-1', 'firebase-social-1', $2, true, now())`,
      [socialUser, socialEmail],
    );

    const verifySocialToken = async (token) => ({
      provider: 'google',
      subject: token === 'social-good' ? 'social-subject-1' : 'wrong-subject',
      firebaseUserId: 'firebase-social-1',
      email: socialEmail,
      emailVerified: true,
      displayName: 'Integration Social',
    });
    const app = createApp({ verifySocialToken });
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    const base = `http://127.0.0.1:${address.port}`;
    const request = async (route, options = {}) => {
      const response = await fetch(`${base}${route}`, {
        ...options,
        signal: options.signal ?? AbortSignal.timeout(5000),
        headers: { 'content-type': 'application/json', ...(options.headers ?? {}) },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
      });
      return { response, body: await response.json().catch(() => null) };
    };
    const assertPrivateNoStore = (response) => {
      assert.equal(response.headers.get('cache-control'), 'private, no-store');
    };

    try {
      const login = await request('/v1/auth/login', { method: 'POST', body: { email: credentialEmail, password: credential } });
      assert.equal(login.response.status, 200);
      const auth = { authorization: `Bearer ${login.body.accessToken}` };
      const concurrentEnrollments = await Promise.all([
        request('/v1/auth/mfa/enroll', {
          method: 'POST', headers: { ...auth, 'idempotency-key': 'mfa-integration-enroll-1' },
          body: { currentPassword: credential },
        }),
        request('/v1/auth/mfa/enroll', {
          method: 'POST', headers: { ...auth, 'idempotency-key': 'mfa-integration-enroll-1' },
          body: { currentPassword: credential },
        }),
      ]);
      assert.equal(concurrentEnrollments[0].response.status, 201, JSON.stringify(concurrentEnrollments[0].body));
      assert.equal(concurrentEnrollments[1].response.status, 201, JSON.stringify(concurrentEnrollments[1].body));
      assertPrivateNoStore(concurrentEnrollments[0].response);
      assertPrivateNoStore(concurrentEnrollments[1].response);
      assert.equal(concurrentEnrollments[0].body.secret, concurrentEnrollments[1].body.secret);
      const enroll = concurrentEnrollments[0];
      await assert.rejects(
        database.query(
          `UPDATE mfa_totp_factors SET encrypted_secret = NULL WHERE user_id = $1`,
          [credentialUser],
        ),
        /mfa_totp_factors_secret_status_check/u,
      );
      const replay = await request('/v1/auth/mfa/enroll', {
        method: 'POST', headers: { ...auth, 'idempotency-key': 'mfa-integration-enroll-1' },
        body: { currentPassword: credential },
      });
      assert.equal(replay.response.status, 201);
      assert.equal(replay.body.secret, enroll.body.secret);
      const conflict = await request('/v1/auth/mfa/enroll', {
        method: 'POST', headers: { ...auth, 'idempotency-key': 'mfa-integration-enroll-2' },
        body: { currentPassword: credential },
      });
      assert.equal(conflict.response.status, 409);

      const confirm = await request('/v1/auth/mfa/confirm', {
        method: 'POST', headers: auth,
        body: {
          currentPassword: credential,
          code: totpCode(enroll.body.secret, Math.floor(Date.now() / 1000 / 30)),
        },
      });
      assert.equal(confirm.response.status, 200);
      assertPrivateNoStore(confirm.response);
      assert.equal(confirm.body.recoveryCodes.length, 10);
      const revokedStatus = await request('/v1/auth/mfa/status', { headers: auth });
      assert.equal(revokedStatus.response.status, 401);
      const oldRefresh = await request('/v1/auth/refresh', {
        method: 'POST', body: { refreshToken: login.body.refreshToken },
      });
      assert.equal(oldRefresh.response.status, 401);

      const mfaLogin = await request('/v1/auth/login', { method: 'POST', body: { email: credentialEmail, password: credential } });
      assert.equal(mfaLogin.response.status, 202);
      assertPrivateNoStore(mfaLogin.response);
      const challenge = mfaLogin.body.mfaChallenge;
      const failedChallenge = await request('/v1/auth/mfa/challenge', {
        method: 'POST',
        body: { mfaChallenge: challenge, code: '000000' },
      });
      assert.equal(failedChallenge.response.status, 401, JSON.stringify(failedChallenge.body));
      const persistedFailure = await database.query(
        `SELECT factor.failed_attempts, challenge.attempts
           FROM mfa_totp_factors factor
           JOIN auth_mfa_challenges challenge ON challenge.user_id = factor.user_id
          WHERE factor.user_id = $1 AND challenge.consumed_at IS NULL
          ORDER BY challenge.created_at DESC LIMIT 1`,
        [credentialUser],
      );
      assert.equal(persistedFailure.rows[0].failed_attempts, 1);
      assert.equal(persistedFailure.rows[0].attempts, 1);

      const challengeSuccess = await request('/v1/auth/mfa/challenge', {
        method: 'POST',
        body: { mfaChallenge: challenge, code: confirm.body.recoveryCodes[0] },
      });
      assert.equal(challengeSuccess.response.status, 200);
      assertPrivateNoStore(challengeSuccess.response);
      const refresh = await request('/v1/auth/refresh', {
        method: 'POST', body: { refreshToken: challengeSuccess.body.refreshToken },
      });
      assert.equal(refresh.response.status, 200);

      const nextCredential = createEphemeralAcceptancePassword();
      const passwordChange = await request('/v1/auth/password/change', {
        method: 'POST',
        headers: { authorization: `Bearer ${challengeSuccess.body.accessToken}` },
        body: { currentPassword: credential, newPassword: nextCredential },
      });
      assert.equal(passwordChange.response.status, 204);
      const factorAfterPasswordChange = await database.query(
        'SELECT status, encrypted_secret FROM mfa_totp_factors WHERE user_id = $1',
        [credentialUser],
      );
      assert.equal(factorAfterPasswordChange.rows[0].status, 'enabled');
      assert.ok(factorAfterPasswordChange.rows[0].encrypted_secret);
      const oldPasswordLogin = await request('/v1/auth/login', {
        method: 'POST', body: { email: credentialEmail, password: credential },
      });
      assert.equal(oldPasswordLogin.response.status, 401);
      credential = nextCredential;

      const replayLogin = await request('/v1/auth/login', {
        method: 'POST', body: { email: credentialEmail, password: credential },
      });
      assert.equal(replayLogin.response.status, 202);
      const replayedRecovery = await request('/v1/auth/mfa/challenge', {
        method: 'POST',
        body: { mfaChallenge: replayLogin.body.mfaChallenge, code: confirm.body.recoveryCodes[0] },
      });
      assert.equal(replayedRecovery.response.status, 401);
      const unusedRecovery = await request('/v1/auth/mfa/challenge', {
        method: 'POST',
        body: { mfaChallenge: replayLogin.body.mfaChallenge, code: confirm.body.recoveryCodes[2] },
      });
      assert.equal(unusedRecovery.response.status, 200);

      const expiredLogin = await request('/v1/auth/login', {
        method: 'POST', body: { email: credentialEmail, password: credential },
      });
      assert.equal(expiredLogin.response.status, 202);
      await database.query(
        `UPDATE auth_mfa_challenges SET expires_at = now() - interval '1 second'
          WHERE challenge_hash = encode(digest($1, 'sha256'), 'hex')`,
        [expiredLogin.body.mfaChallenge],
      );
      const expiredChallenge = await request('/v1/auth/mfa/challenge', {
        method: 'POST',
        body: { mfaChallenge: expiredLogin.body.mfaChallenge, code: confirm.body.recoveryCodes[4] },
      });
      assert.equal(expiredChallenge.response.status, 401);

      const disableLogin = await request('/v1/auth/login', {
        method: 'POST', body: { email: credentialEmail, password: credential },
      });
      assert.equal(disableLogin.response.status, 202);
      const disableChallenge = await request('/v1/auth/mfa/challenge', {
        method: 'POST',
        body: { mfaChallenge: disableLogin.body.mfaChallenge, code: confirm.body.recoveryCodes[1] },
      });
      assert.equal(disableChallenge.response.status, 200);
      const disableAuth = { authorization: `Bearer ${disableChallenge.body.accessToken}` };

      const disable = await request('/v1/auth/mfa/disable', {
        method: 'POST', headers: disableAuth,
        body: { currentPassword: credential, code: confirm.body.recoveryCodes[3] },
      });
      assert.equal(disable.response.status, 200);
      assertPrivateNoStore(disable.response);
      const factor = await database.query(
        'SELECT status, encrypted_secret FROM mfa_totp_factors WHERE user_id = $1',
        [credentialUser],
      );
      assert.equal(factor.rows[0].status, 'disabled');
      assert.equal(factor.rows[0].encrypted_secret, null);
      const credentialMfaAudit = await database.query(
        `SELECT action, metadata
           FROM audit_log
          WHERE actor_id = $1 AND action IN (
            'auth.mfa_enrollment_started', 'auth.mfa_enabled', 'auth.mfa_disabled'
          )
          ORDER BY created_at ASC`,
        [credentialUser],
      );
      assert.ok(credentialMfaAudit.rows.some((row) => row.action === 'auth.mfa_enrollment_started'));
      assert.ok(credentialMfaAudit.rows.some((row) => row.action === 'auth.mfa_enabled'));
      assert.ok(credentialMfaAudit.rows.some((row) => row.action === 'auth.mfa_disabled'));
      for (const row of credentialMfaAudit.rows) {
        const metadata = JSON.stringify(row.metadata);
        assert.doesNotMatch(metadata, new RegExp(enroll.body.secret, 'u'));
        for (const recoveryCode of confirm.body.recoveryCodes) {
          assert.doesNotMatch(metadata, new RegExp(recoveryCode, 'u'));
        }
      }
      await assert.rejects(
        database.query(
          `UPDATE mfa_totp_factors SET encrypted_secret = 'v1.invalid' WHERE user_id = $1`,
          [credentialUser],
        ),
        /mfa_totp_factors_secret_status_check/u,
      );

      const socialLogin = await request('/v1/auth/social', {
        method: 'POST', body: { idToken: 'social-good' },
      });
      assert.equal(socialLogin.response.status, 200);
      const socialAuth = { authorization: `Bearer ${socialLogin.body.accessToken}` };
      const socialMismatch = await request('/v1/auth/mfa/enroll', {
        method: 'POST', headers: { ...socialAuth, 'idempotency-key': 'mfa-integration-social-1' },
        body: { reauthSocialIdToken: 'social-bad' },
      });
      assert.equal(socialMismatch.response.status, 401);
      const socialEnroll = await request('/v1/auth/mfa/enroll', {
        method: 'POST', headers: { ...socialAuth, 'idempotency-key': 'mfa-integration-social-1' },
        body: { reauthSocialIdToken: 'social-good' },
      });
      assert.equal(socialEnroll.response.status, 201);
      const socialConfirm = await request('/v1/auth/mfa/confirm', {
        method: 'POST', headers: socialAuth,
        body: {
          reauthSocialIdToken: 'social-good',
          code: totpCode(socialEnroll.body.secret, Math.floor(Date.now() / 1000 / 30)),
        },
      });
      assert.equal(socialConfirm.response.status, 200);

      const socialMfaLogin = await request('/v1/auth/social', {
        method: 'POST', body: { idToken: 'social-good' },
      });
      assert.equal(socialMfaLogin.response.status, 202);
      assertPrivateNoStore(socialMfaLogin.response);
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const failed = await request('/v1/auth/mfa/challenge', {
          method: 'POST',
          body: { mfaChallenge: socialMfaLogin.body.mfaChallenge, code: '000000' },
        });
        assert.ok([401, 429].includes(failed.response.status));
      }
      const locked = await database.query(
        `SELECT factor.failed_attempts, factor.locked_until,
                challenge.attempts, challenge.locked_until AS challenge_locked_until
           FROM mfa_totp_factors factor
           JOIN auth_mfa_challenges challenge ON challenge.user_id = factor.user_id
          WHERE factor.user_id = $1 AND challenge.consumed_at IS NULL
          ORDER BY challenge.created_at DESC LIMIT 1`,
        [socialUser],
      );
      assert.ok(locked.rows[0].failed_attempts >= 5);
      assert.ok(locked.rows[0].locked_until);
      assert.ok(locked.rows[0].attempts >= 5);
      assert.ok(locked.rows[0].challenge_locked_until);

      // Persistent counters are capped before the constrained UPDATE, so a
      // hostile retry cannot turn the next 4xx into a database 500.
      await database.query(
        `UPDATE mfa_totp_factors
            SET failed_attempts = 100, locked_until = now() - interval '1 second'
          WHERE user_id = $1`,
        [socialUser],
      );
      await database.query(
        `UPDATE auth_mfa_challenges
            SET attempts = 100, locked_until = now() - interval '1 second'
          WHERE user_id = $1 AND consumed_at IS NULL`,
        [socialUser],
      );
      const cappedLogin = await request('/v1/auth/social', {
        method: 'POST', body: { idToken: 'social-good' },
      });
      assert.equal(cappedLogin.response.status, 202);
      await database.query(
        `UPDATE auth_mfa_challenges
            SET attempts = 100, locked_until = now() - interval '1 second'
          WHERE challenge_hash = encode(digest($1, 'sha256'), 'hex')`,
        [cappedLogin.body.mfaChallenge],
      );
      const cappedFailure = await request('/v1/auth/mfa/challenge', {
        method: 'POST',
        body: { mfaChallenge: cappedLogin.body.mfaChallenge, code: '000000' },
      });
      assert.equal(cappedFailure.response.status, 429);
      const capped = await database.query(
        `SELECT factor.failed_attempts, challenge.attempts
           FROM mfa_totp_factors factor
           JOIN auth_mfa_challenges challenge ON challenge.user_id = factor.user_id
          WHERE factor.user_id = $1 AND challenge.consumed_at IS NULL
          ORDER BY challenge.created_at DESC LIMIT 1`,
        [socialUser],
      );
      assert.equal(capped.rows[0].failed_attempts, 100);
      assert.equal(capped.rows[0].attempts, 100);

      // Both endpoints lock the user before the factor. The concurrent
      // challenge/disable proof must finish without a 500/deadlock and leave
      // the factor in one valid terminal state.
      await database.query(
        `UPDATE mfa_totp_factors
            SET failed_attempts = 0, locked_until = NULL
          WHERE user_id = $1`,
        [socialUser],
      );
      const bootstrapLogin = await request('/v1/auth/social', {
        method: 'POST', body: { idToken: 'social-good' },
      });
      assert.equal(bootstrapLogin.response.status, 202);
      const bootstrapChallenge = await request('/v1/auth/mfa/challenge', {
        method: 'POST',
        body: {
          mfaChallenge: bootstrapLogin.body.mfaChallenge,
          code: socialConfirm.body.recoveryCodes[0],
        },
      });
      assert.equal(bootstrapChallenge.response.status, 200);
      const raceLogin = await request('/v1/auth/social', {
        method: 'POST', body: { idToken: 'social-good' },
      });
      assert.equal(raceLogin.response.status, 202);
      const [raceChallenge, raceDisable] = await Promise.all([
        request('/v1/auth/mfa/challenge', {
          method: 'POST',
          body: {
            mfaChallenge: raceLogin.body.mfaChallenge,
            code: socialConfirm.body.recoveryCodes[2],
          },
        }),
        request('/v1/auth/mfa/disable', {
          method: 'POST',
          headers: { authorization: `Bearer ${bootstrapChallenge.body.accessToken}` },
          body: {
            reauthSocialIdToken: 'social-good',
            code: socialConfirm.body.recoveryCodes[3],
          },
        }),
      ]);
      assert.notEqual(raceChallenge.response.status, 500);
      assert.notEqual(raceDisable.response.status, 500);
      assert.equal(raceDisable.response.status, 200);
      assert.ok([200, 401].includes(raceChallenge.response.status));
      assertPrivateNoStore(raceDisable.response);
      const raceFactor = await database.query(
        'SELECT status, encrypted_secret FROM mfa_totp_factors WHERE user_id = $1',
        [socialUser],
      );
      assert.equal(raceFactor.rows[0].status, 'disabled');
      assert.equal(raceFactor.rows[0].encrypted_secret, null);

      const downSql = await fs.readFile(path.join(root, 'sql/migrations/080_mfa_totp.down.sql'), 'utf8');
      const upSql = await fs.readFile(path.join(root, 'sql/migrations/080_mfa_totp.up.sql'), 'utf8');
      await database.query(downSql);
      const removed = await database.query(
        `SELECT to_regclass('public.mfa_totp_factors') AS factors,
                to_regclass('public.auth_mfa_challenges') AS challenges`,
      );
      assert.equal(removed.rows[0].factors, null);
      assert.equal(removed.rows[0].challenges, null);
      await database.query(upSql);
      const restored = await database.query(
        `SELECT to_regclass('public.mfa_totp_factors') AS factors,
                to_regclass('public.auth_mfa_challenges') AS challenges`,
      );
      assert.equal(restored.rows[0].factors, 'mfa_totp_factors');
      assert.equal(restored.rows[0].challenges, 'auth_mfa_challenges');
    } finally {
      await new Promise((resolve) => server.close(resolve));
      await database.end();
    }
  });
}
