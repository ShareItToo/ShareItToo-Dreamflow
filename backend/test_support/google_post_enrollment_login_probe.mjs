// Isolated child of the PG16 integration suite, using synthetic identity only.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import { createApp } from '../src/app.js';
import { config } from '../src/config.js';
import { pool } from '../src/db.js';

const { identity, userId } = JSON.parse(process.env.SIT_TEST_POST_ENROLLMENT_IDENTITY);
assert.equal(config.socialAuth.enabled, true);
assert.equal(config.stagingGoogleRegistration.enabled, false);
assert.equal(config.stagingGoogleRegistration.allowlist.length, 0);
assert.ok(config.stagingAccess.allowedUserIds.includes(userId));
const before = await pool.query('SELECT (SELECT count(*) FROM users)::int AS users, (SELECT count(*) FROM auth_identities)::int AS identities');
const disallowedUserId = `closed-google-disallowed-${crypto.randomUUID()}`;
const disallowedIdentity = {
  ...identity,
  subject: `closed-google-subject-${crypto.randomUUID()}`,
  firebaseUserId: `closed-google-firebase-${crypto.randomUUID()}`,
};
let preTransactionAction;
const app = createApp({
  socialAuthPreTransactionHook: async () => {
    const action = preTransactionAction;
    preTransactionAction = null;
    if (action) await action();
  },
  verifySocialToken: async (token) => token === 'synthetic-disallowed' ? disallowedIdentity : token === 'synthetic-existing' ? identity : {
    ...identity, subject: 'synthetic-not-enrolled-subject', firebaseUserId: 'synthetic-not-enrolled-firebase', email: 'synthetic-not-enrolled@example.invalid',
  },
});
const server = http.createServer(app);
try {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const request = (idToken) => fetch(`http://127.0.0.1:${server.address().port}/v1/auth/social`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
      idToken, termsAccepted: true, privacyAccepted: true,
      minimumAgeConfirmed: true, privateUseConfirmed: true,
      registrationActionLabel: 'Mit Google registrieren',
    }),
  });
  const existing = await request('synthetic-existing');
  assert.equal(existing.status, 200);
  assert.equal((await existing.json()).user.id, userId);
  const unknown = await request('synthetic-unknown');
  assert.equal(unknown.status, 403);
  assert.equal((await unknown.json()).error, 'staging_registration_disabled');
  const after = await pool.query('SELECT (SELECT count(*) FROM users)::int AS users, (SELECT count(*) FROM auth_identities)::int AS identities');
  assert.deepEqual(after.rows, before.rows);
  assert.ok(!config.stagingAccess.allowedUserIds.includes(disallowedUserId));
  await pool.query(
    "INSERT INTO users (id, email, profile) VALUES ($1, $2, '{\"displayName\":\"Synthetic blocked principal\"}'::jsonb)",
    [disallowedUserId, `${disallowedUserId}@example.invalid`],
  );
  await pool.query(
    `INSERT INTO auth_identities (user_id, provider, provider_subject,
       firebase_user_id, email_at_link, email_verified)
     VALUES ($1, 'google', $2, $3, $4, false)`,
    [disallowedUserId, disallowedIdentity.subject, disallowedIdentity.firebaseUserId, identity.email],
  );
  // Full rows catch updates as well as inserts (including consumed MFA challenges,
  // profile/consent changes and identity ownership changes with equal counts).
  const protectedState = async () => {
    const state = {};
    for (const table of ['users', 'auth_identities', 'auth_sessions',
      'auth_mfa_challenges', 'mfa_totp_factors', 'audit_log']) {
      state[table] = (await pool.query(`SELECT to_jsonb(row) AS value FROM ${table} AS row ORDER BY to_jsonb(row)::text`)).rows;
    }
    return state;
  };
  let deniedPrincipalCases = 0;
  for (const mfaEnabled of [false, true]) {
    if (mfaEnabled) {
      await pool.query(
        `INSERT INTO mfa_totp_factors (user_id, encrypted_secret, status, enabled_at)
         VALUES ($1, 'synthetic-unused-encrypted-factor', 'enabled', now())`,
        [disallowedUserId],
      );
      await pool.query(
        `INSERT INTO auth_mfa_challenges (user_id, challenge_hash, purpose, expires_at)
         VALUES ($1, $2, 'login', now() + interval '5 minutes')`,
        [disallowedUserId, crypto.randomBytes(32).toString('hex')],
      );
    }
    for (const reassigned of [false, true]) {
      let stateBefore;
      if (reassigned) {
        // The token email and subject both resolve to A before preflight. A
        // separate committed PG write reassigns the subject to B before locking.
        // Temporarily remove B's other Google identity to respect uniqueness.
        await pool.query('DELETE FROM auth_identities WHERE provider = $1 AND provider_subject = $2', ['google', disallowedIdentity.subject]);
        preTransactionAction = async () => {
          const moved = await pool.query(
            'UPDATE auth_identities SET user_id = $1 WHERE provider = $2 AND provider_subject = $3 AND user_id = $4 RETURNING user_id',
            [disallowedUserId, 'google', identity.subject, userId],
          );
          assert.deepEqual(moved.rows, [{ user_id: disallowedUserId }]);
          stateBefore = await protectedState();
        };
      } else {
        stateBefore = await protectedState();
      }
      try {
        const denied = await request(reassigned ? 'synthetic-existing' : 'synthetic-disallowed');
        assert.equal(denied.status, 403, `mfa=${mfaEnabled}, reassigned=${reassigned}`);
        const deniedBody = await denied.json();
        assert.equal(deniedBody.error, 'staging_account_not_allowlisted');
        assert.deepEqual(Object.keys(deniedBody).sort(), ['error', 'requestId']);
        assert.ok(stateBefore);
        assert.deepEqual(await protectedState(), stateBefore);
        deniedPrincipalCases += 1;
      } finally {
        if (reassigned) {
          await pool.query('UPDATE auth_identities SET user_id = $1 WHERE provider = $2 AND provider_subject = $3', [userId, 'google', identity.subject]);
          await pool.query(
            `INSERT INTO auth_identities (user_id, provider, provider_subject, firebase_user_id, email_at_link, email_verified)
             VALUES ($1, 'google', $2, $3, $4, false)`,
            [disallowedUserId, disallowedIdentity.subject, disallowedIdentity.firebaseUserId, identity.email],
          );
        }
      }
    }
  }
  const recovered = await request('synthetic-existing');
  assert.equal(recovered.status, 200);
  assert.equal((await recovered.json()).user.id, userId);
  process.stdout.write(`FINALIZER_PROBE=${JSON.stringify({ existing: 200, unknown: 403, newUsers: 0, newIdentities: 0, deniedPrincipalCases })}\n`);
} finally {
  await pool.query('DELETE FROM users WHERE id = $1', [disallowedUserId]);
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await pool.end();
}
