import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BookingConfirmationError,
  assertConfirmationPresenter,
  assertConfirmationWorkflowState,
  confirmationActorRole,
  confirmationCode,
  confirmationDigest,
  confirmationDigestMatches,
  confirmationQrPayload,
  counterpartRole,
  parseConfirmationQrPayload,
} from '../src/booking_confirmation_domain.js';

const secret = 'test-confirmation-secret-that-is-long-enough';
const challengeId = '01234567-89ab-4def-8123-456789abcdef';

test('confirmation code is exactly six digits and honors the secure source', () => {
  assert.equal(confirmationCode(() => 100000), '100000');
  assert.equal(confirmationCode(() => 999999), '999999');
});

test('digest binds code to challenge booking segment and role', () => {
  const base = {
    secret,
    challengeId,
    bookingId: 'booking-1',
    segment: 'pickup',
    presenterRole: 'owner',
    code: '345678',
  };
  const digest = confirmationDigest(base);
  assert.equal(digest.length, 64);
  assert.equal(confirmationDigestMatches(digest, confirmationDigest(base)), true);
  assert.equal(confirmationDigestMatches(digest, confirmationDigest({ ...base, code: '345679' })), false);
  assert.equal(confirmationDigestMatches(digest, confirmationDigest({ ...base, segment: 'return' })), false);
  assert.equal(confirmationDigestMatches(digest, confirmationDigest({ ...base, presenterRole: 'renter' })), false);
});

test('v3 QR round-trip keeps all server-verifiable bindings', () => {
  const payload = confirmationQrPayload({
    challengeId,
    bookingId: 'booking-1',
    segment: 'return',
    presenterRole: 'renter',
    code: '654321',
  });
  assert.deepEqual(parseConfirmationQrPayload(payload), {
    challengeId,
    bookingId: 'booking-1',
    segment: 'return',
    presenterRole: 'renter',
    code: '654321',
  });
  assert.throws(
    () => parseConfirmationQrPayload(payload.replace('booking-1', 'booking:1')),
    (error) => error instanceof BookingConfirmationError && error.code === 'invalid_confirmation_payload',
  );
});

test('only booking participants resolve to a confirmation role', () => {
  assert.equal(confirmationActorRole({ actorId: 'o', ownerId: 'o', renterId: 'r' }), 'owner');
  assert.equal(confirmationActorRole({ actorId: 'r', ownerId: 'o', renterId: 'r' }), 'renter');
  assert.equal(counterpartRole('owner'), 'renter');
  assert.throws(
    () => confirmationActorRole({ actorId: 'x', ownerId: 'o', renterId: 'r' }),
    (error) => error instanceof BookingConfirmationError && error.status === 403,
  );
});

test('pickup can only be presented by owner and return only by renter', () => {
  assert.equal(
    assertConfirmationPresenter({ segment: 'pickup', presenterRole: 'owner' }),
    'owner',
  );
  assert.equal(
    assertConfirmationPresenter({ segment: 'return', presenterRole: 'renter' }),
    'renter',
  );
  assert.throws(
    () => assertConfirmationPresenter({
      segment: 'return',
      presenterRole: 'owner',
    }),
    (error) => error instanceof BookingConfirmationError
      && error.code === 'confirmation_presenter_role_invalid',
  );
});

test('pickup and return challenges fail closed outside their workflow states', () => {
  assert.equal(assertConfirmationWorkflowState({ segment: 'pickup', workflowStatus: 'accepted' }), true);
  assert.equal(assertConfirmationWorkflowState({ segment: 'return', workflowStatus: 'active' }), true);
  assert.throws(
    () => assertConfirmationWorkflowState({ segment: 'return', workflowStatus: 'accepted' }),
    (error) => error instanceof BookingConfirmationError && error.code === 'confirmation_not_available',
  );
});
