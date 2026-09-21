import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';

process.env.DATABASE_URL ??= 'postgres://localhost/fixture';
process.env.JWT_SECRET ??= crypto.randomBytes(48).toString('base64url');
process.env.PUSH_TRANSPORT = 'disabled';
process.env.FIREBASE_AUTH_ENABLED = 'false';

const {
  normalizeFirebaseSocialClaims,
  SocialAuthError,
  verifyFirebaseSocialToken,
} = await import('../src/firebase_social_auth.js');

function claims(overrides = {}) {
  return {
    uid: 'firebase-user-123',
    email: 'Member@Example.com',
    email_verified: true,
    name: 'SIT Mitglied',
    firebase: {
      sign_in_provider: 'google.com',
      identities: { 'google.com': ['google-native-subject'] },
    },
    ...overrides,
  };
}

test('normalizes verified Google, Apple, and Facebook identities', () => {
  for (const [providerId, provider] of [
    ['google.com', 'google'],
    ['apple.com', 'apple'],
    ['facebook.com', 'facebook'],
  ]) {
    assert.deepEqual(normalizeFirebaseSocialClaims(claims({
      firebase: {
        sign_in_provider: providerId,
        identities: { [providerId]: [`${provider}-native-subject`] },
      },
    })), {
      provider,
      subject: `${provider}-native-subject`,
      firebaseUserId: 'firebase-user-123',
      email: 'member@example.com',
      emailVerified: true,
      displayName: 'SIT Mitglied',
    });
  }
});

test('marks an unverified provider email for SIT verification without trusting it', () => {
  const identity = normalizeFirebaseSocialClaims(claims({
    email_verified: false,
    firebase: {
      sign_in_provider: 'facebook.com',
      identities: { 'facebook.com': ['facebook-native-subject'] },
    },
  }));
  assert.equal(identity.provider, 'facebook');
  assert.equal(identity.emailVerified, false);
});

test('refuses password, anonymous, missing-email, and malformed claims', () => {
  for (const candidate of [
    claims({ firebase: { sign_in_provider: 'password' } }),
    claims({ email: '' }),
    claims({ uid: '' }),
    claims({ firebase: { sign_in_provider: 'google.com', identities: {} } }),
    null,
  ]) {
    assert.throws(() => normalizeFirebaseSocialClaims(candidate), SocialAuthError);
  }
});

test('token verification checks revocation and never accepts a short token', async () => {
  let revocationCheck;
  const identity = await verifyFirebaseSocialToken('x'.repeat(200), {
    verifyIdToken: async (_token, checkRevoked) => {
      revocationCheck = checkRevoked;
      return claims();
    },
  });
  assert.equal(revocationCheck, true);
  assert.equal(identity.provider, 'google');
  await assert.rejects(
    verifyFirebaseSocialToken('short', { verifyIdToken: async () => claims() }),
    (error) => error.code === 'invalid_social_token',
  );
});

test('staging registration token verification returns only bounded fresh-token metadata', async () => {
  const fixedNow = 1_800_000_000_000;
  const identity = await verifyFirebaseSocialToken('x'.repeat(200), {
    verifyIdToken: async () => claims({
      iat: Math.floor(fixedNow / 1000) - 30,
      exp: Math.floor(fixedNow / 1000) + 600,
      auth_time: Math.floor(fixedNow / 1000) - 30,
    }),
    requireFreshToken: true,
    now: fixedNow,
  });
  assert.equal(identity.tokenIssuedAt, Math.floor(fixedNow / 1000) - 30);
  assert.equal(identity.tokenExpiresAt, Math.floor(fixedNow / 1000) + 600);
  assert.equal(identity.tokenAuthTime, Math.floor(fixedNow / 1000) - 30);
  assert.match(identity.tokenDigest, /^[0-9a-f]{64}$/u);
  assert.equal(Object.hasOwn(identity, '__rawToken'), false);
  await assert.rejects(
    verifyFirebaseSocialToken('x'.repeat(200), {
      verifyIdToken: async () => claims({
        iat: Math.floor(fixedNow / 1000) - 30,
        exp: Math.floor(fixedNow / 1000) - 1,
        auth_time: Math.floor(fixedNow / 1000) - 30,
      }),
      requireFreshToken: true,
      now: fixedNow,
    }),
    (error) => error.code === 'invalid_social_token',
  );
});
