import crypto from 'node:crypto';

export function createEphemeralAcceptancePassword() {
  return `Aa9!${crypto.randomBytes(24).toString('base64url')}`;
}
