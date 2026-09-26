import assert from 'node:assert/strict';
import test from 'node:test';

process.env.DATABASE_URL ??= 'postgres://example:example@localhost:5432/example';
process.env.JWT_SECRET ??= 'test-secret-that-is-longer-than-thirty-two-characters';
process.env.MAIL_TRANSPORT = 'memory';
process.env.PUSH_TRANSPORT = 'disabled';
process.env.PAYMENT_TRANSPORT = 'memory';

const {
  BookingWorkflowError,
  v51CancellationDecisionAtDatabaseTime,
  v52CancellationWithdrawalGate,
} = await import('../src/booking_workflow.js');

const acceptedAt = '2026-03-20T11:00:00.000Z';
const createdAt = acceptedAt;
const exactV52 = 'V5.2-2026-08-16';
const principalBinding = Object.freeze({
  contractCreatedAt: createdAt,
  contractUserId: 'renter-1',
  bookingRenterId: 'renter-1',
});

test('renter cancellation is redirected through the final Berlin legal millisecond', () => {
  const exact = v52CancellationWithdrawalGate({
    contractVersion: exactV52,
    contractAcceptedAt: acceptedAt,
    databaseNow: '2026-04-03T21:59:59.999Z',
    ...principalBinding,
  });
  assert.equal(exact.redirectToWithdrawal, true);
  assert.equal(exact.rightExpiresAt.toISOString(), '2026-04-03T21:59:59.999Z');

  const after = v52CancellationWithdrawalGate({
    contractVersion: exactV52,
    contractAcceptedAt: acceptedAt,
    databaseNow: '2026-04-03T22:00:00.000Z',
    ...principalBinding,
  });
  assert.equal(after.redirectToWithdrawal, false);
  assert.equal(after.rightExpiresAt.toISOString(), exact.rightExpiresAt.toISOString());
});

test('cancellation deadline starts from the later persisted instant across Berlin midnight', () => {
  const binding = {
    contractVersion: exactV52,
    contractAcceptedAt: '2026-03-20T22:59:59.999Z', // 23:59:59.999 CET
    contractCreatedAt: '2026-03-20T23:00:00.000Z', // 00:00:00.000 CET
    contractUserId: 'renter-1',
    bookingRenterId: 'renter-1',
  };
  const exact = v52CancellationWithdrawalGate({
    ...binding,
    databaseNow: '2026-04-04T21:59:59.999Z',
  });
  assert.equal(exact.redirectToWithdrawal, true);
  assert.equal(exact.rightExpiresAt.toISOString(), '2026-04-04T21:59:59.999Z');

  const after = v52CancellationWithdrawalGate({
    ...binding,
    databaseNow: '2026-04-04T22:00:00.000Z',
  });
  assert.equal(after.redirectToWithdrawal, false);
  assert.equal(after.rightExpiresAt.toISOString(), exact.rightExpiresAt.toISOString());
});

test('cancellation gate fails closed on unsupported V5.2 or invalid clocks', () => {
  for (const candidate of [
    {
      contractVersion: 'V5.2-unreviewed',
      contractAcceptedAt: acceptedAt,
      databaseNow: '2026-04-03T22:00:00.000Z',
      ...principalBinding,
      code: 'v52_withdrawal_contract_version_unsupported',
    },
    {
      contractVersion: ` ${exactV52}`,
      contractAcceptedAt: acceptedAt,
      databaseNow: '2026-04-03T22:00:00.000Z',
      ...principalBinding,
      code: 'v52_withdrawal_contract_version_unsupported',
    },
    {
      contractVersion: `${exactV52}\n`,
      contractAcceptedAt: acceptedAt,
      databaseNow: '2026-04-03T22:00:00.000Z',
      ...principalBinding,
      code: 'v52_withdrawal_contract_version_unsupported',
    },
    {
      contractVersion: exactV52,
      contractAcceptedAt: 'not-an-instant',
      databaseNow: '2026-04-03T22:00:00.000Z',
      ...principalBinding,
      code: 'v52_withdrawal_contract_time_invalid',
    },
    {
      contractVersion: exactV52,
      contractAcceptedAt: acceptedAt,
      databaseNow: 'not-an-instant',
      ...principalBinding,
      code: 'v52_withdrawal_database_clock_invalid',
    },
  ]) {
    assert.throws(
      () => v52CancellationWithdrawalGate(candidate),
      (error) => error instanceof BookingWorkflowError && error.code === candidate.code,
    );
  }
});

test('cancellation gate fails closed on principal or persistence-clock drift', () => {
  for (const candidate of [
    {
      contractVersion: exactV52,
      contractAcceptedAt: acceptedAt,
      contractCreatedAt: createdAt,
      contractUserId: 'renter-a',
      bookingRenterId: 'renter-b',
      databaseNow: '2026-04-03T22:00:00.000Z',
      code: 'v52_withdrawal_contract_binding_invalid',
    },
    {
      contractVersion: exactV52,
      contractAcceptedAt: acceptedAt,
      contractCreatedAt: '2026-03-20T11:05:00.001Z',
      contractUserId: 'renter-1',
      bookingRenterId: 'renter-1',
      databaseNow: '2026-04-03T22:00:00.000Z',
      code: 'v52_withdrawal_contract_time_invalid',
    },
    {
      contractVersion: 'V5.1-2026-08-16',
      contractAcceptedAt: acceptedAt,
      contractCreatedAt: '2026-03-20T11:05:00.001Z',
      contractUserId: 'renter-1',
      bookingRenterId: 'renter-1',
      databaseNow: null,
      code: 'v52_withdrawal_contract_time_invalid',
    },
  ]) {
    assert.throws(
      () => v52CancellationWithdrawalGate(candidate),
      (error) => error instanceof BookingWorkflowError && error.code === candidate.code,
    );
  }
});

test('unknown and malformed contract versions never fall back to legacy cancellation', () => {
  for (const contractVersion of [
    'V5.1-2026-08-11',
    'V5.2',
    'V5.3-2026-09-14',
    'v5.2-2026-08-16',
    '',
  ]) {
    assert.throws(() => v52CancellationWithdrawalGate({
      contractVersion,
      contractAcceptedAt: acceptedAt,
      ...principalBinding,
      databaseNow: '2026-04-03T22:00:00.000Z',
    }), (error) => error instanceof BookingWorkflowError
      && error.code === 'v52_withdrawal_contract_version_unsupported');
  }
});

test('legacy cancellation is not relabelled as a V5.2 withdrawal', () => {
  assert.deepEqual(v52CancellationWithdrawalGate({
    contractVersion: 'V5.1-2026-08-16',
    contractAcceptedAt: acceptedAt,
    contractCreatedAt: createdAt,
    contractUserId: 'renter-1',
    bookingRenterId: 'renter-1',
    databaseNow: null,
  }), {
    redirectToWithdrawal: false,
    rightExpiresAt: null,
  });
  assert.throws(() => v52CancellationWithdrawalGate({
    contractVersion: null,
    contractAcceptedAt: null,
    contractCreatedAt: null,
    contractUserId: null,
    bookingRenterId: 'renter-1',
    databaseNow: null,
  }), (error) => error instanceof BookingWorkflowError
    && error.code === 'v52_withdrawal_contract_binding_invalid');
});

test('V5.1 cancellation financial boundaries use one database event clock', () => {
  const rentalStartAt = '2026-08-20T10:00:00.000Z';
  const common = {
    rentalStartAt,
    actorRole: 'renter',
    cancellationType: 'standard',
    contractVersion: 'V5.1-2026-08-16',
    contractAcceptedAt: '2026-08-18T10:00:00.000Z',
    contractCreatedAt: '2026-08-18T10:00:00.000Z',
    contractUserId: 'renter-1',
    bookingRenterId: 'renter-1',
  };
  const atTwentyFourHours = v51CancellationDecisionAtDatabaseTime({
    ...common,
    databaseNow: '2026-08-19T10:00:00.000Z',
    contractConfirmedAt: '2026-08-18T10:00:00.000Z',
  });
  assert.equal(atTwentyFourHours.outcome.reasonCode, 'at_least_24_hours_full_refund');
  const insideTwentyFourHours = v51CancellationDecisionAtDatabaseTime({
    ...common,
    databaseNow: '2026-08-19T10:00:00.001Z',
    contractConfirmedAt: '2026-08-18T10:00:00.000Z',
  });
  assert.equal(
    insideTwentyFourHours.outcome.reasonCode,
    'less_than_24_hours_fifty_percent_retained',
  );

  const graceCommon = {
    ...common,
    contractConfirmedAt: '2026-08-20T08:00:00.000Z',
  };
  const atGrace = v51CancellationDecisionAtDatabaseTime({
    ...graceCommon,
    databaseNow: '2026-08-20T09:00:00.000Z',
  });
  assert.equal(atGrace.outcome.reasonCode, 'short_notice_grace_full_refund');
  const afterGrace = v51CancellationDecisionAtDatabaseTime({
    ...graceCommon,
    databaseNow: '2026-08-20T09:00:00.001Z',
  });
  assert.equal(afterGrace.outcome.reasonCode, 'less_than_24_hours_fifty_percent_retained');
});

test('owner-declared renter no-show uses the database-clock start boundary', () => {
  const common = {
    rentalStartAt: '2026-08-20T10:00:00.000Z',
    contractConfirmedAt: '2026-08-18T10:00:00.000Z',
    actorRole: 'owner',
    cancellationType: 'renter_no_show',
    contractVersion: exactV52,
    contractAcceptedAt: '2026-08-18T10:00:00.000Z',
    contractCreatedAt: '2026-08-18T10:00:00.000Z',
    contractUserId: 'renter-1',
    bookingRenterId: 'renter-1',
  };
  assert.throws(() => v51CancellationDecisionAtDatabaseTime({
    ...common,
    databaseNow: '2026-08-20T09:59:59.999Z',
  }), (error) => error instanceof BookingWorkflowError
    && error.code === 'renter_no_show_before_start');
  const exact = v51CancellationDecisionAtDatabaseTime({
    ...common,
    databaseNow: '2026-08-20T10:00:00.000Z',
  });
  assert.equal(exact.occurredAt.toISOString(), common.rentalStartAt);
  assert.equal(exact.outcome.reasonCode, 'no_show_actual_loss_assessment_required');
  assert.equal(exact.outcome.calculationStatus, 'pending_actual_loss_assessment');
});

test('owner-declared renter no-show fails closed on contract binding defects', () => {
  const common = {
    databaseNow: '2026-08-20T10:00:00.000Z',
    rentalStartAt: '2026-08-20T10:00:00.000Z',
    contractConfirmedAt: '2026-08-18T10:00:00.000Z',
    actorRole: 'owner',
    cancellationType: 'renter_no_show',
    contractVersion: exactV52,
    contractAcceptedAt: '2026-08-18T10:00:00.000Z',
    contractCreatedAt: '2026-08-18T10:00:00.000Z',
    contractUserId: 'renter-1',
    bookingRenterId: 'renter-1',
  };
  for (const candidate of [
    {
      contractVersion: 'V5.2-unreviewed',
      code: 'v52_withdrawal_contract_version_unsupported',
    },
    {
      contractUserId: 'other-renter',
      code: 'v52_withdrawal_contract_binding_invalid',
    },
    {
      contractCreatedAt: '2026-08-18T10:05:00.001Z',
      code: 'v52_withdrawal_contract_time_invalid',
    },
  ]) {
    assert.throws(
      () => v51CancellationDecisionAtDatabaseTime({ ...common, ...candidate }),
      (error) => error instanceof BookingWorkflowError && error.code === candidate.code,
    );
  }
});
