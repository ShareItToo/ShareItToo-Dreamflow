import crypto from 'node:crypto';

const digestPattern = /^[0-9a-f]{64}$/u;
const userIdPattern = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/u;
const providerName = 'google';

export class StagingGoogleRegistrationError extends Error {
  constructor(code) {
    super(code);
    this.name = 'StagingGoogleRegistrationError';
    this.code = code;
  }
}

function fail(code) {
  throw new StagingGoogleRegistrationError(code);
}

function booleanFlag(value) {
  if (value === undefined || value === null || value === '') return false;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes'].includes(normalized)) return true;
  if (['0', 'false', 'no'].includes(normalized)) return false;
  return null;
}

function identityDigest(identity) {
  const provider = typeof identity?.provider === 'string' ? identity.provider.trim() : '';
  const subject = typeof identity?.subject === 'string' ? identity.subject.trim() : '';
  const firebaseUserId = typeof identity?.firebaseUserId === 'string'
    ? identity.firebaseUserId.trim()
    : '';
  const email = typeof identity?.email === 'string' ? identity.email.trim().toLowerCase() : '';
  return crypto.createHash('sha256')
    .update(`${provider}\n${subject}\n${firebaseUserId}\n${email}`, 'utf8')
    .digest('hex');
}

function parseAllowlist(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return Object.freeze([]);
  const entries = raw.split(',').map((entry) => entry.trim());
  if (entries.some((entry) => !entry)) fail('staging_google_registration_allowlist_invalid');
  const parsed = entries.map((entry) => {
    const separator = entry.indexOf('=');
    const digest = separator < 0 ? '' : entry.slice(0, separator);
    const userId = separator < 0 ? '' : entry.slice(separator + 1);
    if (!digestPattern.test(digest) || !userIdPattern.test(userId)) {
      fail('staging_google_registration_allowlist_invalid');
    }
    return Object.freeze({ digest, userId });
  });
  const seen = new Set();
  for (const entry of parsed) {
    if (seen.has(entry.digest)) fail('staging_google_registration_allowlist_duplicate');
    seen.add(entry.digest);
  }
  return Object.freeze(parsed);
}

export function readStagingGoogleRegistrationConfiguration(
  environment = process.env,
  { stagingAccess, firebaseAuthEnabled, stripeLivemode } = {},
) {
  const deploymentEnvironment = String(
    environment.DEPLOYMENT_ENVIRONMENT ?? environment.NODE_ENV ?? 'development',
  ).trim().toLowerCase();
  const enabledFlag = booleanFlag(environment.SIT_STAGING_GOOGLE_REGISTRATION_ENABLED);
  if (enabledFlag === null) fail('staging_google_registration_enabled_invalid');
  const provider = String(
    environment.SIT_STAGING_GOOGLE_REGISTRATION_PROVIDER ?? providerName,
  ).trim().toLowerCase();
  const allowlist = parseAllowlist(environment.SIT_STAGING_GOOGLE_REGISTRATION_ALLOWLIST);
  if (!enabledFlag) {
    if (allowlist.length > 0 || provider !== providerName) {
      fail('staging_google_registration_disabled_configured');
    }
    return Object.freeze({
      enabled: false,
      provider: providerName,
      allowlist,
      replayWindowSeconds: 3600,
    });
  }
  if (!['staging', 'test'].includes(deploymentEnvironment)) {
    fail('staging_google_registration_requires_staging');
  }
  if (provider !== providerName) fail('staging_google_registration_provider_invalid');
  if (firebaseAuthEnabled !== true) fail('staging_google_registration_requires_firebase');
  if (stripeLivemode === true) fail('staging_google_registration_livemode_forbidden');
  if (!stagingAccess?.enabled || !stagingAccess.valid) {
    fail('staging_google_registration_requires_access_gate');
  }
  if (allowlist.length === 0) fail('staging_google_registration_allowlist_required');
  if (allowlist.some((entry) => !stagingAccess.allowedUserIds.includes(entry.userId))) {
    fail('staging_google_registration_user_not_allowlisted');
  }
  const replayWindowSeconds = Number(environment.SIT_STAGING_GOOGLE_REGISTRATION_REPLAY_WINDOW_SECONDS ?? 3600);
  if (!Number.isInteger(replayWindowSeconds) || replayWindowSeconds < 300 || replayWindowSeconds > 3600) {
    fail('staging_google_registration_replay_window_invalid');
  }
  return Object.freeze({ enabled: true, provider, allowlist, replayWindowSeconds });
}

export function resolveStagingGoogleRegistration(configuration, identity) {
  if (!configuration?.enabled) return null;
  if (!identity || identity.provider !== providerName) {
    fail('staging_google_registration_provider_mismatch');
  }
  if (identity.emailVerified !== true) fail('staging_google_registration_email_unverified');
  const digest = identityDigest(identity);
  const match = configuration.allowlist.find((entry) => entry.digest === digest);
  if (!match) fail('staging_google_identity_not_allowlisted');
  if (!userIdPattern.test(match.userId)) fail('staging_google_registration_user_invalid');
  return Object.freeze({ digest, userId: match.userId, provider: providerName });
}

export function assertStagingGoogleRegistrationToken(
  identity,
  now = Date.now(),
  maxLifetimeSeconds = 2 * 60 * 60,
) {
  const expiresAt = Number(identity?.tokenExpiresAt);
  const issuedAt = Number(identity?.tokenIssuedAt);
  const tokenDigest = typeof identity?.tokenDigest === 'string' ? identity.tokenDigest : '';
  if (!digestPattern.test(tokenDigest)) fail('staging_google_registration_token_invalid');
  if (!Number.isSafeInteger(issuedAt) || !Number.isSafeInteger(expiresAt)) {
    fail('staging_google_registration_token_claims_missing');
  }
  const nowSeconds = Math.floor(now / 1000);
  if (issuedAt > nowSeconds + 60 || expiresAt <= nowSeconds || expiresAt <= issuedAt) {
    fail('staging_google_registration_token_expired');
  }
  if (!Number.isSafeInteger(maxLifetimeSeconds) || maxLifetimeSeconds < 300
      || maxLifetimeSeconds > 2 * 60 * 60
      || expiresAt - issuedAt > maxLifetimeSeconds) {
    fail('staging_google_registration_token_lifetime_invalid');
  }
  return Object.freeze({ tokenDigest, expiresAt: new Date(expiresAt * 1000) });
}

export async function reserveStagingGoogleRegistrationReplay(
  client,
  { tokenDigest, identityDigest: digest, expiresAt },
) {
  if (!digestPattern.test(tokenDigest) || !digestPattern.test(digest)
      || !(expiresAt instanceof Date) || Number.isNaN(expiresAt.getTime())) {
    fail('staging_google_registration_replay_invalid');
  }
  await client.query('DELETE FROM staging_google_registration_replays WHERE expires_at <= now()');
  const result = await client.query(
    `INSERT INTO staging_google_registration_replays (
       token_digest, identity_digest, expires_at
     ) VALUES ($1, $2, $3)
     ON CONFLICT (token_digest) DO NOTHING
     RETURNING token_digest`,
    [tokenDigest, digest, expiresAt],
  );
  if (result.rowCount !== 1) fail('staging_google_registration_replay');
  return true;
}

export { identityDigest };
