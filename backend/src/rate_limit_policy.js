import { rateLimit } from 'express-rate-limit';

import { isProtectedSupportSafetyIntake } from './support_safety_impact_domain.js';

export const coreRateLimitPolicies = Object.freeze({
  general: Object.freeze({ windowMs: 60_000, limit: 240 }),
  supportIntake: Object.freeze({ windowMs: 15 * 60_000, limit: 10 }),
  supportSafetyIntake: Object.freeze({ windowMs: 15 * 60_000, limit: 30 }),
});

const handoverExceptionPath = /^\/v1\/bookings\/[^/]+\/handover-exceptions$/u;

export function isProtectedSafetyRateLimitRequest(req) {
  if (req?.method !== 'POST') return false;
  const requestPath = typeof req.path === 'string' ? req.path : '';
  if (handoverExceptionPath.test(requestPath)) return true;
  return requestPath === '/v1/support/cases'
    && isProtectedSupportSafetyIntake(req.body);
}

function limiter(policy, handler, extra = {}) {
  return rateLimit({
    ...policy,
    ...extra,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler,
  });
}

export function createCoreRateLimiters({
  limitHandler,
  includeGeneralLimiter = true,
}) {
  if (typeof limitHandler !== 'function') {
    throw new TypeError('rate_limit_handler_required');
  }
  const generalLimiter = includeGeneralLimiter
    ? limiter(coreRateLimitPolicies.general, limitHandler, {
      // These exact routes are not unbounded: their dedicated 30-attempt limiter
      // executes before authentication and database work. Skipping only the
      // general bucket prevents unrelated traffic from making urgent intake
      // unreachable while preserving abuse protection.
      skip: isProtectedSafetyRateLimitRequest,
    })
    : null;
  const supportIntakeLimiter = limiter(
    coreRateLimitPolicies.supportIntake,
    limitHandler,
  );
  const supportSafetyIntakeLimiter = limiter(
    coreRateLimitPolicies.supportSafetyIntake,
    limitHandler,
  );
  const supportIntakeRateLimiter = (req, res, next) => (
    isProtectedSupportSafetyIntake(req.body)
      ? supportSafetyIntakeLimiter(req, res, next)
      : supportIntakeLimiter(req, res, next)
  );
  return Object.freeze({
    generalLimiter,
    supportIntakeLimiter,
    supportSafetyIntakeLimiter,
    supportIntakeRateLimiter,
  });
}
