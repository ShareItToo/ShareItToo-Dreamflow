import crypto from 'node:crypto';

export function identityVerificationProviderHash(providerSessionId) {
  return crypto.createHash('sha256')
    .update(`sit_identity_tombstone:v1:${providerSessionId}`)
    .digest('hex');
}
