import assert from 'node:assert/strict';
import test from 'node:test';

import {
  v51DisabledTransportCode,
  v51ZeroTransportQuote,
} from '../src/v51_transport_domain.js';

test('V5.1 launch quote contains no delivery, return pickup or express fee', () => {
  assert.deepEqual(v51ZeroTransportQuote(), {
    deliveryFeeMinor: 0,
    pickupFeeMinor: 0,
  });
  assert.equal(v51DisabledTransportCode({
    ownerDeliversAtDropoffChosen: false,
    ownerPicksUpAtReturnChosen: false,
    expressRequested: false,
  }), null);
});

test('V5.1 launch rejects delivery service requests', () => {
  assert.equal(
    v51DisabledTransportCode({ ownerDeliversAtDropoffChosen: true }),
    'delivery_booking_not_enabled',
  );
});

test('V5.1 launch rejects return pickup service requests', () => {
  assert.equal(
    v51DisabledTransportCode({ ownerPicksUpAtReturnChosen: true }),
    'pickup_booking_not_enabled',
  );
});

test('V5.1 launch rejects express requests', () => {
  assert.equal(
    v51DisabledTransportCode({ expressRequested: true }),
    'express_booking_not_enabled',
  );
});
