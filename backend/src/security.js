import crypto from 'node:crypto';
import { promisify } from 'node:util';

import jwt from 'jsonwebtoken';

import { config } from './config.js';

const scrypt = promisify(crypto.scrypt);
export function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function isValidEmail(value) {
  const email = normalizeEmail(value);
  if (!email || email.length > 254 || /\s/u.test(email)) return false;
  const separator = email.indexOf('@');
  if (separator <= 0 || separator !== email.lastIndexOf('@')) return false;
  const domain = email.slice(separator + 1);
  const dot = domain.lastIndexOf('.');
  return dot > 0 && dot < domain.length - 1;
}

export function isValidPassword(value) {
  return passwordPolicyError(value) === null;
}

export function passwordPolicyError(value) {
  if (typeof value !== 'string' || value.length < 10) return 'password_too_short';
  if (value.length > 200) return 'password_too_long';
  if (!/\p{L}/u.test(value) || !/\d/u.test(value)) return 'password_too_weak';
  return null;
}

export async function hashPassword(password) {
  if (!isValidPassword(password)) throw new Error('Invalid password');
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${Buffer.from(derived).toString('hex')}`;
}

export async function verifyPassword(password, encoded) {
  if (typeof password !== 'string' || typeof encoded !== 'string') return false;
  const [scheme, saltHex, hashHex] = encoded.split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  try {
    const expected = Buffer.from(hashHex, 'hex');
    const actual = Buffer.from(await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length));
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export function signAccessToken(user, { sessionId } = {}) {
  if (typeof sessionId !== 'string' || !sessionId) throw new Error('Missing session id');
  return jwt.sign(
    { sub: user.id, sid: sessionId, email: user.email, type: 'access' },
    config.jwtSecret,
    {
      algorithm: 'HS256',
      issuer: 'shareittoo-api',
      audience: 'shareittoo-app',
      expiresIn: config.accessTokenLifetime,
    },
  );
}

export function verifyAccessToken(token) {
  const payload = jwt.verify(token, config.jwtSecret, {
    algorithms: ['HS256'],
    issuer: 'shareittoo-api',
    audience: 'shareittoo-app',
  });
  if (payload.type !== 'access' || typeof payload.sub !== 'string' || typeof payload.sid !== 'string') {
    throw new Error('Invalid access token');
  }
  return payload;
}

export function newRefreshToken() {
  return crypto.randomBytes(48).toString('base64url');
}

export function newActionToken() {
  return crypto.randomBytes(48).toString('base64url');
}

export function hashRefreshToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function hashActionToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function bearerToken(req) {
  const value = req.get('authorization');
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (normalized.slice(0, 7).toLowerCase() !== 'bearer ') return null;
  const token = normalized.slice(7).trim();
  return token || null;
}

export function requireAuth(req, res, next) {
  const token = bearerToken(req);
  if (!token) return res.status(401).json({ error: 'authentication_required' });
  try {
    const payload = verifyAccessToken(token);
    req.auth = { userId: payload.sub, sessionId: payload.sid, email: payload.email };
    return next();
  } catch {
    return res.status(401).json({ error: 'invalid_or_expired_session' });
  }
}

export function defaultProfile({ email }) {
  const localPart = normalizeEmail(email).split('@')[0] || 'Mitglied';
  const displayName = localPart
    .replace(/[._-]+/g, ' ')
    .replace(/\b\p{L}/gu, (letter) => letter.toUpperCase())
    .slice(0, 80);
  return {
    displayName,
    preferredLanguage: 'de-DE',
    emailVerified: false,
    phoneVerified: false,
    isVerified: false,
    isBanned: false,
    role: 'user',
    avgRating: 0,
    reviewCount: 0,
    languages: ['Deutsch'],
    interests: [],
    showWork: false,
    showHobbies: false,
    showHomeLocation: false,
    showBioPublic: true,
    showLanguagesPublic: true,
    showInterestsPublic: true,
    showFavoriteSong: false,
  };
}

const privateProfileKeys = new Set([
  'phone',
  'birthDate',
  'homeLat',
  'homeLng',
  'addressStreet',
  'addressHouseNumber',
  'addressPostalCode',
  'addressCity',
  'addressCountry',
  'addressExtra',
  'payoutAccountId',
]);

const protectedProfileKeys = new Set([
  'id',
  'email',
  'createdAt',
  'role',
  'isBanned',
  'isVerified',
  'emailVerified',
  'phoneVerified',
  'avgRating',
  'reviewCount',
  'isDeactivated',
  'deactivatedAt',
]);

export function sanitizeProfileUpdate(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const entries = [];
  for (const [key, raw] of Object.entries(value)) {
    if (protectedProfileKeys.has(key)) continue;
    if (typeof raw === 'string') entries.push([key, raw.trim().slice(0, 2000)]);
    else if (typeof raw === 'boolean' || typeof raw === 'number' || raw === null) entries.push([key, raw]);
    else if (Array.isArray(raw)) {
      entries.push([key, raw.slice(0, 50).map((item) => String(item).slice(0, 120))]);
    }
  }
  return Object.fromEntries(entries);
}

export function shapeUser(row, { publicOnly = false } = {}) {
  const profile = { ...defaultProfile({ email: row.email }), ...(row.profile ?? {}) };
  const role = ['user', 'support', 'admin'].includes(row.role) ? row.role : 'user';
  const accountStatus = ['active', 'suspended', 'closed'].includes(row.account_status)
    ? row.account_status
    : (row.deactivated_at ? 'closed' : 'active');
  profile.role = role;
  profile.isBanned = accountStatus === 'suspended';
  if (publicOnly) {
    for (const key of privateProfileKeys) delete profile[key];
  }
  return {
    ...profile,
    id: row.id,
    email: publicOnly ? '' : row.email,
    ...(!publicOnly ? { accountStatus } : {}),
    createdAt: new Date(row.created_at).toISOString(),
    isDeactivated: Boolean(row.deactivated_at),
    deactivatedAt: row.deactivated_at ? new Date(row.deactivated_at).toISOString() : null,
    emailVerified: Boolean(row.email_verified_at),
    ...(!publicOnly ? {
      phoneVerified: Boolean(row.phone_verified_at),
      termsAccepted: Boolean(row.terms_accepted_at),
      privacyAccepted: Boolean(row.privacy_accepted_at),
      minimumAgeConfirmed: Boolean(row.minimum_age_confirmed_at),
    } : {}),
  };
}

export function isValidBirthDate(value, minimumAge = config.minimumAccountAge) {
  if (value === null || value === undefined || value === '') return true;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const birthDate = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(birthDate.getTime())) return false;
  const today = new Date();
  let age = today.getUTCFullYear() - birthDate.getUTCFullYear();
  const month = today.getUTCMonth() - birthDate.getUTCMonth();
  if (month < 0 || (month === 0 && today.getUTCDate() < birthDate.getUTCDate())) age -= 1;
  return age >= minimumAge && age <= 120;
}

export function safeText(value, maxLength = 4000) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}
