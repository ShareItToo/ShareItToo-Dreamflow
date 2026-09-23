export const emailVerificationRequiredCode = 'email_verification_required';

const VERIFIED_UPLOAD_PURPOSES = new Set([
  'handover_evidence',
  'return_evidence',
  'report_evidence',
  'condition_evidence',
  'damage_evidence',
]);

export function emailVerificationCapabilities(emailVerified) {
  const verified = emailVerified === true;
  return Object.freeze({
    emailVerified: verified,
    limitedSession: !verified,
    canBrowse: true,
    canEditDrafts: true,
    canPublish: verified,
    canCreateBindingBooking: verified,
    canPay: verified,
    canUseTrustActions: verified,
  });
}

function pathMatches(path, pattern) {
  return pattern.test(path);
}

export function routeNeedsVerifiedEmail({
  method,
  path,
  body = {},
  listingIsActive = null,
} = {}) {
  const verb = String(method ?? '').toUpperCase();
  const route = String(path ?? '');
  const explicitNonActiveListing = ['draft', 'paused', 'ended'].includes(body?.status)
    || body?.isActive === false;
  if (verb === 'POST' && route === '/v1/listings') {
    // normalizeListingPayload defaults omitted status/isActive to active. Fail closed
    // unless the client explicitly requests a non-public state.
    return !explicitNonActiveListing;
  }
  if (verb === 'PUT' && pathMatches(route, /^\/v1\/listings\/[^/]+$/u)) {
    return listingIsActive === true || !explicitNonActiveListing;
  }
  if (verb === 'PATCH' && pathMatches(route, /^\/v1\/listings\/[^/]+\/status$/u)) {
    return body?.status === 'active' || body?.isActive === true;
  }
  if (verb === 'PUT' && pathMatches(route, /^\/v1\/listings\/[^/]+\/availability$/u)) {
    return listingIsActive !== false;
  }
  if (verb === 'POST' && pathMatches(route, /^\/v1\/blue-ocean\/listing-drafts\/[^/]+\/publish$/u)) return true;

  if (verb !== 'GET' && (pathMatches(route, /^\/v1\/payments(?:\/|$)/u)
      || pathMatches(route, /^\/v1\/bookings\/[^/]+\/payment(?:\/|$)/u)
      || route === '/v1/payments/capabilities'
      || route === '/v1/financial-documents'
      || pathMatches(route, /^\/v1\/financial-documents\//u))) return true;

  if (pathMatches(route, /^\/v1\/bookings\/quote$/u)
      || pathMatches(route, /^\/v1\/bookings$/u)
      || pathMatches(route, /^\/v1\/booking-groups(?:\/|$)/u)
      || pathMatches(route, /^\/v1\/bookings\/[^/]+\/(?:transitions|flow-time|confirmation-challenges|condition-confirmations|return-cases|actual-loss|reviews)(?:\/|$)/u)
      || (verb === 'PATCH' && pathMatches(route, /^\/v1\/bookings\/[^/]+$/u))
      || pathMatches(route, /^\/v1\/bookings\/[^/]+\/address-reveal$/u)
      || pathMatches(route, /^\/v1\/rental-requests\/sync$/u)
      ) return true;

  if (pathMatches(route, /^\/v1\/identity-verification\/(?:session|refresh|revoke)$/u)
      ) return true;
  return false;
}

export function uploadNeedsVerifiedEmail(purpose) {
  return VERIFIED_UPLOAD_PURPOSES.has(String(purpose ?? '').trim());
}
