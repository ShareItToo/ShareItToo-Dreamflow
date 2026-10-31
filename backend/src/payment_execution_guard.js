import { PaymentDomainError } from './payment_domain.js';

export function stripeSandboxExecutionActive(configuration, now = new Date()) {
  if (configuration?.payments?.transport !== 'stripe'
      || configuration?.payments?.livemode === true) {
    return true;
  }
  const current = now instanceof Date ? now : new Date(now);
  const issuedAt = new Date(configuration.payments.sandboxAuthorization?.issuedAt ?? '');
  const expiresAt = new Date(configuration.payments.sandboxAuthorization?.expiresAt ?? '');
  return Number.isFinite(current.getTime())
    && Number.isFinite(issuedAt.getTime())
    && Number.isFinite(expiresAt.getTime())
    && issuedAt <= current
    && current < expiresAt
    && expiresAt.getTime() - issuedAt.getTime() <= 24 * 60 * 60 * 1000
    && configuration.payments.pilotUserIds.length > 0;
}

export function assertPaymentExecutionActive(configuration, now = new Date()) {
  if (!stripeSandboxExecutionActive(configuration, now)) {
    throw new PaymentDomainError(503, 'payment_sandbox_authorization_expired');
  }
}

export function boundedPaymentCheckoutExpiresAt(configuration, {
  now = new Date(),
  requestedLifetimeMs = 45 * 60_000,
  minimumLifetimeMs = 31 * 60_000,
} = {}) {
  const current = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(current.getTime())
      || !Number.isSafeInteger(requestedLifetimeMs)
      || !Number.isSafeInteger(minimumLifetimeMs)
      || requestedLifetimeMs < minimumLifetimeMs
      || minimumLifetimeMs <= 0) {
    throw new PaymentDomainError(500, 'payment_checkout_expiry_invalid');
  }
  assertPaymentExecutionActive(configuration, current);
  const requestedExpiry = new Date(current.getTime() + requestedLifetimeMs);
  if (configuration?.payments?.transport !== 'stripe'
      || configuration?.payments?.livemode === true) {
    return requestedExpiry;
  }
  const authorizationExpiry = new Date(
    configuration.payments.sandboxAuthorization?.expiresAt ?? '',
  );
  const boundedExpiry = authorizationExpiry < requestedExpiry
    ? authorizationExpiry
    : requestedExpiry;
  if (!Number.isFinite(boundedExpiry.getTime())
      || boundedExpiry.getTime() - current.getTime() < minimumLifetimeMs) {
    throw new PaymentDomainError(503, 'payment_sandbox_authorization_too_short');
  }
  return boundedExpiry;
}
