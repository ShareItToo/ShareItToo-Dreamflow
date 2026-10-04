import crypto from 'node:crypto';

const digest = (value) => crypto.createHash('sha256').update(value, 'utf8').digest('hex');
const digestPattern = /^[0-9a-f]{64}$/u;

function fail(code) {
  throw Object.assign(new Error(code), { code });
}

export function assertGreenPostEnrollmentProfile(profile, sourceImageDigest) {
  const keys = ['kind', 'schemaVersion', 'sourceImageDigest', 'allowedUserIdsDigest', 'allowedUserIdsCount', 'googleUserIdDigest'];
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)
      || JSON.stringify(Object.keys(profile).sort()) !== JSON.stringify(keys.sort())
      || profile.kind !== 'google-post-enrollment' || profile.schemaVersion !== 1
      || !/^sha256:[0-9a-f]{64}$/u.test(profile.sourceImageDigest ?? '')
      || profile.sourceImageDigest !== sourceImageDigest
      || !digestPattern.test(profile.allowedUserIdsDigest ?? '')
      || !digestPattern.test(profile.googleUserIdDigest ?? '')
      || !Number.isSafeInteger(profile.allowedUserIdsCount) || profile.allowedUserIdsCount < 2) {
    fail('green_post_enrollment_profile_invalid');
  }
  return Object.freeze({ ...profile });
}

export function summarizeGreenAllowedIds(raw) {
  if (typeof raw !== 'string') fail('green_post_enrollment_allowed_ids_invalid');
  const ids = raw.split(',');
  if (ids.some((id) => !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/u.test(id))
      || new Set(ids).size !== ids.length) fail('green_post_enrollment_allowed_ids_invalid');
  return Object.freeze({ allowedUserIdsDigest: digest(raw), allowedUserIdsCount: ids.length });
}

export function assertGreenAuthProfileReadback(values, profile = null) {
  if (!profile) {
    if (values?.FIREBASE_AUTH_ENABLED !== 'false') fail('green_broad_promotion_provider_off_invalid');
    return true;
  }
  assertGreenPostEnrollmentProfile(profile, profile.sourceImageDigest);
  if (values?.FIREBASE_AUTH_ENABLED !== 'true'
      || values?.FIREBASE_PHONE_VERIFICATION_ENABLED !== 'false'
      || values?.SIT_STAGING_ACCESS_GATE_ENABLED !== 'true'
      || values?.SIT_STAGING_GOOGLE_REGISTRATION_ENABLED !== 'false'
      || (Object.hasOwn(values, 'googleRegistrationAllowlistEmpty')
        ? values.googleRegistrationAllowlistEmpty !== true
        : String(values.SIT_STAGING_GOOGLE_REGISTRATION_ALLOWLIST ?? '').trim() !== '')) {
    fail('green_post_enrollment_auth_drift');
  }
  const raw = values.SIT_STAGING_ALLOWED_USER_IDS;
  const summary = raw === undefined ? values : summarizeGreenAllowedIds(raw);
  if (summary.allowedUserIdsDigest !== profile.allowedUserIdsDigest
      || summary.allowedUserIdsCount !== profile.allowedUserIdsCount) fail('green_post_enrollment_allowed_ids_drift');
  if (raw !== undefined && !raw.split(',').some((id) => digest(id) === profile.googleUserIdDigest)) {
    fail('green_post_enrollment_google_id_missing');
  }
  return true;
}

// Digest the exact ordered sequence; candidate output never contains user IDs.
export const greenAllowedIdsProbeExpression = "allowedUserIdsDigest:crypto.createHash('sha256').update(process.env.SIT_STAGING_ALLOWED_USER_IDS??'').digest('hex'),allowedUserIdsCount:(process.env.SIT_STAGING_ALLOWED_USER_IDS??'').split(',').length";
