const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/u;
const storageNamePattern = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,159}$/u;

function booleanFlag(value) {
  if (value === undefined || value === null || value === '') return false;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes'].includes(normalized)) return true;
  if (['0', 'false', 'no'].includes(normalized)) return false;
  return null;
}

function parseList(value, pattern) {
  const raw = String(value ?? '').trim();
  if (!raw) return Object.freeze({ values: Object.freeze([]), valid: false });
  const parts = raw.split(',').map((part) => part.trim());
  if (parts.some((part) => !pattern.test(part))) {
    return Object.freeze({ values: Object.freeze([]), valid: false });
  }
  const values = [...new Set(parts)];
  if (values.length !== parts.length) {
    return Object.freeze({ values: Object.freeze([]), valid: false });
  }
  return Object.freeze({ values: Object.freeze(values), valid: true });
}

/**
 * Read the private runtime-only staging cohort configuration. The values are
 * deliberately returned as arrays, never logged or serialized by the app.
 * An enabled gate with an empty or malformed list is invalid and therefore
 * denies every protected/guest request.
 */
export function readStagingAccessConfiguration(environment = process.env) {
  const deploymentEnvironment = String(
    environment.DEPLOYMENT_ENVIRONMENT ?? environment.NODE_ENV ?? 'development',
  ).trim().toLowerCase();
  const flag = booleanFlag(environment.SIT_STAGING_ACCESS_GATE_ENABLED);
  const hasPrivateValues = Boolean(
    String(environment.SIT_STAGING_ALLOWED_USER_IDS ?? '').trim()
    || String(environment.SIT_STAGING_PUBLIC_LISTING_IDS ?? '').trim()
    || String(environment.SIT_STAGING_PUBLIC_UPLOAD_NAMES ?? '').trim(),
  );
  if (flag === null) throw new Error('SIT_STAGING_ACCESS_GATE_ENABLED must be true or false');
  if (deploymentEnvironment === 'production' && (flag || hasPrivateValues)) {
    throw new Error('staging access gate configuration is forbidden in production');
  }
  if (flag && !['staging', 'test'].includes(deploymentEnvironment)) {
    throw new Error('SIT_STAGING_ACCESS_GATE_ENABLED requires staging or test environment');
  }

  const enabled = flag === true;
  const allowedUsers = parseList(environment.SIT_STAGING_ALLOWED_USER_IDS, identifierPattern);
  const publicListings = parseList(environment.SIT_STAGING_PUBLIC_LISTING_IDS, identifierPattern);
  const publicUploads = parseList(environment.SIT_STAGING_PUBLIC_UPLOAD_NAMES, storageNamePattern);
  const valid = !enabled || allowedUsers.valid;
  return Object.freeze({
    enabled,
    valid,
    deploymentEnvironment,
    allowedUserIds: allowedUsers.values,
    publicListingIds: publicListings.valid ? publicListings.values : Object.freeze([]),
    publicUploadNames: publicUploads.valid ? publicUploads.values : Object.freeze([]),
    publicListingConfigurationValid: !String(environment.SIT_STAGING_PUBLIC_LISTING_IDS ?? '').trim()
      || publicListings.valid,
    publicUploadConfigurationValid: !String(environment.SIT_STAGING_PUBLIC_UPLOAD_NAMES ?? '').trim()
      || publicUploads.valid,
  });
}

export function isStagingUserAllowed(configuration, userId) {
  return configuration?.enabled === true
    && configuration.valid === true
    && typeof userId === 'string'
    && configuration.allowedUserIds.includes(userId);
}

/**
 * Action-token rows have already been looked up under a row lock by the
 * caller. Keep the staging owner check fail-closed so a foreign, consumed or
 * expired row cannot reach an HTML-form mutation.
 */
export function stagingActionTokenOwnerAllowed(configuration, row, { now = new Date() } = {}) {
  if (!row || typeof row.id !== 'string') return false;
  const consumedAt = row.consumed_at ?? row.consumedAt;
  if (consumedAt !== null && consumedAt !== undefined) return false;
  const expiresAt = row.expires_at ?? row.expiresAt;
  if (!(expiresAt instanceof Date) || Number.isNaN(expiresAt.getTime())) return false;
  if (!(now instanceof Date) || Number.isNaN(now.getTime()) || expiresAt <= now) return false;
  return isStagingUserAllowed(configuration, row.id);
}

export function stagingGuestListingAllowed(configuration, listingId) {
  return configuration?.enabled === true
    && configuration.valid === true
    && configuration.publicListingConfigurationValid === true
    && typeof listingId === 'string'
    && configuration.publicListingIds.includes(listingId);
}

export function stagingGuestUploadAllowed(configuration, storageName) {
  return configuration?.enabled === true
    && configuration.valid === true
    && configuration.publicUploadConfigurationValid === true
    && typeof storageName === 'string'
    && configuration.publicUploadNames.includes(storageName);
}

const exactAnonymousPaths = new Set([
  '/health/live',
  '/health/ready',
  '/version',
]);
const controlledPostPaths = new Set([
  '/v1/auth/login',
  '/v1/auth/register',
  '/v1/auth/social',
  '/v1/auth/mfa/challenge',
  '/v1/auth/refresh',
  '/v1/auth/logout',
  '/v1/auth/email-verification/request',
  '/v1/auth/email-verification/confirm',
  '/v1/auth/email-change/confirm',
  '/v1/auth/password-reset/request',
  '/v1/auth/password-reset/form',
  '/v1/auth/password-reset/confirm',
  '/v1/account-deletion/request',
  '/v1/account-deletion/confirm',
]);
const controlledReadPaths = new Set([
  '/v1/auth/email-verification/confirm',
  '/v1/auth/email-change/confirm',
  '/v1/auth/password-reset/form',
  '/v1/account-deletion/confirm',
]);

export function stagingAnonymousPathAllowed(configuration, { method, path } = {}) {
  if (configuration?.enabled !== true || configuration.valid !== true) return false;
  const normalizedMethod = String(method ?? '').toUpperCase();
  const normalizedPath = String(path ?? '');
  if (!['GET', 'HEAD', 'POST'].includes(normalizedMethod)) return false;
  if (['GET', 'HEAD'].includes(normalizedMethod) && exactAnonymousPaths.has(normalizedPath)) return true;
  if (normalizedMethod === 'POST' && controlledPostPaths.has(normalizedPath)) return true;
  if (['GET', 'HEAD'].includes(normalizedMethod) && controlledReadPaths.has(normalizedPath)) return true;
  if (['GET', 'HEAD'].includes(normalizedMethod) && normalizedPath === '/v1/listings') {
    return configuration.publicListingIds.length > 0 && configuration.publicListingConfigurationValid;
  }
  if (['GET', 'HEAD'].includes(normalizedMethod) && /^\/v1\/uploads\/[^/]+$/u.test(normalizedPath)) {
    return configuration.publicUploadNames.length > 0 && configuration.publicUploadConfigurationValid;
  }
  return false;
}

export const stagingAccessPatterns = Object.freeze({
  identifier: identifierPattern,
  storageName: storageNamePattern,
});
