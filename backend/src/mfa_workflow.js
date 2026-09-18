import crypto from 'node:crypto';

import { config } from './config.js';
import {
  buildTotpUri,
  decryptTotpSecret,
  encryptTotpSecret,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  mfaTotpConstants,
  normalizeRecoveryCode,
  verifyRecoveryCode,
  verifyTotpCode,
} from './mfa_totp.js';

export class MfaWorkflowError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

function requireEncryptionKey() {
  if (!config.mfa.encryptionKey) {
    throw new MfaWorkflowError(503, 'mfa_encryption_unavailable');
  }
  return config.mfa.encryptionKey;
}

function challengeHash(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function hashLoginChallenge(value) {
  return challengeHash(value);
}

async function factorForUser(client, userId, { forUpdate = false } = {}) {
  const result = await client.query(
    `SELECT user_id, encrypted_secret, status, recovery_code_hashes,
            last_used_step, failed_attempts, locked_until,
            enrollment_idempotency_key, enabled_at
       FROM mfa_totp_factors
      WHERE user_id = $1${forUpdate ? ' FOR UPDATE' : ''}`,
    [userId],
  );
  return result.rows[0] ?? null;
}

export async function isMfaEnabled(client, userId) {
  const result = await client.query(
    `SELECT 1 FROM mfa_totp_factors
      WHERE user_id = $1 AND status = 'enabled' AND enabled_at IS NOT NULL`,
    [userId],
  );
  return result.rowCount === 1;
}

export async function beginTotpEnrollment(client, {
  userId,
  email,
  idempotencyKey,
}) {
  const key = requireEncryptionKey();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/.test(idempotencyKey ?? '')) {
    throw new MfaWorkflowError(400, 'mfa_idempotency_key_required');
  }
  const current = await factorForUser(client, userId, { forUpdate: true });
  if (current?.status === 'enabled') {
    throw new MfaWorkflowError(409, 'mfa_already_enabled');
  }
  if (current?.status === 'pending') {
    if (current.enrollment_idempotency_key !== idempotencyKey) {
      throw new MfaWorkflowError(409, 'mfa_enrollment_in_progress');
    }
    const secret = decryptTotpSecret(current.encrypted_secret, key);
    return Object.freeze({
      secret,
      otpauthUrl: buildTotpUri({ secret, account: email }),
      replayed: true,
    });
  }
  const secret = generateTotpSecret();
  const encrypted = encryptTotpSecret(secret, key);
  if (current?.status === 'disabled') {
    await client.query(
      `UPDATE mfa_totp_factors
          SET encrypted_secret = $2, status = 'pending', enabled_at = NULL,
              recovery_code_hashes = '[]'::jsonb, last_used_step = NULL,
              failed_attempts = 0, locked_until = NULL,
              enrollment_idempotency_key = $3
        WHERE user_id = $1 AND status = 'disabled'`,
      [userId, encrypted, idempotencyKey],
    );
  } else {
    await client.query(
      `INSERT INTO mfa_totp_factors (
         user_id, encrypted_secret, status, enrollment_idempotency_key
       ) VALUES ($1, $2, 'pending', $3)`,
      [userId, encrypted, idempotencyKey],
    );
  }
  return Object.freeze({
    secret,
    otpauthUrl: buildTotpUri({ secret, account: email }),
  });
}

async function revokeMfaSessionsAndChallenges(client, userId, reason) {
  await client.query(
    `UPDATE auth_sessions
        SET revoked_at = COALESCE(revoked_at, now()),
            revoked_reason = COALESCE(revoked_reason, $2)
      WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId, reason],
  );
  await client.query(
    `UPDATE refresh_tokens
        SET revoked_at = COALESCE(revoked_at, now()),
            revoked_reason = COALESCE(revoked_reason, $2)
      WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId, reason],
  );
  await client.query(
    `UPDATE auth_mfa_challenges
        SET consumed_at = COALESCE(consumed_at, now())
      WHERE user_id = $1 AND consumed_at IS NULL`,
    [userId],
  );
}

export async function confirmTotpEnrollment(client, { userId, code }) {
  const key = requireEncryptionKey();
  const factor = await factorForUser(client, userId, { forUpdate: true });
  if (!factor || factor.status !== 'pending') {
    throw new MfaWorkflowError(409, 'mfa_enrollment_not_pending');
  }
  const secret = decryptTotpSecret(factor.encrypted_secret, key);
  const result = verifyTotpCode(secret, code, { window: 1 });
  if (!result.valid) throw new MfaWorkflowError(401, 'mfa_totp_invalid');
  const recoveryCodes = generateRecoveryCodes();
  const hashes = await Promise.all(recoveryCodes.map(hashRecoveryCode));
  await client.query(
    `UPDATE mfa_totp_factors
        SET status = 'enabled', enabled_at = now(), last_used_step = $2,
            recovery_code_hashes = $3::jsonb, failed_attempts = 0,
            locked_until = NULL
      WHERE user_id = $1 AND status = 'pending'`,
    [userId, result.step, JSON.stringify(hashes)],
  );
  await revokeMfaSessionsAndChallenges(client, userId, 'mfa_enabled');
  return Object.freeze({ recoveryCodes });
}

export async function cancelTotpEnrollment(client, { userId }) {
  const factor = await factorForUser(client, userId, { forUpdate: true });
  if (!factor || factor.status !== 'pending') {
    throw new MfaWorkflowError(409, 'mfa_enrollment_not_pending');
  }
  await client.query(
    `UPDATE mfa_totp_factors
        SET status = 'disabled', encrypted_secret = NULL, enabled_at = NULL,
            recovery_code_hashes = '[]'::jsonb, last_used_step = NULL,
            failed_attempts = 0, locked_until = NULL,
            enrollment_idempotency_key = NULL
      WHERE user_id = $1 AND status = 'pending'`,
    [userId],
  );
  return Object.freeze({ cancelled: true });
}

async function consumeFactorCode(client, factor, code) {
  const key = requireEncryptionKey();
  const now = new Date();
  if (factor.locked_until && new Date(factor.locked_until) > now) {
    throw new MfaWorkflowError(429, 'mfa_temporarily_locked');
  }
  const secret = decryptTotpSecret(factor.encrypted_secret, key);
  const totp = verifyTotpCode(secret, code, {
    now: now.getTime(),
    window: 1,
    lastUsedStep: factor.last_used_step == null
      ? null
      : Number(factor.last_used_step),
  });
  if (totp.valid) {
    return { kind: 'totp', step: totp.step, recoveryHashes: factor.recovery_code_hashes };
  }
  const hashes = Array.isArray(factor.recovery_code_hashes)
    ? factor.recovery_code_hashes
    : [];
  for (let index = 0; index < hashes.length; index += 1) {
    if (await verifyRecoveryCode(code, hashes[index])) {
      return {
        kind: 'recovery',
        step: factor.last_used_step == null ? null : Number(factor.last_used_step),
        recoveryHashes: hashes.filter((_, candidate) => candidate !== index),
      };
    }
  }
  const nextAttempts = Math.min(
    mfaTotpConstants.maximumPersistedAttempts,
    Number(factor.failed_attempts ?? 0) + 1,
  );
  const lockedUntil = nextAttempts >= mfaTotpConstants.maximumChallengeAttempts
    ? new Date(now.getTime() + 15 * 60 * 1000)
    : null;
  await client.query(
    `UPDATE mfa_totp_factors
        SET failed_attempts = $2, locked_until = $3
      WHERE user_id = $1`,
    [factor.user_id, nextAttempts, lockedUntil],
  );
  return {
    ok: false,
    error: new MfaWorkflowError(
      lockedUntil ? 429 : 401,
      lockedUntil ? 'mfa_temporarily_locked' : 'mfa_code_invalid',
    ),
  };
}

export async function disableTotp(client, { userId, code }) {
  const factor = await factorForUser(client, userId, { forUpdate: true });
  if (!factor || factor.status !== 'enabled') {
    throw new MfaWorkflowError(409, 'mfa_not_enabled');
  }
  const consumed = await consumeFactorCode(client, factor, code);
  if (consumed.ok === false) return consumed;
  await client.query(
    `UPDATE mfa_totp_factors
        SET status = 'disabled', encrypted_secret = NULL, enabled_at = NULL,
            recovery_code_hashes = '[]'::jsonb, last_used_step = NULL,
            failed_attempts = 0, locked_until = NULL
      WHERE user_id = $1`,
    [userId],
  );
  await revokeMfaSessionsAndChallenges(client, userId, 'mfa_disabled');
  return Object.freeze({ disabled: true });
}

export async function createLoginChallenge(client, {
  userId,
  userAgent,
  ipAddress,
}) {
  const challenge = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + mfaTotpConstants.challengeLifetimeSeconds * 1000);
  await client.query(
    `UPDATE auth_mfa_challenges
        SET consumed_at = COALESCE(consumed_at, now())
      WHERE user_id = $1 AND purpose = 'login' AND consumed_at IS NULL`,
    [userId],
  );
  await client.query(
    `INSERT INTO auth_mfa_challenges (
       user_id, challenge_hash, purpose, expires_at, user_agent, ip_address
     ) VALUES ($1, $2, 'login', $3, $4, $5::inet)`,
    [userId, challengeHash(challenge), expiresAt, userAgent || null, ipAddress || null],
  );
  return Object.freeze({ challenge, expiresAt });
}

export async function verifyLoginChallenge(client, { challenge, code }) {
  if (typeof challenge !== 'string' || challenge.length < 32 || challenge.length > 200) {
    throw new MfaWorkflowError(401, 'mfa_challenge_invalid');
  }
  const challengeResult = await client.query(
    `SELECT id, user_id
       FROM auth_mfa_challenges
      WHERE challenge_hash = $1
        AND purpose = 'login'
        AND consumed_at IS NULL`,
    [challengeHash(challenge)],
  );
  const challengeRow = challengeResult.rows[0];
  if (!challengeRow) throw new MfaWorkflowError(401, 'mfa_challenge_expired');
  // Management and challenge paths lock the principal before the factor.
  const userLock = await client.query(
    'SELECT id FROM users WHERE id = $1 FOR UPDATE',
    [challengeRow.user_id],
  );
  if (!userLock.rowCount) throw new MfaWorkflowError(401, 'mfa_challenge_expired');
  const result = await client.query(
    `SELECT challenge.id, challenge.user_id, challenge.expires_at,
            challenge.attempts AS challenge_attempts,
            challenge.locked_until AS challenge_locked_until,
            factor.encrypted_secret, factor.status, factor.recovery_code_hashes,
            factor.last_used_step, factor.failed_attempts,
            factor.locked_until AS factor_locked_until,
            factor.enabled_at
       FROM auth_mfa_challenges AS challenge
       JOIN mfa_totp_factors AS factor ON factor.user_id = challenge.user_id
      WHERE challenge.id = $1
        AND challenge.purpose = 'login'
        AND challenge.consumed_at IS NULL
      FOR UPDATE OF challenge, factor`,
    [challengeRow.id],
  );
  const row = result.rows[0];
  if (!row || new Date(row.expires_at) <= new Date() || row.status !== 'enabled') {
    throw new MfaWorkflowError(401, 'mfa_challenge_expired');
  }
  if (row.challenge_locked_until && new Date(row.challenge_locked_until) > new Date()) {
    throw new MfaWorkflowError(429, 'mfa_temporarily_locked');
  }
  const consumed = await consumeFactorCode(client, {
    ...row,
    locked_until: row.factor_locked_until,
  }, code);
  if (consumed.ok === false) {
    const attempts = Math.min(
      mfaTotpConstants.maximumPersistedAttempts,
      Number(row.challenge_attempts ?? 0) + 1,
    );
    await client.query(
      `UPDATE auth_mfa_challenges
          SET attempts = $2::integer,
              locked_until = CASE WHEN $2::integer >= $3::integer
                THEN now() + interval '15 minutes' ELSE locked_until END
        WHERE id = $1`,
      [row.id, attempts, mfaTotpConstants.maximumChallengeAttempts],
    );
    return Object.freeze({ ok: false, error: consumed.error });
  }
  await client.query(
    `UPDATE auth_mfa_challenges SET consumed_at = now() WHERE id = $1`,
    [row.id],
  );
  if (consumed.kind === 'totp') {
    await client.query(
      `UPDATE mfa_totp_factors
          SET last_used_step = $2, failed_attempts = 0, locked_until = NULL
        WHERE user_id = $1`,
      [row.user_id, consumed.step],
    );
  } else {
    await client.query(
      `UPDATE mfa_totp_factors
          SET recovery_code_hashes = $2::jsonb, failed_attempts = 0,
              locked_until = NULL
        WHERE user_id = $1`,
      [row.user_id, JSON.stringify(consumed.recoveryHashes)],
    );
  }
  return Object.freeze({ ok: true, userId: row.user_id, method: consumed.kind });
}

export async function getMfaStatus(client, userId) {
  const factor = await factorForUser(client, userId);
  return Object.freeze({
    enabled: factor?.status === 'enabled' && factor.enabled_at != null,
    pending: factor?.status === 'pending',
    recoveryCodesRemaining: factor?.status === 'enabled'
      && Array.isArray(factor.recovery_code_hashes)
      ? factor.recovery_code_hashes.length
      : 0,
  });
}
