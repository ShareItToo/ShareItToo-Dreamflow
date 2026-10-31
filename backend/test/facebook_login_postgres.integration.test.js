import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import test from 'node:test';
import pg from 'pg';

const databaseUrl = process.env.TEST_DATABASE_URL?.trim();
if (!databaseUrl) {
  test.skip('Facebook login HTTP/PG requires TEST_DATABASE_URL');
} else {
  test('Facebook login binds the locked identity, never email, enrollment or premature MFA sessions', async () => {
    const prefix = `fb-w2-${crypto.randomUUID()}`;
    const ids = ['owner', 'collision', 'unlisted', 'missing-consent'].map((x) => `${prefix}-${x}`);
    Object.assign(process.env, {
      DATABASE_URL: databaseUrl, DEPLOYMENT_ENVIRONMENT: 'test',
      PAYMENT_TRANSPORT: 'memory', MAIL_TRANSPORT: 'memory', PUSH_TRANSPORT: 'disabled',
      FIREBASE_AUTH_ENABLED: 'false', SIT_STAGING_GOOGLE_REGISTRATION_ENABLED: 'false',
      SIT_STAGING_ACCESS_GATE_ENABLED: 'true', SIT_STAGING_ALLOWED_USER_IDS: [ids[0], ids[1], ids[3]].join(','),
      MFA_ENCRYPTION_KEY: crypto.randomBytes(32).toString('base64url'),
    });
    const database = new pg.Pool({ connectionString: databaseUrl });
    const { runMigrations } = await import('../src/migrations.js');
    let server;
    let appPool;
    try {
      await database.query(await fs.readFile(new URL('../sql/schema.sql', import.meta.url), 'utf8'));
      await runMigrations(database);
      for (const id of ids) {
        await database.query(`INSERT INTO users (id,email,profile,email_verified_at,
          terms_accepted_at,privacy_accepted_at,minimum_age_confirmed_at,private_use_confirmed_at)
          VALUES ($1,$2,'{"emailVerified":true}',now(),now(),now(),now(),now())`, [id, `${id}@example.invalid`]);
      }
      const subject = `${prefix}-subject`;
      const uid = `${prefix}-uid`;
      for (const id of [ids[0], ids[2], ids[3]]) {
        await database.query(`INSERT INTO auth_identities
          (user_id,provider,provider_subject,firebase_user_id,email_at_link,email_verified)
          VALUES ($1,'facebook',$2,$3,$4,true)`, [id, id === ids[0] ? subject : id, id === ids[0] ? uid : id, `${id}@example.invalid`]);
      }
      await database.query('UPDATE users SET terms_accepted_at=NULL WHERE id=$1', [ids[3]]);
      const identities = new Map();
      const good = { provider: 'facebook', subject, firebaseUserId: uid,
        email: `${ids[0]}@example.invalid`, emailVerified: true, displayName: 'Synthetic pilot' };
      identities.set('exact', good);
      identities.set('foreign-uid', { ...good, firebaseUserId: `${uid}-foreign` });
      identities.set('changed-email', { ...good, email: `${prefix}-changed@example.invalid` });
      identities.set('collision-email', { ...good, email: `${ids[1]}@example.invalid` });
      identities.set('unlisted', { ...good, subject: ids[2], firebaseUserId: ids[2] });
      identities.set('missing-consent', { ...good, subject: ids[3], firebaseUserId: ids[3] });
      for (const verified of [true, false]) {
        identities.set(`unlinked-${verified}`, { ...good, subject: `${subject}-unknown`, email: `${ids[1]}@example.invalid`, emailVerified: verified });
        identities.set(`new-${verified}`, { ...good, subject: `${subject}-new`, email: `${prefix}-new@example.invalid`, emailVerified: verified });
      }
      const { createApp } = await import('../src/app.js');
      appPool = (await import('../src/db.js')).pool;
      let hook = null;
      server = http.createServer(createApp({
        verifySocialToken: async (token) => identities.get(token),
        socialAuthPreTransactionHook: async () => { if (hook) await hook(); },
      }));
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      const request = async (token, extra = {}) => {
        const response = await fetch(`http://127.0.0.1:${server.address().port}/v1/auth/social`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ idToken: token, ...extra }),
        });
        return { status: response.status, body: await response.json() };
      };
      const snapshot = async () => {
        const result = {};
        for (const [table, owner] of [['users','id'], ['auth_identities','user_id'],
          ['auth_sessions','user_id'], ['refresh_tokens','user_id'], ['legal_declarations','user_id'],
          ['auth_mfa_challenges','user_id']]) {
          result[table] = (await database.query(`SELECT to_jsonb(t) AS row FROM ${table} t WHERE ${owner}=ANY($1::text[]) ORDER BY to_jsonb(t)::text`, [ids])).rows;
        }
        result.userCount = (await database.query('SELECT count(*)::int AS n FROM users')).rows;
        return result;
      };
      const deniedUnchanged = async (token, code, extra = {}) => {
        const before = await snapshot();
        const result = await request(token, extra);
        assert.equal(result.body.error, code, `${token}: ${JSON.stringify(result)}`);
        assert.ok(result.status >= 400);
        assert.deepEqual(await snapshot(), before, `${token}: denied operation changed state`);
      };
      for (const verified of [true, false]) {
        await deniedUnchanged(`unlinked-${verified}`, 'facebook_login_only');
        await deniedUnchanged(`new-${verified}`, 'facebook_login_only', {
          termsAccepted: true, privacyAccepted: true, minimumAgeConfirmed: true, privateUseConfirmed: true });
      }
      await deniedUnchanged('foreign-uid', 'social_identity_conflict');
      await deniedUnchanged('unlisted', 'staging_account_not_allowlisted');
      await deniedUnchanged('missing-consent', 'facebook_login_only', {
        termsAccepted: true, privacyAccepted: true, minimumAgeConfirmed: true, privateUseConfirmed: true });
      await deniedUnchanged('exact', 'facebook_login_only', { registrationActionLabel: 'Mit Facebook registrieren' });
      await database.query('UPDATE users SET deactivated_at=now() WHERE id=$1', [ids[0]]);
      await deniedUnchanged('exact', 'account_not_active');
      await database.query('UPDATE users SET deactivated_at=NULL WHERE id=$1', [ids[0]]);
      for (const token of ['exact', 'changed-email', 'collision-email']) {
        const result = await request(token);
        assert.equal(result.status, 200, JSON.stringify(result));
        assert.equal(result.body.user.id, ids[0]);
        assert.equal((await database.query('SELECT email FROM users WHERE id=$1', [ids[0]])).rows[0].email, good.email);
      }
      // Count-preserving reassignment between preflight and row lock cannot
      // authorize the replacement SIT principal even when it is allowlisted.
      hook = async () => database.query('UPDATE auth_identities SET user_id=$1 WHERE provider=\'facebook\' AND provider_subject=$2', [ids[1], subject]);
      const race = await request('exact');
      assert.equal(race.body.error, 'social_identity_changed');
      hook = null;
      await database.query("UPDATE auth_identities SET user_id=$1 WHERE provider='facebook' AND provider_subject=$2", [ids[0], subject]);
      const { encryptTotpSecret, generateTotpSecret } = await import('../src/mfa_totp.js');
      await database.query(`INSERT INTO mfa_totp_factors (user_id,encrypted_secret,status,enabled_at)
        VALUES ($1,$2,'enabled',now())`, [ids[0], encryptTotpSecret(generateTotpSecret(), Buffer.from(process.env.MFA_ENCRYPTION_KEY, 'base64url'))]);
      const sessionsBefore = (await snapshot()).auth_sessions;
      const refreshBefore = (await snapshot()).refresh_tokens;
      const mfa = await request('exact');
      assert.equal(mfa.status, 202);
      assert.equal(mfa.body.mfaRequired, true);
      assert.equal(mfa.body.session, undefined);
      assert.equal(mfa.body.accessToken, undefined);
      assert.deepEqual((await snapshot()).auth_sessions, sessionsBefore);
      assert.deepEqual((await snapshot()).refresh_tokens, refreshBefore);
    } finally {
      if (server) await new Promise((resolve) => server.close(resolve));
      if (appPool) await appPool.end();
      await database.end();
    }
  });
}
