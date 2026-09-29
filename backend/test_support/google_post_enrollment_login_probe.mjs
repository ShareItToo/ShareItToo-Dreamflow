// Isolated child of the PG16 integration suite, using synthetic identity only.
import assert from 'node:assert/strict';
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
const app = createApp({
  verifySocialToken: async (token) => token === 'synthetic-existing' ? identity : {
    ...identity, subject: 'synthetic-not-enrolled-subject', firebaseUserId: 'synthetic-not-enrolled-firebase', email: 'synthetic-not-enrolled@example.invalid',
  },
});
const server = http.createServer(app);
try {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const request = (idToken) => fetch(`http://127.0.0.1:${server.address().port}/v1/auth/social`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idToken }),
  });
  const existing = await request('synthetic-existing');
  assert.equal(existing.status, 200);
  assert.equal((await existing.json()).user.id, userId);
  const unknown = await request('synthetic-unknown');
  assert.equal(unknown.status, 403);
  assert.equal((await unknown.json()).error, 'staging_registration_disabled');
  const after = await pool.query('SELECT (SELECT count(*) FROM users)::int AS users, (SELECT count(*) FROM auth_identities)::int AS identities');
  assert.deepEqual(after.rows, before.rows);
  process.stdout.write(`FINALIZER_PROBE=${JSON.stringify({ existing: 200, unknown: 403, newUsers: 0, newIdentities: 0 })}\n`);
} finally {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await pool.end();
}
