import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import test from 'node:test';

process.env.FIREBASE_AUTH_ENABLED = 'false';
process.env.PUSH_TRANSPORT = 'disabled';
const { normalizeFirebaseSocialClaims, verifyFirebaseSocialToken, SocialAuthError } =
  await import('../src/firebase_social_auth.js');

const claims = (overrides = {}) => ({
  uid: 'synthetic-facebook-firebase-user', email: 'synthetic@example.invalid',
  email_verified: true,
  firebase: { sign_in_provider: 'facebook.com', identities: { 'facebook.com': ['synthetic-subject'] } },
  ...overrides,
});

test('verified Facebook binding, not a client provider label, is authoritative', () => {
  const normalized = normalizeFirebaseSocialClaims(claims({ provider: 'google' }));
  assert.equal(normalized.provider, 'facebook');
  assert.equal(normalized.subject, 'synthetic-subject');
  assert.equal(normalized.firebaseUserId, 'synthetic-facebook-firebase-user');
  assert.deepEqual(Object.keys(normalized).sort(), ['displayName', 'email', 'emailVerified', 'firebaseUserId', 'provider', 'subject']);
});

test('Facebook sign-in claims cannot borrow another provider identity', () => {
  for (const identities of [{}, { 'google.com': ['synthetic-subject'] },
    { 'facebook.com': [] }, { 'facebook.com': [''] }, { 'facebook.com': 'not-array' }]) {
    assert.throws(() => normalizeFirebaseSocialClaims(claims({
      firebase: { sign_in_provider: 'facebook.com', identities },
    })), (e) => e instanceof SocialAuthError && e.code === 'invalid_social_token');
  }
  assert.throws(() => normalizeFirebaseSocialClaims(claims({
    firebase: { sign_in_provider: 'facebook', identities: { 'facebook.com': ['synthetic-subject'] } },
  })), (e) => e.code === 'unsupported_social_provider');
  assert.throws(() => normalizeFirebaseSocialClaims(claims({ email: '' })),
    (e) => e.code === 'social_email_required');
  assert.equal(normalizeFirebaseSocialClaims(claims({ email_verified: false })).emailVerified, false);
});

test('Firebase verification checks revocation; Meta-shaped input never replaces verification', async () => {
  const idToken = 'synthetic-firebase-id-'.repeat(10);
  let called = 0;
  const verified = await verifyFirebaseSocialToken(idToken, { verifyIdToken: async (value, revoked) => {
    called++; assert.equal(value, idToken); assert.equal(revoked, true); return claims();
  } });
  assert.equal(called, 1);
  assert.equal(verified.provider, 'facebook');
  await assert.rejects(verifyFirebaseSocialToken('synthetic-meta-material-'.repeat(10), {
    verifyIdToken: async () => { throw new Error('synthetic SDK rejection'); },
  }), (e) => e.code === 'invalid_social_token');
  await assert.rejects(verifyFirebaseSocialToken(undefined, {
    verifyIdToken: async () => { throw new Error('must not be called'); },
  }), (e) => e.code === 'invalid_social_token');
});

test('HTTP social payload consumes only idToken for verification, not caller labels or Meta material', async () => {
  const { createApp } = await import('../src/app.js');
  const seen = [];
  const app = createApp({ verifySocialToken: async (value) => {
    seen.push(value);
    // Reject before any database or provider call; HTTP transport is real.
    throw new SocialAuthError(401, 'invalid_social_token');
  } });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    for (const payload of [
      { accessToken: 'synthetic-meta', clientToken: 'synthetic-client', provider: 'facebook' },
      { idToken: 'synthetic-firebase', accessToken: 'synthetic-meta', provider: 'google' },
    ]) {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/v1/auth/social`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
      });
      assert.equal(response.status, 401);
      const body = await response.json();
      assert.equal(body.error, 'invalid_social_token');
      assert.doesNotMatch(JSON.stringify(body), /synthetic-meta|synthetic-client|synthetic-firebase/);
    }
    assert.deepEqual(seen, [undefined, 'synthetic-firebase']);
  } finally {
    await new Promise((resolve, reject) => server.close((e) => e ? reject(e) : resolve()));
  }
});

test('Staging new-account exception remains Google-only, never popup-derived enrollment', () => {
  const source = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const start = source.indexOf("app.post('/v1/auth/social'");
  const route = source.slice(start, source.indexOf("app.post('/v1/auth/", start + 1));
  assert.match(route, /const googleRegistrationLaneEnabled = config.stagingGoogleRegistration.enabled\s*&& identity.provider === 'google'/);
  assert.match(route, /else if \(!stagingGoogleRegistration\) throw new HttpError\(403, 'staging_registration_disabled'\)/);
  assert.doesNotMatch(route, /req.body\?\.provider|req.body\?\.accessToken|req.body\?\.clientToken/);
});
