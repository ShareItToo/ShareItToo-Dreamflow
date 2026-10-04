import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import pg from 'pg';
import { prepareStagingPasswordInvitation, pruneExpiredStagingPasswordEnrollments } from '../src/staging_password_enrollment.js';
import { createEphemeralAcceptancePassword } from '../ops/ephemeral_acceptance_password.mjs';

const databaseUrl = process.env.TEST_DATABASE_URL?.trim();
if (!databaseUrl) {
  test('password enrollment requires isolated PostgreSQL16', { skip: true }, () => {});
} else {
  test('closed password enrollment HTTP/PG transaction, replay, lifecycle and privacy', async (t) => {
    const namespace = `password-enrollment-${crypto.randomUUID()}`;
    const fixtures = Array.from({ length: 5 }, (_, index) => {
      const userId = `${namespace}-${index}`;
      const email = `${userId}@example.invalid`;
      return { userId, email, ...prepareStagingPasswordInvitation({ userId, email }) };
    });
    const [main, rollback, collision, principalCollision, missingConsent] = fixtures;
    const credential = createEphemeralAcceptancePassword();
    const registryRoot = await fs.mkdtemp(join(await fs.realpath(tmpdir()), 'sit-password-pg-'));
    await fs.chmod(registryRoot, 0o700);
    t.after(() => fs.rm(registryRoot, { recursive: true, force: true }));
    const registryFile = join(registryRoot, 'registry.json');
    const records = fixtures.map(({ invitation }) => ({
      emailDigest: invitation.emailDigest,
      expiresAt: invitation.expiresAt,
      issuedAt: invitation.issuedAt,
      tokenDigest: invitation.tokenDigest,
      userId: invitation.userId,
    }));
    await fs.writeFile(registryFile, `${JSON.stringify(records)}\n`, { mode: 0o600 });
    await fs.chmod(registryFile, 0o600);
    delete process.env.SIT_STAGING_PASSWORD_ENROLLMENT_INVITATIONS;
    Object.assign(process.env, {
      DATABASE_URL: databaseUrl,
      JWT_SECRET: `password-enrollment-${crypto.randomBytes(40).toString('hex')}`,
      DEPLOYMENT_ENVIRONMENT: 'test',
      PAYMENT_TRANSPORT: 'memory', MAIL_TRANSPORT: 'memory', PUSH_TRANSPORT: 'memory',
      IDENTITY_VERIFICATION_TRANSPORT: 'memory', STRIPE_LIVEMODE: 'false',
      PRIVATE_PILOT_V4_ENABLED: 'true',
      SIT_STAGING_ACCESS_GATE_ENABLED: 'true',
      SIT_STAGING_ALLOWED_USER_IDS: fixtures.map((entry) => entry.userId).join(','),
      SIT_STAGING_PASSWORD_ENROLLMENT_ENABLED: 'true',
      SIT_STAGING_PASSWORD_ENROLLMENT_INVITATIONS_FILE: registryFile,
      SIT_STAGING_GOOGLE_REGISTRATION_ENABLED: 'false',
      SIT_STAGING_GOOGLE_REGISTRATION_ALLOWLIST: '',
    });
    const database = new pg.Pool({ connectionString: databaseUrl });
    assert.equal(Math.floor(Number((await database.query('SHOW server_version_num')).rows[0].server_version_num) / 10000), 16);
    await database.query(await fs.readFile(new URL('../sql/schema.sql', import.meta.url), 'utf8'));
    const { runMigrations } = await import('../src/migrations.js');
    await runMigrations(database);
    const { createApp, eraseAccount } = await import('../src/app.js');
    const { pool, inTransaction } = await import('../src/db.js');
    const { createActionToken } = await import('../src/account_actions.js');
    const { buildAccountExport } = await import('../src/privacy_export.js');
    const { hashPassword } = await import('../src/security.js');
    const { config } = await import('../src/config.js');
    const foreignId = `${namespace}-foreign`;
    const fixtureIds = [...fixtures.map((entry) => entry.userId), foreignId];
    assert.equal((await database.query('SELECT id FROM users WHERE id = ANY($1::text[])', [fixtureIds])).rowCount, 0);
    const body = (fixture, overrides = {}) => ({
      email: fixture.email, password: credential, enrollmentToken: fixture.token,
      displayName: 'Synthetic password enrollment', termsAccepted: true,
      privacyAccepted: true, minimumAgeConfirmed: true, privateUseConfirmed: true,
      registrationActionLabel: 'Kostenlos registrieren', ...overrides,
    });
    const withServer = async (run) => {
      const server = http.createServer(createApp());
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      const base = `http://127.0.0.1:${server.address().port}`;
      const request = async (route, data, headers = {}) => {
        const response = await fetch(`${base}${route}`, {
          method: data === undefined ? 'GET' : 'POST',
          headers: { 'content-type': 'application/json', ...headers },
          body: data === undefined ? undefined : JSON.stringify(data),
          signal: AbortSignal.timeout(10000),
        });
        return { status: response.status, headers: response.headers, body: await response.json().catch(() => null) };
      };
      try { await run(request); } finally { await new Promise((resolve) => server.close(resolve)); }
    };
    const deny = (response) => {
      assert.equal(response.status, 403);
      assert.equal(response.body.error, 'staging_password_enrollment_unavailable');
      for (const fixture of fixtures) {
        assert.equal(JSON.stringify(response.body).includes(fixture.token), false);
        assert.equal(JSON.stringify(response.body).includes(fixture.email), false);
      }
    };
    const tokens = fixtures.map((entry) => entry.invitation.tokenDigest);
    try {
      await t.test('missing/foreign credentials, email mismatch and principal switch deny; limiter remains enforced', async () => {
        await withServer(async (request) => {
          for (const override of [
            { enrollmentToken: undefined }, { enrollmentToken: crypto.randomBytes(32).toString('base64url') },
            { email: 'foreign@example.invalid' },
          ]) deny(await request('/v1/auth/register', body(main, override)));
          assert.equal((await request('/v1/auth/register', body(main), { authorization: 'Bearer synthetic-foreign-session' })).status, 401);
          deny(await request('/v1/auth/register', body(main, { enrollmentToken: 'invalid' })));
          deny(await request('/v1/auth/register', body(main, { enrollmentToken: 'still-invalid' })));
          assert.equal((await request('/v1/auth/register', body(main))).status, 429);
        });
        assert.equal((await database.query('SELECT id FROM users WHERE id = ANY($1::text[])', [fixtureIds])).rowCount, 0);
      });
      await t.test('all four existing consent facts and exact action remain required', async () => {
        await withServer(async (request) => {
          for (const key of ['termsAccepted', 'privacyAccepted', 'minimumAgeConfirmed', 'privateUseConfirmed']) {
            const result = await request('/v1/auth/register', body(missingConsent, { [key]: false }));
            assert.equal(result.status, 400);
            assert.equal(result.body.error, 'registration_consents_required');
          }
          assert.equal((await request('/v1/auth/register', body(missingConsent, { registrationActionLabel: 'different' }))).status, 400);
        });
        assert.equal((await database.query('SELECT 1 FROM staging_password_enrollment_redemptions WHERE token_digest=$1', [missingConsent.invitation.tokenDigest])).rowCount, 0);
      });
      await t.test('concurrent same invitation commits one principal/session and denies replay without repeated mail', async () => {
        await withServer(async (request) => {
          const results = await Promise.all([
            request('/v1/auth/register', body(main)), request('/v1/auth/register', body(main)),
          ]);
          assert.deepEqual(results.map((entry) => entry.status).sort(), [202, 403]);
          const success = results.find((entry) => entry.status === 202);
          deny(results.find((entry) => entry.status === 403));
          assert.equal(success.headers.get('cache-control'), 'private, no-store');
          assert.equal(success.body.session.user.id, main.userId);
          assert.equal(success.body.session.user.emailVerified, false);
          const auth = { authorization: `Bearer ${success.body.session.accessToken}` };
          assert.equal((await request('/v1/auth/me', undefined, auth)).status, 200);
          deny(await request('/v1/auth/register', body(rollback), auth));
          const actionCount = (await database.query('SELECT count(*)::int n FROM auth_action_tokens WHERE user_id=$1', [main.userId])).rows[0].n;
          deny(await request('/v1/auth/register', body(main, { displayName: 'Changed replay' })));
          assert.equal((await database.query('SELECT count(*)::int n FROM auth_action_tokens WHERE user_id=$1', [main.userId])).rows[0].n, actionCount);
          assert.equal((await database.query('SELECT count(*)::int n FROM auth_sessions WHERE user_id=$1', [main.userId])).rows[0].n, 1);
          assert.equal((await database.query('SELECT count(*)::int n FROM audit_log WHERE actor_id=$1 AND action=$2', [main.userId, 'account.registered'])).rows[0].n, 1);
        });
      });
      await t.test('fresh app reads committed eligibility: verify/login/refresh/reset/logout use existing owner checks', async () => {
        await withServer(async (request) => {
          const verification = await inTransaction((client) => createActionToken(client, { userId: main.userId, kind: 'verify_email' }));
          assert.equal((await request('/v1/auth/email-verification/confirm', { token: verification })).status, 200);
          assert.equal((await request('/v1/auth/email-verification/confirm', { token: verification })).status, 400);
          const login = await request('/v1/auth/login', { email: main.email, password: credential });
          assert.equal(login.status, 200);
          const refresh = await request('/v1/auth/refresh', { refreshToken: login.body.refreshToken });
          assert.equal(refresh.status, 200);
          const reset = await inTransaction((client) => createActionToken(client, { userId: main.userId, kind: 'reset_password' }));
          const replacement = createEphemeralAcceptancePassword();
          assert.equal((await request('/v1/auth/password-reset/confirm', { token: reset, password: replacement })).status, 200);
          assert.equal((await request('/v1/auth/me', undefined, { authorization: `Bearer ${refresh.body.accessToken}` })).status, 401);
          assert.equal((await request('/v1/auth/refresh', { refreshToken: refresh.body.refreshToken })).status, 401);
          assert.equal((await request('/v1/auth/login', { email: main.email, password: credential })).status, 401);
          const next = await request('/v1/auth/login', { email: main.email, password: replacement });
          assert.equal(next.status, 200);
          assert.equal((await request('/v1/auth/logout', { refreshToken: next.body.refreshToken })).status, 204);
          assert.equal((await request('/v1/auth/me', undefined, { authorization: `Bearer ${next.body.accessToken}` })).status, 401);
        });
      });
      await t.test('existing email or principal conflict cannot link, overwrite or consume an invitation', async () => {
        const passwordHash = await hashPassword(credential);
        await database.query('INSERT INTO users (id,email,password_hash) VALUES ($1,$2,$3),($4,$5,$3)',
          [foreignId, collision.email, passwordHash, principalCollision.userId, `${namespace}-different@example.invalid`]);
        await withServer(async (request) => {
          deny(await request('/v1/auth/register', body(collision)));
          deny(await request('/v1/auth/register', body(principalCollision)));
        });
        assert.equal((await database.query('SELECT 1 FROM staging_password_enrollment_redemptions WHERE token_digest=ANY($1::text[])', [[collision.invitation.tokenDigest, principalCollision.invitation.tokenDigest]])).rowCount, 0);
        assert.equal((await database.query('SELECT password_hash FROM users WHERE id=$1', [foreignId])).rows[0].password_hash, passwordHash);
      });
      await t.test('failed session insert rolls back account, consent, audit and spent invitation together', async () => {
        // This test owns the isolated database and runs HTTP requests serially.
        const triggerName = `enrollment_${crypto.randomBytes(6).toString('hex')}`;
        await database.query(`CREATE FUNCTION ${triggerName}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic_enrollment_session_failure'; END $$`);
        await database.query(`CREATE TRIGGER ${triggerName} BEFORE INSERT ON auth_sessions FOR EACH ROW EXECUTE FUNCTION ${triggerName}()`);
        try {
          await withServer(async (request) => assert.equal((await request('/v1/auth/register', body(rollback))).status, 500));
        } finally {
          await database.query(`DROP TRIGGER ${triggerName} ON auth_sessions`);
          await database.query(`DROP FUNCTION ${triggerName}()`);
        }
        assert.equal((await database.query('SELECT 1 FROM users WHERE id=$1', [rollback.userId])).rowCount, 0);
        assert.equal((await database.query('SELECT 1 FROM staging_password_enrollment_redemptions WHERE token_digest=$1', [rollback.invitation.tokenDigest])).rowCount, 0);
        assert.equal((await database.query('SELECT 1 FROM audit_log WHERE actor_id=$1', [rollback.userId])).rowCount, 0);
        await withServer(async (request) => assert.equal((await request('/v1/auth/register', body(rollback))).status, 202));
      });
      await t.test('nonempty export excludes enrollment credentials; erasure and hard delete cannot resurrect spent invites', async () => {
        for (const purpose of ['access_copy', 'data_portability']) {
          const exported = await buildAccountExport(database, main.userId, { purpose });
          const text = JSON.stringify(exported);
          assert.ok(text.length > 100);
          for (const secret of [main.token, main.invitation.tokenDigest, main.invitation.emailDigest, credential]) assert.equal(text.includes(secret), false);
        }
        const user = (await database.query('SELECT * FROM users WHERE id=$1', [main.userId])).rows[0];
        const erased = await inTransaction((client) => eraseAccount(client, user));
        assert.equal((await database.query('SELECT password_hash FROM users WHERE id=$1', [main.userId])).rows[0].password_hash, null);
        assert.equal((await database.query('SELECT 1 FROM auth_sessions WHERE user_id=$1', [main.userId])).rowCount, 0);
        assert.equal((await database.query('SELECT 1 FROM staging_password_enrollment_redemptions WHERE token_digest=$1', [main.invitation.tokenDigest])).rowCount, 1);
        assert.equal(JSON.stringify(erased).includes(main.token), false);
        // Existing legal declarations intentionally retain enrolled principals.
        // A bare storage fixture independently proves no new FK blocks deletion.
        await database.query('INSERT INTO users (id,email) VALUES ($1,$2)', [missingConsent.userId, missingConsent.email]);
        await database.query('INSERT INTO staging_password_enrollment_redemptions (token_digest,expires_at) VALUES ($1,$2)',
          [missingConsent.invitation.tokenDigest, missingConsent.invitation.expiresAt]);
        await database.query('DELETE FROM users WHERE id=$1', [missingConsent.userId]);
        await withServer(async (request) => {
          deny(await request('/v1/auth/register', body(main)));
          deny(await request('/v1/auth/register', body(rollback)));
          deny(await request('/v1/auth/register', body(missingConsent)));
        });
      });
      await t.test('active replay state blocks rollback; expired digests purge with no user data', async () => {
        const columns = (await database.query("SELECT column_name FROM information_schema.columns WHERE table_name='staging_password_enrollment_redemptions' ORDER BY ordinal_position")).rows.map((row) => row.column_name);
        assert.deepEqual(columns, ['token_digest', 'expires_at', 'created_at']);
        await assert.rejects(database.query(await fs.readFile(new URL('../sql/migrations/105_staging_password_enrollment_redemptions.down.sql', import.meta.url), 'utf8')), /staging_password_enrollment_active_redemptions/u);
        await pruneExpiredStagingPasswordEnrollments(database);
        assert.equal((await database.query('SELECT 1 FROM staging_password_enrollment_redemptions WHERE token_digest=$1', [main.invitation.tokenDigest])).rowCount, 1);
        await database.query("UPDATE staging_password_enrollment_redemptions SET created_at=now()-interval '2 days', expires_at=now()-interval '1 day' WHERE token_digest=ANY($1::text[])", [tokens]);
        await pruneExpiredStagingPasswordEnrollments(database);
        assert.equal((await database.query('SELECT 1 FROM staging_password_enrollment_redemptions WHERE token_digest=ANY($1::text[])', [tokens])).rowCount, 0);
        assert.equal(config.mail.transport, 'memory');
        assert.equal(config.stagingAccess.enabled, true);
      });
    } finally {
      await pool.end();
      await database.end();
    }
  });
}
