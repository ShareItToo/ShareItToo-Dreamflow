import crypto from 'node:crypto';

import jwt from 'jsonwebtoken';

const APPLE_ISSUER = 'https://appleid.apple.com';
const APPLE_AUTH_ENDPOINT = `${APPLE_ISSUER}/auth`;
const MATERIAL_MAX_LENGTH = 12_000;
const PROVIDER_RESPONSE_MAX_BYTES = 32 * 1024;
const PROVIDER_DEADLINE_MS = 20_000;

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

function appleTokenResponseIdentity(idToken, expectedSubject, clientId) {
  const token = boundedMaterial(idToken);
  const subject = boundedMaterial(expectedSubject);
  if (!token || !subject) {
    throw new AppleRevocationError('apple_revocation_identity_mismatch', { retryable: false });
  }
  let payload;
  try {
    payload = jwt.decode(token);
  } catch (error) {
    throw new AppleRevocationError('apple_revocation_identity_mismatch', {
      retryable: false,
      cause: error,
    });
  }
  const audiences = typeof payload?.aud === 'string'
    ? [payload.aud]
    : Array.isArray(payload?.aud)
      && payload.aud.length > 0
      && payload.aud.every((audience) => typeof audience === 'string' && audience.length > 0)
      && new Set(payload.aud).size === payload.aud.length
      ? payload.aud
      : null;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)
      || payload.iss !== APPLE_ISSUER
      || !audiences
      || !audiences.includes(clientId)
      || typeof payload.sub !== 'string'
      || payload.sub !== subject) {
    throw new AppleRevocationError('apple_revocation_identity_mismatch', { retryable: false });
  }
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

async function readBoundedBody(response, maximumBytes) {
  const declared = Number(response.headers?.get?.('content-length') ?? 0);
  if (Number.isFinite(declared) && declared > maximumBytes) {
    throw new AppleRevocationError('apple_revocation_response_invalid', { retryable: true });
  }
  if (response.body?.getReader) {
    const reader = response.body.getReader();
    const chunks = [];
    let length = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maximumBytes) {
        await reader.cancel().catch(() => {});
        throw new AppleRevocationError('apple_revocation_response_invalid', { retryable: true });
      }
      chunks.push(value);
    }
    const combined = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { combined.set(chunk, offset); offset += chunk.byteLength; }
    return combined;
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > maximumBytes) {
    throw new AppleRevocationError('apple_revocation_response_invalid', { retryable: true });
  }
  return bytes;
}

async function postForm(fetchImpl, url, body, {
  expectJson = true,
  deadlineMs = PROVIDER_DEADLINE_MS,
} = {}) {
  let response;
  const controller = new AbortController();
  const boundedDeadlineMs = Number.isSafeInteger(deadlineMs)
    ? Math.min(PROVIDER_DEADLINE_MS, Math.max(1, deadlineMs))
    : PROVIDER_DEADLINE_MS;
  let rejectDeadline;
  const deadlineFailure = new Promise((_resolve, reject) => { rejectDeadline = reject; });
  const deadline = setTimeout(() => {
    controller.abort();
    rejectDeadline(new AppleRevocationError('apple_revocation_transport_failed', {
      retryable: true,
    }));
  }, boundedDeadlineMs);
  try {
    try {
      response = await Promise.race([fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(body),
        redirect: 'error',
        signal: controller.signal,
      }), deadlineFailure]);
    } catch {
      throw new AppleRevocationError('apple_revocation_transport_failed', {
        retryable: true,
      });
    }
    if (!response?.ok) throw providerError(response, 'apple_revocation_provider_rejected');
    const encoding = response.headers?.get?.('content-encoding')?.trim().toLowerCase() ?? '';
    if (encoding && encoding !== 'identity') {
      throw new AppleRevocationError('apple_revocation_response_invalid', { retryable: true });
    }
    if (!expectJson) {
      await Promise.race([
        readBoundedBody(response, PROVIDER_RESPONSE_MAX_BYTES),
        deadlineFailure,
      ]);
      return null;
    }
    const contentType = response.headers?.get?.('content-type')?.trim().toLowerCase() ?? '';
    if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/u.test(contentType)) {
      throw new AppleRevocationError('apple_revocation_response_invalid', { retryable: true });
    }
    let payload;
    try {
      const bytes = await Promise.race([
        readBoundedBody(response, PROVIDER_RESPONSE_MAX_BYTES),
        deadlineFailure,
      ]);
      payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    } catch (error) {
      if (error instanceof AppleRevocationError) throw error;
      throw new AppleRevocationError('apple_revocation_response_invalid', {
        retryable: true,
      });
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new AppleRevocationError('apple_revocation_response_invalid', { retryable: true });
    }
    return payload;
  } finally {
    clearTimeout(deadline);
  }
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
  const exchangeAuthorizationCode = async ({ code, expectedSubject }) => {
    const payload = await postForm(fetchImpl, `${APPLE_AUTH_ENDPOINT}/token`, {
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      client_secret: clientSecret(),
      ...(redirectUri ? { redirect_uri: redirectUri } : {}),
    });
    // The token response is accepted only over the fixed Apple HTTPS endpoint;
    // bind its identity claims to the already verified Firebase Apple subject.
    appleTokenResponseIdentity(payload?.id_token, expectedSubject, clientId);
    const refreshToken = boundedMaterial(payload?.refresh_token);
    if (!refreshToken) {
      throw new AppleRevocationError('apple_revocation_refresh_token_missing', {
        retryable: false,
      });
    }
    return refreshToken;
  };
  return Object.freeze({
    async exchangeAuthorizationCode({ code, expectedSubject }) {
      return exchangeAuthorizationCode({ code, expectedSubject });
    },
    async revoke({ kind, value }) {
      if (kind !== 'refresh_token') {
        throw new AppleRevocationError('apple_revocation_material_invalid', {
          retryable: false,
        });
      }
      const token = boundedMaterial(value);
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
      }, { expectJson: false });
    },
  });
}

export function createAppleRevocationProviderRing(configuration) {
  const entries = (configuration?.profiles ?? []).map((profile) => [
    profile.profileDigest,
    createAppleRevocationProvider(profile.providerConfiguration),
  ]);
  const byDigest = new Map(entries);
  return Object.freeze({
    forProfile(profile) {
      if (!profile || profile.materialKeyId !== configuration.profiles
        .find((entry) => entry.profileDigest === profile.profileDigest)?.materialKeyId) return null;
      return byDigest.get(profile.profileDigest) ?? null;
    },
  });
}

export const appleRevocationConstants = Object.freeze({
  materialMaxLength: MATERIAL_MAX_LENGTH,
  issuer: APPLE_ISSUER,
  providerDeadlineMs: PROVIDER_DEADLINE_MS,
  providerResponseMaxBytes: PROVIDER_RESPONSE_MAX_BYTES,
});

export const appleRevocationInternals = Object.freeze({ postForm });
