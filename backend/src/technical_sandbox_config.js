import {
  closeSync,
  constants,
  fstatSync,
  openSync,
  readSync,
} from 'node:fs';
import path from 'node:path';

const maximumAuthorizationMs = 24 * 60 * 60 * 1000;
const syntheticUserPattern = /^synthetic_sandbox_user_[A-Za-z0-9_-]{4,100}$/u;

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function flag(value, name) {
  const normalized = String(value ?? '0').trim().toLowerCase();
  if (!['0', '1', 'false', 'true'].includes(normalized)) fail(`${name}_invalid`);
  return normalized === '1' || normalized === 'true';
}

function readPrivateSecretFile(env, name) {
  const fileName = String(env[name] ?? '').trim();
  if (!fileName || !path.isAbsolute(fileName)) fail(`${name}_required_absolute`);
  let descriptor;
  try {
    descriptor = openSync(
      fileName,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_CLOEXEC,
    );
    const metadata = fstatSync(descriptor);
    if (!metadata.isFile() || (metadata.mode & 0o777) !== 0o600
        || metadata.size < 16 || metadata.size > 512) {
      fail(`${name}_must_be_private_0600_file`);
    }
    const bytes = Buffer.alloc(metadata.size);
    let offset = 0;
    while (offset < bytes.length) {
      const read = readSync(descriptor, bytes, offset, bytes.length - offset, null);
      if (read === 0) fail(`${name}_unreadable`);
      offset += read;
    }
    const finalMetadata = fstatSync(descriptor);
    if (!finalMetadata.isFile() || (finalMetadata.mode & 0o777) !== 0o600
        || finalMetadata.size !== metadata.size) {
      fail(`${name}_must_be_private_0600_file`);
    }
    const value = bytes.toString('utf8').trim();
    bytes.fill(0);
    return value;
  } catch (error) {
    if (error?.code?.startsWith?.(`${name}_`)) throw error;
    fail(`${name}_unreadable`);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function boundedInstant(value, name, now) {
  const parsed = new Date(String(value ?? '').trim());
  if (!Number.isFinite(parsed.getTime())) fail(`${name}_invalid`);
  return parsed;
}

export function readTechnicalSandboxConfiguration(
  env = {},
  { deploymentEnvironment = 'development', now = new Date() } = {},
) {
  const enabled = flag(env.TECHNICAL_SANDBOX_ENABLED, 'technical_sandbox_enabled');
  const killSwitch = flag(env.TECHNICAL_SANDBOX_KILL_SWITCH, 'technical_sandbox_kill_switch');
  const environment = String(deploymentEnvironment).trim().toLowerCase();
  if (enabled && !['staging', 'test'].includes(environment)) {
    fail('technical_sandbox_environment_forbidden');
  }

  const allowlistedUserIds = Object.freeze([...new Set(
    String(env.TECHNICAL_SANDBOX_USER_IDS ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  )]);
  if (enabled && (allowlistedUserIds.length === 0
      || allowlistedUserIds.some((value) => !syntheticUserPattern.test(value)))) {
    fail('technical_sandbox_user_allowlist_invalid');
  }

  const base = {
    enabled,
    killSwitch,
    available: false,
    reason: !enabled ? 'disabled' : (killSwitch ? 'kill_switch' : 'unavailable'),
    provider: 'stripe',
    mode: 'disabled',
    professionalReview: false,
    amountMinor: 100,
    currency: 'EUR',
    maxRunsPerUser24h: 3,
    authorizationId: '',
    authorizationIssuedAt: null,
    authorizationExpiresAt: null,
    expectedAccountId: '',
    secretKey: '',
    webhookSecret: '',
    credentialSource: 'none',
    allowlistedUserIds,
    syntheticEmailDomain: 'example.invalid',
    apiVersion: String(env.STRIPE_API_VERSION ?? '2026-08-26.dahlia').trim(),
  };
  if (!enabled || killSwitch) return Object.freeze(base);

  const authorizationId = String(env.TECHNICAL_SANDBOX_AUTHORIZATION_ID ?? '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/u.test(authorizationId)) {
    fail('technical_sandbox_authorization_id_invalid');
  }
  const authorizationIssuedAt = boundedInstant(
    env.TECHNICAL_SANDBOX_AUTHORIZATION_ISSUED_AT,
    'technical_sandbox_authorization_issued_at',
    now,
  );
  const authorizationExpiresAt = boundedInstant(
    env.TECHNICAL_SANDBOX_AUTHORIZATION_EXPIRES_AT,
    'technical_sandbox_authorization_expires_at',
    now,
  );
  if (authorizationIssuedAt > now
      || authorizationExpiresAt.getTime() - authorizationIssuedAt.getTime() > maximumAuthorizationMs) {
    fail('technical_sandbox_authorization_invalid');
  }
  if (authorizationExpiresAt <= now) {
    return Object.freeze({
      ...base,
      reason: 'authorization_expired',
      authorizationId,
      authorizationIssuedAt,
      authorizationExpiresAt,
    });
  }

  const secretKeyFile = String(env.TECHNICAL_SANDBOX_SECRET_KEY_FILE ?? '').trim();
  const webhookSecretFile = String(env.TECHNICAL_SANDBOX_WEBHOOK_SECRET_FILE ?? '').trim();
  if (!secretKeyFile || secretKeyFile === webhookSecretFile) {
    fail('technical_sandbox_secret_files_must_be_distinct');
  }
  const secretKey = readPrivateSecretFile(env, 'TECHNICAL_SANDBOX_SECRET_KEY_FILE');
  const webhookSecret = readPrivateSecretFile(env, 'TECHNICAL_SANDBOX_WEBHOOK_SECRET_FILE');
  if (!/^rk_test_[A-Za-z0-9]+$/u.test(secretKey)) {
    fail('technical_sandbox_secret_key_must_be_restricted_test');
  }
  if (!/^whsec_[A-Za-z0-9]+$/u.test(webhookSecret)) {
    fail('technical_sandbox_webhook_secret_invalid');
  }
  const expectedAccountId = String(env.TECHNICAL_SANDBOX_ACCOUNT_ID ?? '').trim();
  if (!/^acct_[A-Za-z0-9]+$/u.test(expectedAccountId)) {
    fail('technical_sandbox_account_id_invalid');
  }
  return Object.freeze({
    ...base,
    available: true,
    reason: 'available',
    mode: 'test',
    authorizationId,
    authorizationIssuedAt,
    authorizationExpiresAt,
    expectedAccountId,
    secretKey,
    webhookSecret,
    credentialSource: 'private_0600_file',
  });
}

export function technicalSandboxUserAllowed(userId, configuration) {
  return configuration?.available === true
    && configuration.allowlistedUserIds.includes(String(userId ?? '').trim());
}

export function technicalSandboxHealthProjection(configuration = {}) {
  const available = configuration.available === true && configuration.killSwitch !== true;
  return Object.freeze({
    available,
    reason: configuration.reason ?? (available ? 'available' : 'unavailable'),
    provider: 'stripe',
    mode: available ? 'test' : 'disabled',
    amountMinor: 100,
    currency: 'EUR',
    maxRunsPerUser24h: 3,
    professionalReview: false,
    syntheticOnly: true,
  });
}

export { syntheticUserPattern };
