import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyBookingFlowTimeAction,
  bookingFlowTimeSystemMessage,
  BookingFlowTimeError,
  normalizeBookingFlowTimeProposal,
  normalizeBookingFlowTimeState,
  updateBookingFlowTime,
} from '../src/booking_flow_time.js';

const base = Object.freeze({
  payload: { title: 'SIT Test' },
  ownerId: 'owner-1',
  renterId: 'renter-1',
  workflowStatus: 'accepted',
  rentalStartDate: '2026-10-14',
  rentalEndDate: '2026-10-16',
  rentalTimezone: 'Europe/Berlin',
});

test('counterparties share one authoritative pickup proposal and confirmation', () => {
  const proposal = applyBookingFlowTimeAction({
    ...base,
    actorId: 'owner-1',
    raw: {
      action: 'propose',
      segment: 'pickup',
      label: 'Samstag, 22:00',
      timeIso: '2026-10-14T20:00:00.000Z',
    },
  });
  assert.equal(proposal.state.handoverTimeRequested, 'Samstag, 22:00');
  assert.equal(proposal.state.handoverTimeRequestedByUserId, 'owner-1');
  assert.equal(proposal.state.handoverTimeConfirmed, false);
  assert.equal(
    proposal.systemMessage,
    '📦 Übergabezeit angefragt: Samstag, 22:00 Uhr',
  );

  const confirmation = applyBookingFlowTimeAction({
    ...base,
    payload: proposal.payload,
    actorId: 'renter-1',
    raw: { action: 'confirm', segment: 'pickup' },
    now: new Date('2026-08-15T12:00:00.000Z'),
  });
  assert.equal(confirmation.state.handoverTimeConfirmed, true);
  assert.equal(confirmation.state.handoverTimeConfirmedByUserId, 'renter-1');
  assert.equal(confirmation.state.handoverTimeConfirmedAt, '2026-08-15T12:00:00.000Z');
  assert.equal(confirmation.state.flowTimeRevision, 2);
  assert.equal(
    confirmation.systemMessage,
    '📦 Übergabezeit bestätigt: Samstag, 22:00 Uhr',
  );
});

test('changed return proposal has an accurate server-authored message', () => {
  assert.equal(bookingFlowTimeSystemMessage({
    action: 'propose',
    segment: 'return',
    changed: true,
    state: { returnTimeRequested: 'Freitag, 10:00' },
  }), '🔄 Rückgabezeit geändert: Freitag, 10:00 Uhr');
});

test('canonical local proposal survives UTC date rollover and authors its label', () => {
  const normalized = normalizeBookingFlowTimeProposal({
    rentalStartDate: '2026-11-20',
    rentalEndDate: '2026-11-22',
    rentalTimezone: 'Europe/Berlin',
    raw: {
      action: 'propose',
      segment: 'pickup',
      localDate: '2026-11-20',
      localTime: '10:15',
      label: 'untrusted label',
      timeIso: '2026-11-19T10:15:00.000Z',
    },
  });
  assert.equal(normalized.label, 'Freitag, 10:15');
  assert.equal(normalized.timeIso, '2026-11-20T09:15:00.000Z');
});

test('canonical local proposal is DST-safe and cannot cross its booking date', () => {
  const spring = normalizeBookingFlowTimeProposal({
    rentalStartDate: '2026-03-29',
    rentalEndDate: '2026-03-30',
    rentalTimezone: 'Europe/Berlin',
    raw: {
      action: 'propose', segment: 'pickup',
      localDate: '2026-03-29', localTime: '03:30',
    },
  });
  assert.equal(spring.timeIso, '2026-03-29T01:30:00.000Z');
  assert.throws(
    () => normalizeBookingFlowTimeProposal({
      rentalStartDate: '2026-03-29',
      rentalEndDate: '2026-03-30',
      rentalTimezone: 'Europe/Berlin',
      raw: {
        action: 'propose', segment: 'pickup',
        localDate: '2026-03-28', localTime: '23:00',
      },
    }),
    (error) => error instanceof BookingFlowTimeError
      && error.code === 'flow_time_outside_booking_date',
  );
});

test('flow-time mutation writes one atomic system message to the booking thread', async () => {
  const writes = [];
  const client = {
    async query(sql, params = []) {
      if (sql.includes('FROM bookings AS booking')) {
        return {
          rowCount: 1,
          rows: [{
            id: 'booking-1',
            owner_id: 'owner-1',
            renter_id: 'renter-1',
            workflow_status: 'accepted',
            workflow_version: 1,
            rental_start_date_text: '2026-10-14',
            rental_end_date_text: '2026-10-16',
            rental_timezone: 'Europe/Berlin',
            payload: {},
          }],
        };
      }
      if (sql.includes('FROM booking_events')) return { rowCount: 0, rows: [] };
      if (sql.includes('FROM message_threads')) {
        return { rowCount: 1, rows: [{ id: 'thread-1' }] };
      }
      writes.push({ sql, params });
      return { rowCount: 1, rows: [] };
    },
  };
  const result = await updateBookingFlowTime(client, {
    actor: { id: 'owner-1' },
    bookingId: 'booking-1',
    idempotencyKey: 'flow-time-test-0001',
    raw: {
      action: 'propose',
      segment: 'pickup',
      label: 'Mittwoch, 10:00',
      timeIso: '2026-10-14T08:00:00.000Z',
    },
  });
  assert.equal(result.replayed, false);
  const messageWrite = writes.find(({ sql }) => sql.includes('INSERT INTO messages'));
  assert.ok(messageWrite);
  assert.equal(messageWrite.params[1], 'thread-1');
  assert.equal(messageWrite.params[2], '📦 Übergabezeit angefragt: Mittwoch, 10:00 Uhr');
  assert.equal(messageWrite.params[3], 'system:flow-time:flow-time-test-0001');
  assert.equal(writes.filter(({ sql }) => sql.includes('INSERT INTO messages')).length, 1);
});

test('flow-time idempotency replay never writes a duplicate system message', async () => {
  const writes = [];
  const client = {
    async query(sql) {
      if (sql.includes('FROM bookings AS booking')) {
        return {
          rowCount: 1,
          rows: [{
            id: 'booking-1',
            owner_id: 'owner-1',
            renter_id: 'renter-1',
            workflow_status: 'accepted',
            workflow_version: 1,
            rental_start_date_text: '2026-10-14',
            rental_end_date_text: '2026-10-16',
            rental_timezone: 'Europe/Berlin',
            payload: { handoverTimeRequested: 'Mittwoch, 10:00' },
          }],
        };
      }
      if (sql.includes('FROM booking_events')) {
        return {
          rowCount: 1,
          rows: [{
            booking_id: 'booking-1',
            actor_id: 'owner-1',
            metadata: {},
          }],
        };
      }
      writes.push(sql);
      return { rowCount: 1, rows: [] };
    },
  };
  const result = await updateBookingFlowTime(client, {
    actor: { id: 'owner-1' },
    bookingId: 'booking-1',
    idempotencyKey: 'flow-time-test-replay-0001',
    raw: {
      action: 'propose',
      segment: 'pickup',
      label: 'Mittwoch, 10:00',
      timeIso: '2026-10-14T08:00:00.000Z',
    },
  });
  assert.equal(result.replayed, true);
  assert.equal(writes.length, 0);
});

test('requester cannot confirm their own proposal', () => {
  assert.throws(
    () => applyBookingFlowTimeAction({
      ...base,
      payload: {
        handoverTimeRequested: 'Samstag, 22:00',
        handoverTimeIso: '2026-10-14T22:00:00.000Z',
        handoverTimeRequestedByUserId: 'owner-1',
      },
      actorId: 'owner-1',
      raw: { action: 'confirm', segment: 'pickup' },
    }),
    (error) => error instanceof BookingFlowTimeError
      && error.code === 'flow_time_counterparty_confirmation_required',
  );
});

test('flow-time proposal must stay on the booking segment date', () => {
  assert.throws(
    () => applyBookingFlowTimeAction({
      ...base,
      actorId: 'owner-1',
      raw: {
        action: 'propose',
        segment: 'pickup',
        label: 'Dienstag, 22:00',
        timeIso: '2026-10-13T20:00:00.000Z',
      },
    }),
    (error) => error instanceof BookingFlowTimeError
      && error.code === 'flow_time_outside_booking_date',
  );
});

test('outsiders cannot read or mutate normalized flow-time state', () => {
  assert.throws(
    () => applyBookingFlowTimeAction({
      ...base,
      actorId: 'outsider-1',
      raw: {
        action: 'propose',
        segment: 'return',
        label: 'Freitag, 10:00',
        timeIso: '2026-10-16T10:00:00.000Z',
      },
    }),
    (error) => error instanceof BookingFlowTimeError
      && error.code === 'booking_flow_time_forbidden',
  );
});

test('normalization does not expose unrelated booking payload fields', () => {
  const state = normalizeBookingFlowTimeState({
    title: 'private title',
    handoverTimeRequested: 'Samstag, 22:00',
    flowTimeRevision: 4,
  });
  assert.equal(state.handoverTimeRequested, 'Samstag, 22:00');
  assert.equal(state.flowTimeRevision, 4);
  assert.equal(Object.hasOwn(state, 'title'), false);
});
