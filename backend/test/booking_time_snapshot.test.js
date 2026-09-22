import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  BookingTimeSnapshotError,
  assertSameBookingTimeSnapshot,
  bookingTimeSnapshotVersion,
  normalizeBookingTimeSnapshot,
} from '../src/booking_time_snapshot.js';
import { assertBookingContractTimeSnapshot } from '../src/booking_workflow.js';
import { applyBookingFlowTimeAction } from '../src/booking_flow_time.js';
import { evaluateBookingAddressReveal } from '../src/booking_address_reveal_domain.js';

const base = {
  rentalStartDate: '2026-03-29',
  rentalEndDate: '2026-03-30',
  rentalTimezone: 'Europe/Berlin',
};

test('exact snapshot is canonicalized across DST with explicit offsets', () => {
  const snapshot = normalizeBookingTimeSnapshot({
    ...base,
    raw: {
      timeSnapshotVersion: bookingTimeSnapshotVersion,
      handoverAt: '2026-03-29T10:00:00+02:00',
      returnAt: '2026-03-30T10:00:00+02:00',
    },
  });
  assert.deepEqual(snapshot, {
    version: 'booking-time-v1',
    handoverAt: '2026-03-29T08:00:00.000Z',
    returnAt: '2026-03-30T08:00:00.000Z',
    timezone: 'Europe/Berlin',
  });
});

test('date-only, floating, partial, old-version and reversed times fail closed', () => {
  assert.throws(() => normalizeBookingTimeSnapshot({
    ...base,
    raw: { handoverAt: '2026-03-29T10:00', returnAt: '2026-03-30T10:00+02:00' },
  }), (error) => error.code === 'booking_handover_time_invalid');
  assert.throws(() => normalizeBookingTimeSnapshot({
    ...base,
    raw: { handoverAt: '2026-03-29T10:00:00+02:00' },
  }), (error) => error.code === 'booking_exact_times_pair_required');
  assert.throws(() => normalizeBookingTimeSnapshot({
    ...base,
    raw: {
      timeSnapshotVersion: 'booking-time-old',
      handoverAt: '2026-03-29T10:00:00+02:00',
      returnAt: '2026-03-30T10:00:00+02:00',
    },
  }), (error) => error.code === 'booking_exact_times_version_unsupported');
  assert.throws(() => normalizeBookingTimeSnapshot({
    ...base,
    raw: {
      timeSnapshot: {
        version: 'booking-time-old',
        handoverAt: '2026-03-29T10:00:00+02:00',
        returnAt: '2026-03-30T10:00:00+02:00',
      },
    },
  }), (error) => error.code === 'booking_exact_times_version_unsupported');
  assert.throws(() => normalizeBookingTimeSnapshot({
    ...base,
    raw: { handoverAt: '2026-03-30T10:00:00+02:00', returnAt: '2026-03-29T10:00:00+02:00' },
  }), (error) => error.code === 'booking_exact_times_order_invalid');
});

test('legacy omission remains null unless exact times are explicitly required', () => {
  assert.equal(normalizeBookingTimeSnapshot({ ...base, raw: {} }), null);
  assert.throws(() => normalizeBookingTimeSnapshot({ ...base, raw: {}, required: true }),
    (error) => error instanceof BookingTimeSnapshotError
      && error.code === 'booking_exact_times_required');
});

test('accepted quote snapshot cannot drift', () => {
  const snapshot = normalizeBookingTimeSnapshot({
    ...base,
    raw: { handoverAt: '2026-03-29T10:00:00+02:00', returnAt: '2026-03-30T10:00:00+02:00' },
  });
  assert.doesNotThrow(() => assertSameBookingTimeSnapshot(snapshot, { ...snapshot }));
  assert.throws(() => assertSameBookingTimeSnapshot(snapshot, {
    ...snapshot,
    returnAt: '2026-03-30T11:00:00.000Z',
  }), (error) => error.code === 'booking_exact_times_changed');
});

test('owner-acceptance contract comparison rejects exact-time tampering', () => {
  const booking = {
    time_snapshot_version: 'booking-time-v1',
    handover_at: '2026-03-29T08:00:00.000Z',
    return_at: '2026-03-30T08:00:00.000Z',
    rental_start_date: '2026-03-29',
    rental_end_date: '2026-03-30',
    rental_timezone: 'Europe/Berlin',
  };
  assert.deepEqual(assertBookingContractTimeSnapshot({
    booking,
    contract: booking,
  }), {
    version: 'booking-time-v1',
    handoverAt: '2026-03-29T08:00:00.000Z',
    returnAt: '2026-03-30T08:00:00.000Z',
    timezone: 'Europe/Berlin',
  });
  assert.throws(() => assertBookingContractTimeSnapshot({
    booking,
    contract: { ...booking, return_at: '2026-03-30T09:00:00.000Z' },
  }), (error) => error.code === 'booking_exact_times_contract_mismatch');
  assert.throws(() => assertBookingContractTimeSnapshot({
    booking: { ...booking, time_snapshot_version: null, handover_at: null, return_at: null },
    contract: booking,
  }), (error) => error.code === 'booking_exact_times_contract_mismatch');
  assert.throws(() => assertBookingContractTimeSnapshot({
    booking,
    contract: { ...booking, time_snapshot_version: null, handover_at: null, return_at: null },
  }), (error) => error.code === 'booking_exact_times_contract_mismatch');
});

test('snapshot-backed handover starts without time confirmation; legacy still requires it', () => {
  const snapshot = {
    version: 'booking-time-v1',
    handoverAt: '2026-03-29T08:00:00.000Z',
    returnAt: '2026-03-30T08:00:00.000Z',
    timezone: 'Europe/Berlin',
  };
  assert.equal(applyBookingFlowTimeAction({
    payload: { timeSnapshot: snapshot },
    actorId: 'owner-1', ownerId: 'owner-1', renterId: 'renter-1',
    workflowStatus: 'accepted', rentalStartDate: '2026-03-29',
    rentalEndDate: '2026-03-30', rentalTimezone: 'Europe/Berlin',
    raw: { action: 'start', segment: 'pickup' },
  }).state.handoverActive, true);
  assert.throws(() => applyBookingFlowTimeAction({
    payload: {},
    actorId: 'owner-1', ownerId: 'owner-1', renterId: 'renter-1',
    workflowStatus: 'accepted', rentalStartDate: '2026-03-29',
    rentalEndDate: '2026-03-30', rentalTimezone: 'Europe/Berlin',
    raw: { action: 'start', segment: 'pickup' },
  }), (error) => error.code === 'flow_state_time_unconfirmed');
});

test('a changed time needs bilateral confirmation and then becomes operational without rewriting the snapshot', () => {
  const snapshot = {
    version: 'booking-time-v1',
    handoverAt: '2026-03-29T08:00:00.000Z',
    returnAt: '2026-03-30T08:00:00.000Z',
    timezone: 'Europe/Berlin',
  };
  const proposed = applyBookingFlowTimeAction({
    payload: { timeSnapshot: snapshot },
    actorId: 'owner-1', ownerId: 'owner-1', renterId: 'renter-1',
    workflowStatus: 'accepted', rentalStartDate: '2026-03-29',
    rentalEndDate: '2026-03-30', rentalTimezone: 'Europe/Berlin',
    raw: {
      action: 'propose', segment: 'pickup',
      label: 'Sonntag, 12:00', timeIso: '2026-03-29T10:00:00.000Z',
    },
  });
  assert.throws(() => applyBookingFlowTimeAction({
    payload: proposed.payload,
    actorId: 'owner-1', ownerId: 'owner-1', renterId: 'renter-1',
    workflowStatus: 'accepted', rentalStartDate: '2026-03-29',
    rentalEndDate: '2026-03-30', rentalTimezone: 'Europe/Berlin',
    raw: { action: 'start', segment: 'pickup' },
  }), (error) => error.code === 'flow_state_time_unconfirmed');
  const pendingVisibility = evaluateBookingAddressReveal({
    ownerId: 'owner-1', renterId: 'renter-1', workflowStatus: 'accepted',
    rentalStartDate: '2026-03-29', rentalEndDate: '2026-03-30',
    rentalTimezone: 'Europe/Berlin', flowTimePayload: proposed.payload,
    segment: 'pickup', safetyHold: false, exactAddress: 'private',
    now: new Date('2026-03-29T20:00:00.000Z'),
  });
  assert.equal(pendingVisibility.reason, 'appointment_not_counterparty_confirmed');
  const confirmed = applyBookingFlowTimeAction({
    ...{
      payload: proposed.payload,
      actorId: 'renter-1', ownerId: 'owner-1', renterId: 'renter-1',
      workflowStatus: 'accepted', rentalStartDate: '2026-03-29',
      rentalEndDate: '2026-03-30', rentalTimezone: 'Europe/Berlin',
      raw: { action: 'confirm', segment: 'pickup' },
    },
  });
  assert.equal(confirmed.state.timeSnapshot.handoverAt, snapshot.handoverAt);
  assert.equal(confirmed.state.handoverTimeIso, '2026-03-29T10:00:00.000Z');
  assert.equal(applyBookingFlowTimeAction({
    payload: confirmed.payload,
    actorId: 'owner-1', ownerId: 'owner-1', renterId: 'renter-1',
    workflowStatus: 'accepted', rentalStartDate: '2026-03-29',
    rentalEndDate: '2026-03-30', rentalTimezone: 'Europe/Berlin',
    raw: { action: 'start', segment: 'pickup' },
  }).state.handoverActive, true);
  const confirmedVisibility = evaluateBookingAddressReveal({
    ownerId: 'owner-1', renterId: 'renter-1', workflowStatus: 'accepted',
    rentalStartDate: '2026-03-29', rentalEndDate: '2026-03-30',
    rentalTimezone: 'Europe/Berlin', flowTimePayload: confirmed.payload,
    segment: 'pickup', safetyHold: false, exactAddress: 'private',
    now: new Date('2026-03-29T20:00:00.000Z'),
  });
  assert.equal(confirmedVisibility.appointmentAt, '2026-03-29T10:00:00.000Z');
});

test('migration is forward-only, nullable, versioned and down-safe', () => {
  const up = fs.readFileSync(new URL('../sql/migrations/096_booking_exact_time_snapshot.up.sql', import.meta.url), 'utf8');
  const down = fs.readFileSync(new URL('../sql/migrations/096_booking_exact_time_snapshot.down.sql', import.meta.url), 'utf8');
  for (const table of ['booking_quotes', 'bookings', 'platform_contracts']) {
    assert.match(up, new RegExp(`ALTER TABLE ${table}[\\s\\S]*time_snapshot_version`, 'u'));
    assert.match(up, new RegExp(`${table}_exact_time_snapshot_check`, 'u'));
  }
  assert.match(up, /booking-time-v1/u);
  assert.match(up, /quarantine_legacy_booking_write/u);
  assert.match(down, /booking_exact_time_snapshot_active_rows/u);
});
