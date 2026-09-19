import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';

process.env.DATABASE_URL ??= 'postgres://localhost/fixture';
process.env.JWT_SECRET ??= crypto.randomBytes(48).toString('base64url');
process.env.PUSH_TRANSPORT = 'disabled';
process.env.FIREBASE_AUTH_ENABLED = 'false';
process.env.FIREBASE_PHONE_VERIFICATION_ENABLED = 'false';

const {
  deleteFirebasePhoneIdentity,
  normalizeFirebasePhoneClaims,
  PhoneVerificationError,
  verifyFirebasePhoneToken,
} = await import('../src/firebase_phone_verification.js');

function claims(overrides = {}) {
  return {
    uid: 'firebase-phone-user-123',
    phone_number: '+4915212345678',
    firebase: { sign_in_provider: 'phone' },
    ...overrides,
  };
}

test('normalizes only a Firebase phone-provider token with an E.164 number', () => {
  assert.deepEqual(normalizeFirebasePhoneClaims(claims()), {
    firebaseUserId: 'firebase-phone-user-123',
    phoneNumber: '+4915212345678',
  });
  for (const candidate of [
    claims({ phone_number: '015212345678' }),
    claims({ uid: '' }),
    claims({ firebase: { sign_in_provider: 'google.com' } }),
    null,
  ]) {
    assert.throws(() => normalizeFirebasePhoneClaims(candidate), PhoneVerificationError);
  }
});

test('verifies revocation and rejects short or malformed phone tokens', async () => {
  let revocationCheck;
  const verified = await verifyFirebasePhoneToken('x'.repeat(200), {
    verifyIdToken: async (_token, checkRevoked) => {
      revocationCheck = checkRevoked;
      return claims();
    },
  });
  assert.equal(revocationCheck, true);
  assert.equal(verified.phoneNumber, '+4915212345678');
  await assert.rejects(
    verifyFirebasePhoneToken('short', { verifyIdToken: async () => claims() }),
    (error) => error.code === 'invalid_phone_verification_token',
  );
  await assert.rejects(
    verifyFirebasePhoneToken('x'.repeat(200), {
      verifyIdToken: async () => claims({ firebase: { sign_in_provider: 'password' } }),
    }),
    (error) => error.code === 'invalid_phone_verification_provider',
  );
});

test('keeps real phone verification fail-closed while its separate gate is disabled', async () => {
  await assert.rejects(
    verifyFirebasePhoneToken('x'.repeat(200)),
    (error) => error.code === 'phone_verification_unavailable',
  );
});

test('deletes the temporary Firebase phone identity and fails closed on cleanup errors', async () => {
  let deletedUserId;
  const identity = {
    firebaseUserId: 'firebase-phone-user-123',
    phoneNumber: '+4915212345678',
  };
  await deleteFirebasePhoneIdentity(identity, {
    getUser: async (uid) => ({
      uid,
      phoneNumber: '+4915212345678',
      providerData: [{ providerId: 'phone' }],
    }),
    deleteUser: async (userId) => {
      deletedUserId = userId;
    },
  });
  assert.equal(deletedUserId, 'firebase-phone-user-123');
  await assert.rejects(
    deleteFirebasePhoneIdentity(identity, {
      getUser: async (uid) => ({
        uid,
        phoneNumber: '+4915212345678',
        providerData: [{ providerId: 'phone' }],
      }),
      deleteUser: async () => {
        throw new Error('provider unavailable');
      },
    }),
    (error) => error.code === 'phone_identity_cleanup_failed' && error.status === 502,
  );
});

test('never deletes a Firebase identity linked to a durable login provider', async () => {
  let deletionAttempted = false;
  await assert.rejects(
    deleteFirebasePhoneIdentity({
      firebaseUserId: 'linked-user',
      phoneNumber: '+4915212345678',
    }, {
      getUser: async () => ({
        uid: 'linked-user',
        phoneNumber: '+4915212345678',
        providerData: [{ providerId: 'phone' }, { providerId: 'google.com' }],
      }),
      deleteUser: async () => {
        deletionAttempted = true;
      },
    }),
    (error) => error.code === 'phone_identity_cleanup_unsafe' && error.status === 409,
  );
  assert.equal(deletionAttempted, false);
});
