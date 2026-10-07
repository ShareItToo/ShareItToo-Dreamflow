import assert from 'node:assert/strict';
import test from 'node:test';

import {
  bookingAddressAuditMetadata,
  BookingAddressRevealError,
  evaluateBookingAddressReveal,
} from '../src/booking_address_reveal_domain.js';
import { getBookingAddressReveal } from '../src/booking_address_reveal_workflow.js';

const confirmedPickup = Object.freeze({
  handoverTimeIso: '2026-10-14T16:00:00.000Z',
  handoverTimeRequestedByUserId: 'owner-1',
  handoverTimeConfirmed: true,
  handoverTimeConfirmedByUserId: 'renter-1',
  handoverTimeConfirmedAt: '2026-10-14T08:30:00.000Z',
});

const base = Object.freeze({
  ownerId: 'owner-1',
  renterId: 'renter-1',
  workflowStatus: 'confirmed',
  rentalStartDate: '2026-10-14',
  rentalEndDate: '2026-10-16',
  rentalTimezone: 'Europe/Berlin',
  flowTimePayload: confirmedPickup,
  segment: 'pickup',
  safetyHold: false,
  exactAddress: 'Musterweg 7, 10115 Berlin',
});

test('exact address stays hidden before the confirmed appointment six-hour window', () => {
  const visibility = evaluateBookingAddressReveal({
    ...base,
    now: new Date('2026-10-14T09:59:59.999Z'),
  });
  assert.equal(visibility.result, 'hidden');
  assert.equal(visibility.reason, 'reveal_window_not_open');
  assert.equal(visibility.revealFromAt, '2026-10-14T10:00:00.000Z');
  assert.equal(Object.hasOwn(visibility, 'exactAddress'), false);
});

test('late counterparty confirmation reveals immediately inside the six-hour window', () => {
  const visibility = evaluateBookingAddressReveal({
    ...base,
    now: new Date('2026-10-14T10:00:00.000Z'),
  });
  assert.equal(visibility.result, 'revealed');
  assert.equal(visibility.exactAddress, 'Musterweg 7, 10115 Berlin');
  assert.equal(visibility.exactAddressReturned, true);
});

test('self-confirmation, wrong booking date and safety hold fail closed', () => {
  for (const flowTimePayload of [
    { ...confirmedPickup, handoverTimeConfirmedByUserId: 'owner-1' },
    { ...confirmedPickup, handoverTimeIso: '2026-10-13T16:00:00.000Z' },
  ]) {
    const visibility = evaluateBookingAddressReveal({
      ...base,
      flowTimePayload,
      now: new Date('2026-10-14T12:00:00.000Z'),
    });
    assert.equal(visibility.reason, 'appointment_not_counterparty_confirmed');
    assert.equal(Object.hasOwn(visibility, 'exactAddress'), false);
  }
  const held = evaluateBookingAddressReveal({
    ...base,
    safetyHold: true,
    now: new Date('2026-10-14T12:00:00.000Z'),
  });
  assert.equal(held.reason, 'safety_review_required');
  assert.equal(Object.hasOwn(held, 'exactAddress'), false);
});

test('invalid address segment is rejected', () => {
  assert.throws(
    () => evaluateBookingAddressReveal({ ...base, segment: 'delivery' }),
    (error) => error instanceof BookingAddressRevealError
      && error.code === 'booking_address_segment_invalid',
  );
});

test('audit metadata is minimized and never contains the exact address', () => {
  const visibility = evaluateBookingAddressReveal({
    ...base,
    now: new Date('2026-10-14T12:00:00.000Z'),
  });
  const metadata = bookingAddressAuditMetadata({
    visibility,
    workflowStatus: 'confirmed',
    safetyHold: false,
  });
  assert.deepEqual(Object.keys(metadata).sort(), [
    'appointmentAt',
    'exactAddressReturned',
    'reason',
    'result',
    'revealFromAt',
    'safetyHold',
    'segment',
    'version',
    'workflowStatus',
  ]);
  assert.equal(JSON.stringify(metadata).includes('Musterweg'), false);
});

function participantClient({ actorId = 'renter-1', safetyHold = false } = {}) {
  const audits = [];
  return {
    audits,
    async query(sql, values = []) {
      const compact = sql.replace(/\s+/g, ' ').trim();
      if (compact.startsWith('SELECT booking.id, booking.owner_id')) {
        return {
          rowCount: 1,
          rows: [{
            id: 'booking-1',
            owner_id: 'owner-1',
            renter_id: 'renter-1',
            workflow_status: 'confirmed',
            workflow_version: 1,
            rental_start_date_text: '2026-10-14',
            rental_end_date_text: '2026-10-16',
            rental_timezone: 'Europe/Berlin',
            payload: confirmedPickup,
            listing_id: 'listing-1',
            location_text: 'Musterweg 7, 10115 Berlin',
          }],
        };
      }
      if (compact.startsWith('SELECT ( EXISTS')) {
        return { rowCount: 1, rows: [{ held: safetyHold }] };
      }
      if (compact.startsWith('INSERT INTO audit_log')) {
        audits.push({ values, actorId });
        return { rowCount: 1, rows: [] };
      }
      throw new Error(`unexpected query: ${compact}`);
    },
  };
}

test('workflow returns the exact address only to a participant and writes a minimized audit', async () => {
  const client = participantClient();
  const result = await getBookingAddressReveal(client, {
    actor: { id: 'renter-1', role: 'user' },
    bookingId: 'booking-1',
    segment: 'pickup',
    requestId: 'request-address-1',
    now: new Date('2026-10-14T12:00:00.000Z'),
  });
  assert.equal(result.denied, false);
  assert.equal(result.visibility.exactAddress, 'Musterweg 7, 10115 Berlin');
  assert.equal(client.audits.length, 1);
  assert.equal(client.audits[0].values[2], 'booking.exact_address_revealed');
  assert.equal(client.audits[0].values[5].includes('Musterweg'), false);
});

test('workflow gives an outsider no booking metadata and still audits the attempt', async () => {
  const client = participantClient({ actorId: 'outsider-1' });
  const result = await getBookingAddressReveal(client, {
    actor: { id: 'outsider-1', role: 'user' },
    bookingId: 'booking-1',
    segment: 'pickup',
    requestId: 'request-address-2',
  });
  assert.equal(result.denied, true);
  assert.deepEqual(result.visibility, {
    version: 'v52_booking_address_reveal_v1',
    segment: 'pickup',
    result: 'denied',
    reason: 'not_found_or_not_participant',
    exactAddressReturned: false,
  });
  assert.equal(client.audits[0].values[2], 'booking.exact_address_access_denied');
});
