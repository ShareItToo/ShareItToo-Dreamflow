import test from 'node:test';
import assert from 'node:assert/strict';

import {
  emailVerificationCapabilities,
  routeNeedsVerifiedEmail,
  uploadNeedsVerifiedEmail,
} from '../src/email_verification_gate.js';

test('unverified sessions expose a limited, server-owned capability set', () => {
  assert.deepEqual(emailVerificationCapabilities(false), {
    emailVerified: false,
    limitedSession: true,
    canBrowse: true,
    canEditDrafts: true,
    canPublish: false,
    canCreateBindingBooking: false,
    canPay: false,
    canUseTrustActions: false,
  });
  assert.equal(emailVerificationCapabilities(true).limitedSession, false);
});

test('verification gate blocks binding/publication/trust mutations but preserves recovery and safety', () => {
  const blocked = [
    ['POST', '/v1/bookings/quote'],
    ['POST', '/v1/bookings'],
    ['POST', '/v1/rental-requests/sync'],
    ['POST', '/v1/payments/connect/onboarding'],
    ['POST', '/v1/bookings/booking-1/confirmation-challenges'],
    ['POST', '/v1/bookings/booking-1/transitions'],
    ['PATCH', '/v1/bookings/booking-1'],
    ['PATCH', '/v1/listings/listing-1/status'],
  ];
  for (const [method, path] of blocked) {
    assert.equal(routeNeedsVerifiedEmail({ method, path, body: { status: 'active' } }), true, `${method} ${path}`);
  }
  assert.equal(routeNeedsVerifiedEmail({
    method: 'POST',
    path: '/v1/listings',
    body: { status: 'draft' },
  }), false);
  assert.equal(routeNeedsVerifiedEmail({
    method: 'POST',
    path: '/v1/listings',
    body: {},
  }), true);
  assert.equal(routeNeedsVerifiedEmail({
    method: 'PUT',
    path: '/v1/listings/listing-1',
    listingIsActive: false,
    body: { status: 'draft' },
  }), false);
  assert.equal(routeNeedsVerifiedEmail({
    method: 'PUT',
    path: '/v1/listings/listing-1',
    listingIsActive: false,
    body: {},
  }), true);
  assert.equal(routeNeedsVerifiedEmail({ method: 'DELETE', path: '/v1/listings/listing-1' }), false);
  assert.equal(routeNeedsVerifiedEmail({
    method: 'PUT',
    path: '/v1/listings/listing-1/availability',
    listingIsActive: false,
  }), false);
  assert.equal(routeNeedsVerifiedEmail({
    method: 'PUT',
    path: '/v1/listings/listing-1/availability',
    listingIsActive: true,
  }), true);
  assert.equal(routeNeedsVerifiedEmail({ method: 'POST', path: '/v1/account/export' }), false);
  assert.equal(routeNeedsVerifiedEmail({ method: 'POST', path: '/v1/account/deletion' }), false);
  assert.equal(routeNeedsVerifiedEmail({ method: 'POST', path: '/v1/auth/password/change' }), false);
  assert.equal(routeNeedsVerifiedEmail({ method: 'POST', path: '/v1/auth/phone-verification/confirm' }), false);
  assert.equal(routeNeedsVerifiedEmail({ method: 'POST', path: '/v1/reports' }), false);
  assert.equal(routeNeedsVerifiedEmail({ method: 'PUT', path: '/v1/user-blocks/user-2' }), false);
  assert.equal(routeNeedsVerifiedEmail({ method: 'POST', path: '/v1/bookings/booking-1/handover-exceptions' }), false);
  assert.equal(routeNeedsVerifiedEmail({ method: 'GET', path: '/v1/financial-documents' }), false);
});

test('upload verification is purpose-aware', () => {
  assert.equal(uploadNeedsVerifiedEmail('listing_image'), false);
  assert.equal(uploadNeedsVerifiedEmail('profile_image'), false);
  assert.equal(uploadNeedsVerifiedEmail('message_attachment'), false);
  assert.equal(uploadNeedsVerifiedEmail('handover_evidence'), true);
  assert.equal(uploadNeedsVerifiedEmail('return_evidence'), true);
  assert.equal(uploadNeedsVerifiedEmail('condition_evidence'), true);
  assert.equal(uploadNeedsVerifiedEmail('damage_evidence'), true);
  assert.equal(uploadNeedsVerifiedEmail('report_evidence'), true);
});
