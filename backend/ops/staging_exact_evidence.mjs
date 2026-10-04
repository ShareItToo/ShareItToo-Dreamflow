import crypto from 'node:crypto';

export function serializeExactEvidence(value) {
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
  return Object.freeze({
    bytes,
    byteCount: bytes.byteLength,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
  });
}
