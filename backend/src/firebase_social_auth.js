import fs from 'node:fs/promises';

import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

import { config } from './config.js';
import { validateFirebaseServiceAccount } from './firebase_service_account.js';
import { isValidEmail, normalizeEmail } from './security.js';

const providerNames = Object.freeze({
  'google.com': 'google',
  'apple.com': 'apple',
  'facebook.com': 'facebook',
});

export class SocialAuthError extends Error {
  constructor(status, code, cause = undefined) {
    super(code, cause ? { cause } : undefined);
    this.status = status;
    this.code = code;
  }
}

function boundedText(value, maxLength) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized && normalized.length <= maxLength ? normalized : '';
}

export function normalizeFirebaseSocialClaims(decoded) {
  if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) {
    throw new SocialAuthError(401, 'invalid_social_token');
  }
  const providerId = boundedText(decoded.firebase?.sign_in_provider, 40);
  const provider = providerNames[providerId];
  if (!provider || !config.socialAuth.allowedProviders.includes(provider)) {
    throw new SocialAuthError(401, 'unsupported_social_provider');
  }
  const firebaseUserId = boundedText(decoded.uid ?? decoded.sub, 180);
  const identities = decoded.firebase?.identities;
  const providerSubjects = identities && typeof identities === 'object'
    ? identities[providerId]
    : undefined;
  const subject = boundedText(
    Array.isArray(providerSubjects) ? providerSubjects[0] : undefined,
    180,
  );
  if (!firebaseUserId || !subject) {
    throw new SocialAuthError(401, 'invalid_social_token');
  }
  const email = normalizeEmail(decoded.email);
  if (!isValidEmail(email)) throw new SocialAuthError(422, 'social_email_required');
  const displayName = boundedText(decoded.name, 80);
  return {
    provider,
    subject,
    firebaseUserId,
    email,
    emailVerified: decoded.email_verified === true,
    displayName,
  };
}

let authClientPromise;

export async function firebaseAuthClient() {
  if (!authClientPromise) {
    const initialization = (async () => {
      let serviceAccount;
      try {
        serviceAccount = validateFirebaseServiceAccount(
          await fs.readFile(config.socialAuth.firebaseServiceAccountFile, 'utf8'),
          config.socialAuth.firebaseProjectId,
        );
      } catch (error) {
        throw new SocialAuthError(503, 'social_auth_unavailable', error);
      }
      const app = getApps().find((candidate) => candidate.name === 'shareittoo-auth') ??
        initializeApp({
          credential: cert(serviceAccount),
          projectId: config.socialAuth.firebaseProjectId,
        }, 'shareittoo-auth');
      return getAuth(app);
    })();
    authClientPromise = initialization.catch((error) => {
      authClientPromise = undefined;
      throw error;
    });
  }
  return authClientPromise;
}

export async function verifyFirebaseSocialToken(rawToken, { verifyIdToken } = {}) {
  if (!verifyIdToken && !config.socialAuth.enabled) {
    throw new SocialAuthError(503, 'social_auth_unavailable');
  }
  const token = boundedText(rawToken, 12_000);
  if (token.length < 100) throw new SocialAuthError(401, 'invalid_social_token');
  try {
    const auth = verifyIdToken ? null : await firebaseAuthClient();
    const verify = verifyIdToken ?? auth.verifyIdToken.bind(auth);
    const decoded = await verify(token, true);
    return normalizeFirebaseSocialClaims(decoded);
  } catch (error) {
    if (error instanceof SocialAuthError) throw error;
    throw new SocialAuthError(401, 'invalid_social_token', error);
  }
}
