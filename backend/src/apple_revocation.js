import crypto from 'node:crypto';

import jwt from 'jsonwebtoken';

const APPLE_ISSUER = 'https://appleid.apple.com';
const APPLE_AUTH_ENDPOINT = `${APPLE_ISSUER}/auth`;
const MATERIAL_MAX_LENGTH = 12_000;

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function fromBase64url(value) {
  return Buffer.from(value, 'base64url');
}

function boundedMaterial(value) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized && normalized.length <= MATERIAL_MAX_LENGTH ? normalized : '';
}

function suppliedMaterial(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

export class AppleRevocationError extends Error {
  constructor(code, { retryable = true, cause } = {}) {
    super(code, cause ? { cause } : undefined);
    this.code = code;
    this.retryable = retryable;
  }
}

export function normalizeAppleRevocationMaterial({
  authorizationCode,
  refreshToken,
} = {}) {
  const suppliedCode = suppliedMaterial(authorizationCode);
  const suppliedRefresh = suppliedMaterial(refreshToken);
  if (suppliedCode.length > MATERIAL_MAX_LENGTH || suppliedRefresh.length > MATERIAL_MAX_LENGTH) {
    throw new AppleRevocationError('apple_revocation_material_invalid', { retryable: false });
  }
  const code = boundedMaterial(suppliedCode);
  const refresh = boundedMaterial(suppliedRefresh);
  if (code && refresh) {
    throw new AppleRevocationError('apple_revocation_material_ambiguous', {
      retryable: false,
    });
  }
  if (refresh) return Object.freeze({ kind: 'refresh_token', value: refresh });
  if (code) return Object.freeze({ kind: 'authorization_code', value: code });
  return null;
}

export function encryptAppleRevocationMaterial(value, key) {
  const material = boundedMaterial(value);
  if (!material || !Buffer.isBuffer(key) || key.length !== 32) {
    throw new AppleRevocationError('apple_revocation_encryption_unavailable', {
      retryable: false,
    });
  }
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(material, 'utf8')),
    cipher.final(),
  ]);
  return `v1.${base64url(nonce)}.${base64url(cipher.getAuthTag())}.${base64url(ciphertext)}`;
}

export function decryptAppleRevocationMaterial(payload, key) {
  if (typeof payload !== 'string' || payload.length > 24_000
      || !Buffer.isBuffer(key) || key.length !== 32) {
    throw new AppleRevocationError('apple_revocation_material_unavailable', {
      retryable: false,
    });
  }
  const [version, nonceValue, tagValue, ciphertextValue] = payload.split('.');
  if (version !== 'v1' || !nonceValue || !tagValue || !ciphertextValue) {
    throw new AppleRevocationError('apple_revocation_material_invalid', {
      retryable: false,
    });
  }
  try {
    if (fromBase64url(nonceValue).length !== 12 || fromBase64url(tagValue).length !== 16) {
      throw new Error('invalid apple revocation nonce or tag');
    }
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
  } catch (error) {
    throw new AppleRevocationError('apple_revocation_material_invalid', {
      retryable: false,
      cause: error,
    });
  }
}

function providerError(response, code) {
  const status = Number(response?.status ?? 0);
  return new AppleRevocationError(code, {
    retryable: status === 0 || status === 408 || status === 409 || status === 425
      || status === 429 || status >= 500,
  });
}

async function postForm(fetchImpl, url, body) {
  let response;
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body),
    });
  } catch (error) {
    throw new AppleRevocationError('apple_revocation_transport_failed', {
      retryable: true,
      cause: error,
    });
  }
  if (!response?.ok) throw providerError(response, 'apple_revocation_provider_rejected');
  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    throw new AppleRevocationError('apple_revocation_response_invalid', {
      retryable: true,
      cause: error,
    });
  }
  return payload;
}

/**
 * Constructs the provider adapter, but does not make a request until the
 * outbox worker invokes it. The default server configuration keeps this
 * adapter disabled until Apple credentials and the encryption key exist.
 */
export function createAppleRevocationProvider({
  enabled = false,
  clientId = '',
  teamId = '',
  keyId = '',
  privateKey = '',
  redirectUri = '',
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!enabled) return null;
  if (!clientId || !teamId || !keyId || !privateKey || !fetchImpl) {
    throw new Error('apple_revocation_provider_configuration_invalid');
  }
  let signingKey;
  try {
    signingKey = crypto.createPrivateKey(privateKey);
  } catch {
    throw new Error('apple_revocation_provider_configuration_invalid');
  }
  if (signingKey.asymmetricKeyType !== 'ec') {
    throw new Error('apple_revocation_provider_configuration_invalid');
  }
  const clientSecret = () => jwt.sign({}, privateKey, {
    algorithm: 'ES256',
    issuer: teamId,
    subject: clientId,
    audience: APPLE_ISSUER,
    expiresIn: 300,
    keyid: keyId,
  });
  const exchangeAuthorizationCode = async ({ code }) => {
    const payload = await postForm(fetchImpl, `${APPLE_AUTH_ENDPOINT}/token`, {
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      client_secret: clientSecret(),
      ...(redirectUri ? { redirect_uri: redirectUri } : {}),
    });
    const refreshToken = boundedMaterial(payload?.refresh_token);
    if (!refreshToken) {
      throw new AppleRevocationError('apple_revocation_refresh_token_missing', {
        retryable: false,
      });
    }
    return refreshToken;
  };
  return Object.freeze({
    async revoke({ kind, value }) {
      const token = kind === 'authorization_code'
        ? await exchangeAuthorizationCode({ code: value })
        : boundedMaterial(value);
      if (!token) {
        throw new AppleRevocationError('apple_revocation_token_missing', {
          retryable: false,
        });
      }
      await postForm(fetchImpl, `${APPLE_AUTH_ENDPOINT}/revoke`, {
        client_id: clientId,
        client_secret: clientSecret(),
        token,
        token_type_hint: 'refresh_token',
      });
    },
  });
}

export const appleRevocationConstants = Object.freeze({
  materialMaxLength: MATERIAL_MAX_LENGTH,
  issuer: APPLE_ISSUER,
});
