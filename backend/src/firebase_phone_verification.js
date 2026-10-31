import { firebaseAuthClient } from './firebase_social_auth.js';
import { config } from './config.js';

export class PhoneVerificationError extends Error {
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

export function normalizeFirebasePhoneClaims(decoded) {
  if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) {
    throw new PhoneVerificationError(401, 'invalid_phone_verification_token');
  }
  if (boundedText(decoded.firebase?.sign_in_provider, 40) !== 'phone') {
    throw new PhoneVerificationError(401, 'invalid_phone_verification_provider');
  }
  const firebaseUserId = boundedText(decoded.uid ?? decoded.sub, 180);
  const phoneNumber = boundedText(decoded.phone_number, 20);
  if (!firebaseUserId || !/^\+[1-9][0-9]{7,14}$/.test(phoneNumber)) {
    throw new PhoneVerificationError(401, 'invalid_phone_verification_token');
  }
  return { firebaseUserId, phoneNumber };
}

export async function verifyFirebasePhoneToken(rawToken, { verifyIdToken } = {}) {
  if (!verifyIdToken && !config.phoneVerification.enabled) {
    throw new PhoneVerificationError(503, 'phone_verification_unavailable');
  }
  const token = boundedText(rawToken, 12_000);
  if (token.length < 100) {
    throw new PhoneVerificationError(401, 'invalid_phone_verification_token');
  }
  try {
    const auth = verifyIdToken ? null : await firebaseAuthClient();
    const verify = verifyIdToken ?? auth.verifyIdToken.bind(auth);
    const decoded = await verify(token, true);
    return normalizeFirebasePhoneClaims(decoded);
  } catch (error) {
    if (error instanceof PhoneVerificationError) throw error;
    throw new PhoneVerificationError(401, 'invalid_phone_verification_token', error);
  }
}

export async function deleteFirebasePhoneIdentity(
  identity,
  { getUser, deleteUser } = {},
) {
  const firebaseUserId = boundedText(identity?.firebaseUserId, 180);
  const phoneNumber = boundedText(identity?.phoneNumber, 20);
  if (!firebaseUserId || !/^\+[1-9][0-9]{7,14}$/.test(phoneNumber)) {
    throw new PhoneVerificationError(401, 'invalid_phone_verification_token');
  }
  try {
    const auth = getUser && deleteUser ? null : await firebaseAuthClient();
    const fetchUser = getUser ?? auth.getUser.bind(auth);
    const remove = deleteUser ?? auth.deleteUser.bind(auth);
    const user = await fetchUser(firebaseUserId);
    const providers = Array.isArray(user?.providerData) ? user.providerData : [];
    if (user?.uid !== firebaseUserId
        || user?.phoneNumber !== phoneNumber
        || providers.length !== 1
        || providers[0]?.providerId !== 'phone') {
      throw new PhoneVerificationError(409, 'phone_identity_cleanup_unsafe');
    }
    await remove(firebaseUserId);
  } catch (error) {
    if (error instanceof PhoneVerificationError) throw error;
    throw new PhoneVerificationError(502, 'phone_identity_cleanup_failed', error);
  }
}
