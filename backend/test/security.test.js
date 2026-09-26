import assert from 'node:assert/strict';
import test from 'node:test';

process.env.DATABASE_URL ??= 'postgres://example:example@localhost:5432/example';
process.env.JWT_SECRET ??= 'test-secret-that-is-longer-than-thirty-two-characters';

const security = await import('../src/security.js');

test('passwords use salted scrypt hashes', async () => {
  const acceptedCandidate = ['fixture', 'accepted', Date.now()].join('-');
  const rejectedCandidate = ['fixture', 'rejected', Date.now()].join('-');
  const first = await security.hashPassword(acceptedCandidate);
  const second = await security.hashPassword(acceptedCandidate);
  assert.notEqual(first, second);
  assert.equal(await security.verifyPassword(acceptedCandidate, first), true);
  assert.equal(await security.verifyPassword(rejectedCandidate, first), false);
  assert.equal(first.includes(acceptedCandidate), false);
});

test('access tokens reject tampering', () => {
  const token = security.signAccessToken(
    { id: 'user-1', email: 'test@example.com' },
    { sessionId: '11111111-1111-4111-8111-111111111111' },
  );
  assert.equal(security.verifyAccessToken(token).sub, 'user-1');
  assert.equal(
    security.verifyAccessToken(token).sid,
    '11111111-1111-4111-8111-111111111111',
  );
  assert.throws(() => security.verifyAccessToken(`${token}x`));
});

test('new passwords require length, a letter, and a number', () => {
  assert.equal(security.passwordPolicyError('short1'), 'password_too_short');
  assert.equal(security.passwordPolicyError('abcdefghijk'), 'password_too_weak');
  assert.equal(security.passwordPolicyError('12345678901'), 'password_too_weak');
  assert.equal(security.passwordPolicyError('sicheresPasswort1'), null);
});

test('profile updates cannot elevate privileges', () => {
  const cleaned = security.sanitizeProfileUpdate({
    displayName: '  Walid  ',
    role: 'admin',
    isVerified: true,
    avgRating: 5,
    bio: 'Hallo',
  });
  assert.deepEqual(cleaned, { displayName: 'Walid', bio: 'Hallo' });
});

test('public profiles omit private contact and address fields', () => {
  const shaped = security.shapeUser({
    id: 'u1',
    email: 'private@example.com',
    profile: {
      displayName: 'Privat',
      phone: '+4912345',
      addressStreet: 'Teststraße',
      city: 'Berlin',
    },
    created_at: new Date('2026-01-01T00:00:00Z'),
    deactivated_at: null,
    role: 'user',
    account_status: 'active',
  }, { publicOnly: true });
  assert.equal(shaped.email, '');
  assert.equal(shaped.phone, undefined);
  assert.equal(shaped.addressStreet, undefined);
  assert.equal(shaped.city, 'Berlin');
});

test('database role and account state override legacy profile claims', () => {
  const shaped = security.shapeUser({
    id: 'u2',
    email: 'support@example.com',
    profile: { role: 'admin', isBanned: false },
    role: 'support',
    account_status: 'suspended',
    created_at: new Date('2026-01-01T00:00:00Z'),
    deactivated_at: null,
    email_verified_at: null,
  });
  assert.equal(shaped.role, 'support');
  assert.equal(shaped.accountStatus, 'suspended');
  assert.equal(shaped.isBanned, true);
});
