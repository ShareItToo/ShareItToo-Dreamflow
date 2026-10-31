import assert from 'node:assert/strict';
import test from 'node:test';

process.env.JWT_SECRET ??= 'test-secret-that-is-longer-than-thirty-two-characters';
process.env.DATABASE_URL ??= 'postgresql://test:test@127.0.0.1:5432/shareittoo_test';

const { bookingMessagingAllowed } = await import('../src/message_workflow.js');

test('completed booking chat stays open only through the inclusive 48-hour window', () => {
  const row = {
    workflow_status: 'completed',
    return_state: 'awaitingReturnConfirmation',
    return_report_deadline: '2026-08-22T10:00:00.000Z',
    active_return_case_id: null,
  };
  assert.equal(bookingMessagingAllowed(row, {
    now: new Date('2026-08-22T10:00:00.000Z'),
  }), true);
  assert.equal(bookingMessagingAllowed(row, {
    now: new Date('2026-08-22T10:00:00.001Z'),
  }), false);
});

test('an open substantiated case keeps chat open and a closed case does not', () => {
  const base = {
    workflow_status: 'completed',
    return_state: 'needsReview',
    return_report_deadline: '2026-08-22T10:00:00.000Z',
  };
  assert.equal(bookingMessagingAllowed({
    ...base,
    active_return_case_id: 'case-1',
  }, { now: new Date('2026-09-01T10:00:00.000Z') }), true);
  assert.equal(bookingMessagingAllowed({
    ...base,
    active_return_case_id: null,
  }, { now: new Date('2026-09-01T10:00:00.000Z') }), false);
});

test('ordinary active statuses remain open and unrelated states remain closed', () => {
  assert.equal(bookingMessagingAllowed({ workflow_status: 'active' }), true);
  assert.equal(bookingMessagingAllowed({ workflow_status: 'cancelled' }), false);
});
