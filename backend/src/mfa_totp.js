import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);
const TOTP_STEP_SECONDS = 30;
const TOTP_DIGITS = 6;
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base64url(buffer) {
  return Buffer.from(buffer).toString('base64url');
}

function fromBase64url(value) {
  return Buffer.from(value, 'base64url');
}

export function decodeMfaEncryptionKey(value) {
  if (Buffer.isBuffer(value)) return value.length === 32 ? Buffer.from(value) : null;
  if (typeof value !== 'string' || !value.trim()) return null;
  const raw = value.trim();
  const candidates = [
    /^[a-f0-9]{64}$/iu.test(raw) ? Buffer.from(raw, 'hex') : null,
    Buffer.from(raw, 'base64url'),
    Buffer.from(raw, 'base64'),
  ].filter(Boolean);
  return candidates.find((candidate) => candidate.length === 32) ?? null;
}

export function generateTotpSecret() {
  return encodeBase32(crypto.randomBytes(20));
}

export function encodeBase32(bytes) {
  const input = Buffer.from(bytes);
  let buffer = 0;
  let bits = 0;
  let result = '';
  for (const byte of input) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      result += BASE32_ALPHABET[(buffer >>> bits) & 31];
    }
  }
  if (bits > 0) result += BASE32_ALPHABET[(buffer << (5 - bits)) & 31];
  return result;
}

export function decodeBase32(value) {
  if (typeof value !== 'string' || !/^[A-Z2-7]+$/iu.test(value)) {
    throw new Error('mfa_totp_secret_invalid');
  }
  let buffer = 0;
  let bits = 0;
  const output = [];
  for (const char of value.toUpperCase()) {
    buffer = (buffer << 5) | BASE32_ALPHABET.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      output.push((buffer >>> bits) & 0xff);
    }
  }
  return Buffer.from(output);
}

export function buildTotpUri({ secret, account, issuer = 'ShareItToo' }) {
  if (!secret || !account) throw new Error('mfa_totp_uri_invalid');
  const label = `${issuer}:${account}`;
  return `otpauth://totp/${encodeURIComponent(label)}?secret=${encodeURIComponent(secret)}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_STEP_SECONDS}`;
}

export function encryptTotpSecret(secret, key) {
  if (!secret || !Buffer.isBuffer(key) || key.length !== 32) {
    throw new Error('mfa_encryption_unavailable');
  }
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(secret, 'utf8')),
    cipher.final(),
  ]);
  return `v1.${base64url(nonce)}.${base64url(cipher.getAuthTag())}.${base64url(ciphertext)}`;
}

export function decryptTotpSecret(payload, key) {
  if (typeof payload !== 'string' || !Buffer.isBuffer(key) || key.length !== 32) {
    throw new Error('mfa_encryption_unavailable');
  }
  const [version, nonceValue, tagValue, ciphertextValue] = payload.split('.');
  if (version !== 'v1' || !nonceValue || !tagValue || !ciphertextValue) {
    throw new Error('mfa_encrypted_secret_invalid');
  }
  try {
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      key,
      fromBase64url(nonceValue),
    );
    decipher.setAuthTag(fromBase64url(tagValue));
    return Buffer.concat([
      decipher.update(fromBase64url(ciphertextValue)),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw new Error('mfa_encrypted_secret_invalid');
  }
}

function hotp(secretBytes, counter) {
  const input = Buffer.alloc(8);
  input.writeBigUInt64BE(BigInt(counter));
  const digest = crypto.createHmac('sha1', secretBytes).update(input).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const value = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(value).padStart(TOTP_DIGITS, '0');
}

export function totpCode(secret, counter) {
  if (!Number.isSafeInteger(counter) || counter < 0) {
    throw new Error('mfa_totp_counter_invalid');
  }
  return hotp(decodeBase32(secret), counter);
}

export function verifyTotpCode(secret, code, {
  now = Date.now(),
  window = 1,
  lastUsedStep = null,
} = {}) {
  if (!/^\d{6}$/.test(code ?? '') || !Number.isInteger(window) || window < 0 || window > 2) {
    return { valid: false, step: null };
  }
  const currentStep = Math.floor(now / 1000 / TOTP_STEP_SECONDS);
  for (let delta = -window; delta <= window; delta += 1) {
    const step = currentStep + delta;
    if (step < 0 || (Number.isSafeInteger(lastUsedStep) && step <= lastUsedStep)) continue;
    const expected = totpCode(secret, step);
    const matches = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(code));
    if (matches) return { valid: true, step };
  }
  return { valid: false, step: null };
}

export function generateRecoveryCodes(count = 10) {
  if (!Number.isInteger(count) || count < 1 || count > 20) {
    throw new Error('mfa_recovery_count_invalid');
  }
  return Array.from({ length: count }, () =>
    encodeBase32(crypto.randomBytes(8)).slice(0, 13));
}

export function normalizeRecoveryCode(value) {
  return typeof value === 'string'
    ? value.replace(/[\s-]/gu, '').toUpperCase()
    : '';
}

export async function hashRecoveryCode(code) {
  const normalized = normalizeRecoveryCode(code);
  if (!/^[A-Z2-7]{8,32}$/.test(normalized)) {
    throw new Error('mfa_recovery_code_invalid');
  }
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(normalized, salt, 64);
  return `scrypt$${salt.toString('hex')}$${Buffer.from(derived).toString('hex')}`;
}

export async function verifyRecoveryCode(code, encoded) {
  const normalized = normalizeRecoveryCode(code);
  if (!/^[A-Z2-7]{8,32}$/.test(normalized) || typeof encoded !== 'string') return false;
  const [scheme, saltHex, hashHex] = encoded.split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  try {
    const expected = Buffer.from(hashHex, 'hex');
    const actual = Buffer.from(await scrypt(
      normalized,
      Buffer.from(saltHex, 'hex'),
      expected.length,
    ));
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export const mfaTotpConstants = Object.freeze({
  stepSeconds: TOTP_STEP_SECONDS,
  digits: TOTP_DIGITS,
  challengeLifetimeSeconds: 5 * 60,
  maximumChallengeAttempts: 5,
  maximumPersistedAttempts: 100,
});
