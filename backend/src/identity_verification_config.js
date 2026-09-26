const ALLOWED_TRANSPORTS = new Set(['disabled', 'memory', 'stripe']);
const SYNTHETIC_ENVIRONMENTS = new Set(['staging', 'test']);

export function normalizeIdentityVerificationTransport(value, deploymentEnvironment) {
  const transport = (value ?? 'disabled').trim().toLowerCase();
  if (!ALLOWED_TRANSPORTS.has(transport)) {
    throw new Error('IDENTITY_VERIFICATION_TRANSPORT must be disabled, memory, or stripe');
  }
  if (transport === 'memory' && !SYNTHETIC_ENVIRONMENTS.has(deploymentEnvironment)) {
    throw new Error('memory identity verification is restricted to staging or test');
  }
  return transport;
}
