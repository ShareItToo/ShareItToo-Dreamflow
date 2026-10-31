import assert from 'node:assert/strict';
import test from 'node:test';

process.env.DATABASE_URL ??= 'postgres://example:example@localhost:5432/example';
process.env.JWT_SECRET ??= 'test-secret-that-is-longer-than-thirty-two-characters';
process.env.DEPLOYMENT_ENVIRONMENT = 'test';
process.env.SIT_STAGING_ACCESS_GATE_ENABLED = 'true';
process.env.SIT_STAGING_ALLOWED_USER_IDS = 'allowlisted-user';

const { requireAuth, signAccessToken } = await import('../src/security.js');

function requestFor(userId) {
  return {
    get(name) {
      if (name.toLowerCase() !== 'authorization') return undefined;
      return `Bearer ${signAccessToken({ id: userId, email: `${userId}@example.invalid` }, {
        sessionId: '11111111-1111-4111-8111-111111111111',
      })}`;
    },
  };
}

test('central token gate rejects non-allowlisted principals before protected route work', () => {
  let status;
  let body;
  let called = false;
  requireAuth(requestFor('foreign-user'), {
    status(value) { status = value; return this; },
    json(value) { body = value; return this; },
  }, () => { called = true; });
  assert.equal(called, false);
  assert.equal(status, 403);
  assert.deepEqual(body, { error: 'staging_account_not_allowlisted' });
});

test('central token gate passes only the exact configured principal', () => {
  const request = requestFor('allowlisted-user');
  let auth;
  let called = false;
  requireAuth(request, {
    status() { throw new Error('unexpected status'); },
    json() { throw new Error('unexpected json'); },
  }, () => { called = true; auth = request.auth; });
  assert.equal(called, true);
  assert.equal(auth.userId, 'allowlisted-user');
});
