import assert from 'node:assert/strict';
import test from 'node:test';

import {
  decodeMfaEncryptionKey,
  decryptTotpSecret,
  encodeBase32,
  encryptTotpSecret,
  generateRecoveryCodes,
  hashRecoveryCode,
  totpCode,
  verifyRecoveryCode,
  verifyTotpCode,
} from '../src/mfa_totp.js';

test('RFC 6238 SHA-1 vectors remain compatible', () => {
  const secret = encodeBase32(Buffer.from('12345678901234567890'));
  assert.equal(totpCode(secret, Math.floor(59 / 30)), '94287082'.slice(-6));
  assert.equal(totpCode(secret, Math.floor(1111111109 / 30)), '07081804'.slice(-6));
  assert.equal(totpCode(secret, Math.floor(1234567890 / 30)), '89005924'.slice(-6));
});

test('TOTP verification enforces bounded window and one-time counter', () => {
  const secret = encodeBase32(Buffer.from('12345678901234567890'));
  const now = 1234567890000;
  const step = Math.floor(now / 1000 / 30);
  const code = totpCode(secret, step);
  assert.deepEqual(verifyTotpCode(secret, code, { now, window: 1 }), { valid: true, step });
  assert.deepEqual(verifyTotpCode(secret, code, { now, window: 1, lastUsedStep: step }), { valid: false, step: null });
  assert.equal(verifyTotpCode(secret, '123', { now }).valid, false);
});

test('secret encryption is authenticated and key decoding is strict', () => {
  const key = Buffer.alloc(32, 7);
  const payload = encryptTotpSecret('JBSWY3DPEHPK3PXP', key);
  assert.equal(decryptTotpSecret(payload, key), 'JBSWY3DPEHPK3PXP');
  assert.throws(() => decryptTotpSecret(payload, Buffer.alloc(32, 8)), /mfa_encrypted_secret_invalid/u);
  assert.equal(decodeMfaEncryptionKey(key)?.length, 32);
  assert.equal(decodeMfaEncryptionKey(key.toString('hex'))?.length, 32);
  assert.equal(decodeMfaEncryptionKey('not-a-key'), null);
});

test('recovery codes are hashed, normalized, and independently consumable', async () => {
  const [first, second] = generateRecoveryCodes(2);
  const firstHash = await hashRecoveryCode(first);
  assert.equal(await verifyRecoveryCode(first.replace('-', ''), firstHash), true);
  assert.equal(await verifyRecoveryCode(second, firstHash), false);
  assert.equal(await verifyRecoveryCode(first, firstHash.replace(/^scrypt\$/u, 'bad$')), false);
});
