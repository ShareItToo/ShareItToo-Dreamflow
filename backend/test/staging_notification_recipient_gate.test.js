import assert from 'node:assert/strict';
import test from 'node:test';

process.env.DATABASE_URL ??= 'postgres://example:example@localhost:5432/example';
process.env.JWT_SECRET ??= 'test-secret-that-is-longer-than-thirty-two-characters';
process.env.PUSH_TRANSPORT = 'disabled';
process.env.MAIL_TRANSPORT = 'disabled';

const { externalRecipientAllowedForTest } = await import('../src/notifications.js');

const gate = Object.freeze({
  enabled: true,
  userIds: ['owner-a'],
  emails: ['contact@shareittoo.com'],
  pushTokenHashes: ['a'.repeat(64)],
});

test('staging external recipient gate allows only the exact user and mailbox', () => {
  assert.equal(externalRecipientAllowedForTest(
    { channel: 'email', user_id: 'owner-a' },
    { email: 'contact@shareittoo.com' },
    gate,
  ), true);
  assert.equal(externalRecipientAllowedForTest(
    { channel: 'email', user_id: 'owner-a' },
    { email: 'foreign@example.invalid' },
    gate,
  ), false);
  assert.equal(externalRecipientAllowedForTest(
    { channel: 'email', user_id: 'foreign-user' },
    { email: 'contact@shareittoo.com' },
    gate,
  ), false);
});

test('in-app remains available while push requires an explicitly populated gate', () => {
  assert.equal(externalRecipientAllowedForTest(
    { channel: 'in_app', user_id: 'foreign-user' },
    null,
    gate,
  ), true);
  assert.equal(externalRecipientAllowedForTest(
    { channel: 'push', user_id: 'owner-a' },
    null,
    { ...gate, pushTokenHashes: [] },
  ), false);
});
