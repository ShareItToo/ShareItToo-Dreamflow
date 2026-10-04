import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertSyntheticCloneLoopbackBinding,
  createSyntheticCloneBookingLane,
  SYNTHETIC_CLONE_BOOKING_ROUTE_PREFIX,
  SYNTHETIC_CLONE_NON_BINDING_MARKER,
  SYNTHETIC_CLONE_PRINCIPALS,
  SyntheticCloneBookingLaneError,
} from '../src/synthetic_clone_booking_lane.js';

const ownerId = '00000000-0000-4000-8000-000000000001';
const renterId = '00000000-0000-4000-8000-000000000002';
const listingId = SYNTHETIC_CLONE_PRINCIPALS.listingId;

function lane(overrides = {}) {
  return createSyntheticCloneBookingLane({
    enabled: true,
    deploymentEnvironment: 'test',
    targetKind: 'clone',
    datasetId: 'wp255-green-clone-booking-lane',
    runId: 'wp255-20260929090000-a1b2c3d4',
    ownerId,
    renterId,
    secret: 'synthetic-clone-test-secret-20260929-0123456789',
    ...overrides,
  });
}

function errorCode(fn) {
  assert.throws(fn, (error) => error instanceof SyntheticCloneBookingLaneError);
  try {
    fn();
  } catch (error) {
    return error.code;
  }
  return null;
}

test('clone startup requires the exact loopback bind host and stays inert when disabled', () => {
  assert.equal(assertSyntheticCloneLoopbackBinding({ enabled: false, bindHost: '0.0.0.0' }), false);
  assert.equal(assertSyntheticCloneLoopbackBinding({ enabled: true, bindHost: '127.0.0.1' }), true);
  assert.equal(errorCode(() => assertSyntheticCloneLoopbackBinding({ enabled: true, bindHost: '0.0.0.0' })), 'synthetic_clone_loopback_required');
  assert.equal(errorCode(() => assertSyntheticCloneLoopbackBinding({ enabled: true, bindHost: '::1' })), 'synthetic_clone_loopback_required');
});

test('clone startup guard runs before database, mailer, and lane activation', () => {
  const serverSource = fs.readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
  const guardOffset = serverSource.indexOf('assertSyntheticCloneLoopbackBinding({');
  const databaseOffset = serverSource.indexOf('await initializeDatabase();');
  const mailerOffset = serverSource.indexOf('await verifyMailer();');
  const laneActivationOffset = serverSource.indexOf('const syntheticCloneBookingLane = syntheticCloneEnabled');

  assert.ok(guardOffset >= 0);
  assert.ok(guardOffset < databaseOffset);
  assert.ok(guardOffset < mailerOffset);
  assert.ok(guardOffset < laneActivationOffset);
});

test('clone lane requires explicit test clone identity and exact distinct principals', () => {
  assert.throws(() => createSyntheticCloneBookingLane(), /synthetic_clone_lane_disabled/u);
  assert.throws(() => lane({ targetKind: 'green' }), /synthetic_clone_target_required/u);
  assert.throws(() => lane({ deploymentEnvironment: 'staging' }), /synthetic_clone_test_environment_required/u);
  assert.throws(() => lane({ ownerId: renterId }), /synthetic_clone_principals_invalid/u);
  assert.throws(() => lane({ renterId: ownerId }), /synthetic_clone_principals_invalid/u);
  assert.throws(() => lane({ secret: undefined }), /synthetic_clone_secret_invalid/u);
});

test('full synthetic non-binding booking lifecycle supports QR-v3 and six-digit fallback', () => {
  const service = lane();
  const listing = service.getListing({ actorId: renterId, requestedListingId: listingId });
  assert.equal(listing.ownerId, ownerId);
  assert.deepEqual(listing.marker, SYNTHETIC_CLONE_NON_BINDING_MARKER);
  const created = service.createBooking({ actorId: renterId, listingId });
  assert.equal(created.status, 'requested');
  assert.deepEqual(created.marker, SYNTHETIC_CLONE_NON_BINDING_MARKER);
  assert.equal(created.listing.ownerId, ownerId);
  assert.equal(created.listing.id, listingId);

  const accepted = service.acceptBooking({ actorId: ownerId, bookingId: created.id });
  assert.equal(accepted.status, 'accepted');

  for (const slot of ['overview', 'detail', 'accessories', 'critical']) {
    service.addPhoto({ actorId: ownerId, bookingId: created.id, segment: 'pickup', slot });
  }
  const pickupChallenge = service.issueChallenge({ actorId: ownerId, bookingId: created.id, segment: 'pickup' });
  assert.match(pickupChallenge.qrPayload, /^shareittoo:v3:pickup:owner:/u);
  assert.match(pickupChallenge.fallbackCode, /^\d{6}$/u);
  const afterPickup = service.verifyChallenge({
    actorId: renterId,
    bookingId: created.id,
    raw: { qrPayload: pickupChallenge.qrPayload },
  });
  assert.equal(afterPickup.confirmation.method, 'qr-v3');
  assert.equal(afterPickup.booking.status, 'active');

  for (const slot of ['overview', 'detail', 'accessories', 'critical']) {
    service.addPhoto({ actorId: renterId, bookingId: created.id, segment: 'return', slot });
  }
  const returnChallenge = service.issueChallenge({ actorId: renterId, bookingId: created.id, segment: 'return' });
  const afterReturn = service.verifyChallenge({
    actorId: ownerId,
    bookingId: created.id,
    raw: {
      challengeId: returnChallenge.id,
      segment: 'return',
      presenterRole: 'renter',
      code: returnChallenge.fallbackCode,
    },
  });
  assert.equal(afterReturn.confirmation.method, 'six_digit_fallback');
  assert.equal(afterReturn.booking.status, 'returned');
  assert.equal(afterReturn.booking.photos.pickup.length, 4);
  assert.equal(afterReturn.booking.photos.return.length, 4);
  assert.equal(afterReturn.booking.marker.binding, 'non-binding');
  assert.equal(afterReturn.booking.returnCompletedAt != null, true);

  const status = service.status();
  assert.deepEqual(status.sideEffects, {
    platformContract: false,
    c2cContract: false,
    payment: false,
    payout: false,
    stripe: false,
    review: false,
    ranking: false,
    notification: false,
  });
  assert.ok(status.auditEventCount >= 13);
});

test('clone lane rejects non-allowlisted, cross-role and incomplete operations', () => {
  const service = lane();
  assert.throws(() => service.createBooking({ actorId: 'normal-user', listingId }), (error) => error.code === 'synthetic_clone_principal_not_allowlisted');
  const created = service.createBooking({ actorId: renterId, listingId });
  assert.throws(() => service.acceptBooking({ actorId: renterId, bookingId: created.id }), (error) => error.code === 'synthetic_clone_owner_required');
  assert.throws(() => service.addPhoto({ actorId: renterId, bookingId: created.id, segment: 'pickup', slot: 'overview' }), (error) => error.code === 'synthetic_clone_presenter_required');
  service.acceptBooking({ actorId: ownerId, bookingId: created.id });
  service.addPhoto({ actorId: ownerId, bookingId: created.id, segment: 'pickup', slot: 'overview' });
  assert.throws(() => service.issueChallenge({ actorId: ownerId, bookingId: created.id, segment: 'pickup' }), (error) => error.code === 'synthetic_clone_photo_set_incomplete');
  assert.throws(() => service.addPhoto({ actorId: ownerId, bookingId: created.id, segment: 'pickup', slot: 'overview' }), (error) => error.code === 'synthetic_clone_photo_slot_duplicate');
  assert.equal(errorCode(() => service.getBooking({ actorId: 'normal-user', bookingId: created.id })), 'synthetic_clone_principal_not_allowlisted');
});

test('QR and fallback verification fail closed on tamper, crossover and replay', () => {
  const service = lane();
  const created = service.createBooking({ actorId: renterId, listingId });
  service.acceptBooking({ actorId: ownerId, bookingId: created.id });
  for (const slot of ['overview', 'detail', 'accessories', 'critical']) {
    service.addPhoto({ actorId: ownerId, bookingId: created.id, segment: 'pickup', slot });
  }
  const challenge = service.issueChallenge({ actorId: ownerId, bookingId: created.id, segment: 'pickup' });
  assert.throws(() => service.verifyChallenge({ actorId: ownerId, bookingId: created.id, raw: { qrPayload: challenge.qrPayload } }), (error) => error.code === 'synthetic_clone_verifier_required');
  assert.throws(() => service.verifyChallenge({ actorId: renterId, bookingId: created.id, raw: { challengeId: challenge.id, segment: 'pickup', presenterRole: 'owner', code: '000000' } }), (error) => error.code === 'synthetic_clone_confirmation_invalid');
  const verified = service.verifyChallenge({ actorId: renterId, bookingId: created.id, raw: { qrPayload: challenge.qrPayload } });
  assert.equal(verified.booking.status, 'active');
  assert.throws(() => service.verifyChallenge({ actorId: renterId, bookingId: created.id, raw: { qrPayload: challenge.qrPayload } }), (error) => error.code === 'synthetic_clone_confirmation_invalid');
});

test('cleanup removes all lane resources while retaining an auditable cleanup proof', () => {
  const service = lane();
  const created = service.createBooking({ actorId: renterId, listingId });
  const result = service.cleanup({ actorId: ownerId });
  assert.equal(result.cleanupVerified, true);
  assert.equal(result.remainingResources.bookings, 0);
  assert.equal(result.remainingResources.listings, 0);
  assert.equal(result.remainingResources.photos, 0);
  assert.equal(result.remainingResources.challenges, 0);
  assert.equal(result.auditRetained, true);
  assert.equal(service.status().bookings, 0);
  assert.throws(() => service.getBooking({ actorId: ownerId, bookingId: created.id }), (error) => error.code === 'synthetic_clone_booking_not_found');
  assert.throws(() => service.createBooking({ actorId: renterId, listingId }), (error) => error.code === 'synthetic_clone_lane_cleaned');
  assert.ok(service.status().auditEventCount >= 3);
});

test('route registration is explicitly namespaced and isolated from normal booking routes', () => {
  assert.match(SYNTHETIC_CLONE_BOOKING_ROUTE_PREFIX, /^\/v1\/synthetic-clone\/bookings$/u);
});
