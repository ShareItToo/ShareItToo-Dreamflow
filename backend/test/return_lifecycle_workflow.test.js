import assert from 'node:assert/strict';
import test from 'node:test';

process.env.JWT_SECRET ??= 'test-secret-that-is-longer-than-thirty-two-characters';
process.env.DATABASE_URL ??= 'postgresql://test:test@127.0.0.1:5432/shareittoo_test';

const {
  planReturnLifecycle,
  reconcileReturnLifecycleWithClient,
} = await import('../src/return_lifecycle_workflow.js');
const { enqueueReturnLifecycleNotification } = await import('../src/notifications.js');

function row(overrides = {}) {
  return {
    id: 'booking-return-1',
    owner_id: 'owner-1',
    renter_id: 'renter-1',
    return_state: 'awaitingReturnConfirmation',
    return_t0: new Date('2026-08-01T10:00:00.000Z'),
    return_report_deadline: new Date('2026-08-03T10:00:00.000Z'),
    return_clarification_deadline: new Date('2026-08-06T10:00:00.000Z'),
    payout_instruction_due_at: new Date('2026-08-06T10:00:00.000Z'),
    rental_timezone: 'Europe/Berlin',
    booking_payload: {
      returnConfirmation: {
        renterConfirmedAt: '2026-08-01T10:00:00.000Z',
      },
    },
    case_id: null,
    case_opened_by: null,
    case_opened_at: null,
    case_response_due_at: null,
    next_status_update_due_at: null,
    ...overrides,
  };
}

test('missing counterparty confirmation stays neutral and creates bounded reminders', () => {
  const plan = planReturnLifecycle(row(), {
    now: new Date('2026-08-03T10:00:00.000Z'),
  });
  assert.equal(plan.nextState, 'awaitingReturnConfirmation');
  assert.deepEqual(
    plan.actions.map((action) => [action.kind, action.recipientRoles]),
    [
      ['return_confirmation_reminder', ['owner']],
      ['return_confirmation_reminder', ['owner']],
    ],
  );
  assert.match(plan.actions[0].eventKey, /confirmation-reminder:t0/);
  assert.match(plan.actions[1].eventKey, /confirmation-reminder:48h/);
  assert.equal(plan.actions.some((action) => action.kind.includes('case')), false);
});

test('T0 plus five days becomes payout eligible without needsReview', () => {
  const plan = planReturnLifecycle(row(), {
    now: new Date('2026-08-06T10:00:00.000Z'),
  });
  assert.equal(plan.previousState, 'awaitingReturnConfirmation');
  assert.equal(plan.nextState, 'payoutEligible');
  assert.equal(plan.nextPayoutInstructionDueAt, '2026-08-06T10:00:00.000Z');
  assert.equal(
    plan.actions.at(-1).kind,
    'return_confirmation_window_closed',
  );
  assert.equal(plan.actions.some((action) => action.kind === 'return_case_opened'), false);
});

test('confirmed return advances after the 48-hour report window', () => {
  const plan = planReturnLifecycle(row({
    return_state: 'reportWindowOpen',
    booking_payload: {
      returnConfirmation: {
        ownerConfirmedAt: '2026-08-01T10:00:00.000Z',
        renterConfirmedAt: '2026-08-01T10:00:00.000Z',
      },
    },
    payout_instruction_due_at: new Date('2026-08-03T10:00:00.000Z'),
  }), {
    now: new Date('2026-08-03T10:00:00.000Z'),
  });
  assert.equal(plan.nextState, 'payoutEligible');
  assert.equal(plan.nextPayoutInstructionDueAt, '2026-08-03T10:00:00.000Z');
  assert.deepEqual(plan.actions.map((action) => action.kind), [
    'return_report_window_closed',
  ]);
});

test('substantiated case reminds the other party and preserves seven-day cadence', () => {
  const plan = planReturnLifecycle(row({
    return_state: 'needsReview',
    case_id: 'case-1',
    case_opened_by: 'owner-1',
    case_opened_at: new Date('2026-08-01T10:00:00.000Z'),
    case_response_due_at: new Date('2026-08-06T10:00:00.000Z'),
    next_status_update_due_at: new Date('2026-08-08T10:00:00.000Z'),
  }), {
    now: new Date('2026-08-23T12:00:00.000Z'),
  });
  assert.equal(plan.nextState, 'needsReview');
  assert.deepEqual(plan.actions.map((action) => action.kind), [
    'return_case_opened',
    'return_case_response_due',
    'return_case_status_update',
  ]);
  assert.deepEqual(plan.actions[1].recipientRoles, ['renter']);
  assert.equal(plan.nextCaseStatusUpdateDueAt, '2026-08-29T10:00:00.000Z');
});

test('seven-calendar-day cadence preserves local time across DST and advances once', () => {
  const plan = planReturnLifecycle(row({
    return_state: 'needsReview',
    case_id: 'case-dst',
    case_opened_by: 'owner-1',
    case_opened_at: new Date('2026-03-20T11:00:00.000Z'),
    case_response_due_at: new Date('2026-03-25T11:00:00.000Z'),
    next_status_update_due_at: new Date('2026-03-27T11:00:00.000Z'),
    case_deadline_timezone: 'Europe/Berlin',
  }), {
    now: new Date('2026-03-27T11:00:00.000Z'),
  });
  assert.equal(plan.nextCaseStatusUpdateDueAt, '2026-04-03T10:00:00.000Z');
  assert.equal(
    plan.actions.filter((action) => action.kind === 'return_case_status_update').length,
    1,
  );
});

test('database reconciliation is idempotent, role-bound and updates both projections', async () => {
  const statements = [];
  const notifications = [];
  const client = {
    async query(sql, params = []) {
      const compact = sql.replace(/\s+/g, ' ').trim();
      statements.push({ compact, params });
      if (compact.startsWith('SELECT booking.id')) {
        return {
          rowCount: 1,
          rows: [row()],
        };
      }
      return { rowCount: 1, rows: [] };
    },
  };
  const result = await reconcileReturnLifecycleWithClient(client, {
    now: new Date('2026-08-06T10:00:00.000Z'),
    enqueue: async (_client, action) => {
      notifications.push(action);
      return action.recipientRoles.length;
    },
  });
  assert.deepEqual(result, {
    inspected: 1,
    advanced: 1,
    notifications: 4,
    caseCadencesAdvanced: 0,
  });
  assert.equal(
    statements.some(({ compact }) =>
      compact.includes('UPDATE bookings SET return_state = $2')),
    true,
  );
  assert.equal(
    statements.some(({ compact }) =>
      compact.includes('UPDATE rental_requests SET payload = $2::jsonb')),
    true,
  );
  const event = statements.find(({ compact }) =>
    compact.includes("'booking.return_lifecycle_advanced'"));
  assert.ok(event);
  assert.match(event.compact, /ON CONFLICT \(idempotency_key\) DO NOTHING/);
  assert.equal(notifications.at(-1).kind, 'return_confirmation_window_closed');
  assert.deepEqual(notifications.at(-1).recipientRoles, ['owner', 'renter']);
});

test('return lifecycle notification fans out idempotently to app email and push', async () => {
  const inserts = [];
  const client = {
    async query(sql, params = []) {
      const compact = sql.replace(/\s+/g, ' ').trim();
      if (compact.startsWith('SELECT booking.owner_id')) {
        return {
          rowCount: 1,
          rows: [{
            owner_id: 'owner-1',
            renter_id: 'renter-1',
            rental_start_date: '2026-08-01',
            rental_end_date: '2026-08-02',
            listing_payload: { title: 'Kamera' },
            owner_profile: { displayName: 'Owner' },
            renter_profile: { displayName: 'Renter' },
            rental_timezone: 'Europe/Berlin',
          }],
        };
      }
      if (compact.startsWith('INSERT INTO notification_outbox')) {
        inserts.push(params);
        assert.match(compact, /ON CONFLICT \(event_key, user_id, channel\) DO NOTHING/);
      }
      return { rowCount: 1, rows: [] };
    },
  };
  const count = await enqueueReturnLifecycleNotification(client, {
    bookingId: 'booking-return-1',
    eventKey: 'return:booking-return-1:confirmation-window-closed',
    kind: 'return_confirmation_window_closed',
    recipientRoles: ['owner', 'renter', 'owner'],
    deadline: '2026-08-06T10:00:00.000Z',
  });
  assert.equal(count, 2);
  assert.equal(inserts.length, 6);
  assert.deepEqual(new Set(inserts.map((params) => params[2])), new Set([
    'in_app',
    'email',
    'push',
  ]));
  assert.deepEqual(new Set(inserts.map((params) => params[1])), new Set([
    'owner-1',
    'renter-1',
  ]));
  assert.equal(inserts.every((params) => params[3] === 'return_confirmation_window_closed'), true);
  assert.equal(inserts.some((params) => String(params[6]).includes('Schadensbetrag abbuchen')), false);
});
