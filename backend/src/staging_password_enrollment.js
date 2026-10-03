import crypto from 'node:crypto';

const digestPattern = /^[a-f0-9]{64}$/u;
const tokenPattern = /^[A-Za-z0-9_-]{43}$/u;
const principalPattern = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/u;
const maximumLifetimeMs = 24 * 60 * 60 * 1000;
const denyCode = 'staging_password_enrollment_unavailable';

export class StagingPasswordEnrollmentError extends Error {
  constructor() {
    super(denyCode);
    this.code = denyCode;
  }
}

const deny = () => { throw new StagingPasswordEnrollmentError(); };
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const emailDigest = (tokenDigest, email) => hash(`${tokenDigest}\n${email}`);
const validEmail = (email) => typeof email === 'string'
  && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)
  && email === email.trim().toLowerCase();

// Ops-only pure preparation: the caller owns protected storage and delivery.
// No CLI, account write, invitation delivery or provider call is introduced.
export function prepareStagingPasswordInvitation({ email, userId, now = Date.now() }) {
  if (!validEmail(email) || typeof userId !== 'string' || !principalPattern.test(userId)
      || !Number.isSafeInteger(now)) deny();
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenDigest = hash(token);
  return {
    token,
    invitation: {
      tokenDigest,
      emailDigest: emailDigest(tokenDigest, email),
      userId,
      issuedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + maximumLifetimeMs).toISOString(),
    },
  };
}

export function readStagingPasswordEnrollmentConfiguration(
  environment = process.env,
  { stagingAccess, now = Date.now() } = {},
) {
  const flag = environment.SIT_STAGING_PASSWORD_ENROLLMENT_ENABLED ?? 'false';
  const raw = environment.SIT_STAGING_PASSWORD_ENROLLMENT_INVITATIONS ?? '';
  if (!['true', 'false'].includes(flag)) deny();
  if (flag === 'false') {
    if (raw !== '') deny();
    return Object.freeze({ enabled: false, invitations: Object.freeze([]) });
  }
  if (!['staging', 'test'].includes(stagingAccess?.deploymentEnvironment)
      || stagingAccess.enabled !== true || stagingAccess.valid !== true
      || String(environment.STRIPE_LIVEMODE ?? '').trim().toLowerCase() === 'true'
      || String(environment.PRIVATE_PILOT_V4_ENABLED ?? '').trim().toLowerCase() !== 'true'
      || !Number.isSafeInteger(now)) deny();
  let invitations;
  try { invitations = JSON.parse(raw); } catch { deny(); }
  if (!Array.isArray(invitations) || invitations.length < 1 || invitations.length > 20) deny();
  const tokens = new Set();
  const principals = new Set();
  const expectedKeys = ['emailDigest', 'expiresAt', 'issuedAt', 'tokenDigest', 'userId'];
  for (const invitation of invitations) {
    if (!invitation || typeof invitation !== 'object'
        || JSON.stringify(Object.keys(invitation).sort()) !== JSON.stringify(expectedKeys)
        || typeof invitation.tokenDigest !== 'string' || !digestPattern.test(invitation.tokenDigest)
        || typeof invitation.emailDigest !== 'string' || !digestPattern.test(invitation.emailDigest)
        || typeof invitation.userId !== 'string' || !principalPattern.test(invitation.userId)
        || !stagingAccess.allowedUserIds.includes(invitation.userId)
        || tokens.has(invitation.tokenDigest) || principals.has(invitation.userId)) deny();
    const issued = Date.parse(invitation.issuedAt);
    const expiry = Date.parse(invitation.expiresAt);
    if (!Number.isSafeInteger(issued) || !Number.isSafeInteger(expiry)
        || new Date(issued).toISOString() !== invitation.issuedAt
        || new Date(expiry).toISOString() !== invitation.expiresAt
        || issued > now || expiry <= issued || expiry - issued > maximumLifetimeMs) deny();
    // Expired invitations deny only their lane; they never prevent restart.
    tokens.add(invitation.tokenDigest);
    principals.add(invitation.userId);
    Object.freeze(invitation);
  }
  return Object.freeze({ enabled: true, invitations: Object.freeze(invitations) });
}

export function resolveStagingPasswordEnrollment(configuration, {
  token, email, authorizationPresent = false, now = Date.now(),
}) {
  if (!configuration?.enabled || authorizationPresent || !validEmail(email) || !Number.isSafeInteger(now)
      || typeof token !== 'string' || !tokenPattern.test(token)) deny();
  const tokenDigest = hash(token);
  const invitation = configuration.invitations.find((entry) => entry.tokenDigest === tokenDigest);
  if (!invitation || Date.parse(invitation.issuedAt) > now
      || Date.parse(invitation.expiresAt) <= now
      || !crypto.timingSafeEqual(Buffer.from(invitation.emailDigest, 'hex'),
        Buffer.from(emailDigest(tokenDigest, email), 'hex'))) deny();
  return invitation;
}

// Must run in the account/session transaction. A duplicate never returns a
// credential or reissues mail; a lost success response is recovered by login.
export async function reserveStagingPasswordEnrollment(client, invitation) {
  const result = await client.query(
    `INSERT INTO staging_password_enrollment_redemptions (token_digest, expires_at)
     SELECT $1, $2::timestamptz WHERE $2::timestamptz > clock_timestamp()
     ON CONFLICT (token_digest) DO NOTHING RETURNING token_digest`,
    [invitation.tokenDigest, invitation.expiresAt],
  );
  if (result.rowCount !== 1) deny();
}

export async function pruneExpiredStagingPasswordEnrollments(client) {
  await client.query('DELETE FROM staging_password_enrollment_redemptions WHERE expires_at <= now()');
}
