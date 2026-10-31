import { PaymentDomainError } from './payment_domain.js';

function nonNegativeInteger(value, code) {
  const parsed = Number(value ?? 0);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new PaymentDomainError(409, code);
  }
  return parsed;
}

export function evaluateRefundObligationSnapshot(row = {}) {
  const withdrawalCount = nonNegativeInteger(
    row.withdrawal_obligation_count,
    'refund_obligation_state_invalid',
  );
  const withdrawalUnresolved = nonNegativeInteger(
    row.withdrawal_unresolved_count,
    'refund_obligation_state_invalid',
  );
  const withdrawalDueMinor = nonNegativeInteger(
    row.withdrawal_due_minor,
    'refund_obligation_state_invalid',
  );
  const cancellationCount = nonNegativeInteger(
    row.cancellation_obligation_count,
    'refund_obligation_state_invalid',
  );
  const cancellationUnresolved = nonNegativeInteger(
    row.cancellation_unresolved_count,
    'refund_obligation_state_invalid',
  );
  const cancellationDueMinor = nonNegativeInteger(
    row.cancellation_due_minor,
    'refund_obligation_state_invalid',
  );
  const actualLossUnresolved = nonNegativeInteger(
    row.actual_loss_unresolved_count,
    'refund_obligation_state_invalid',
  );
  const succeededRefundMinor = nonNegativeInteger(
    row.succeeded_refund_minor,
    'refund_obligation_state_invalid',
  );
  const untrustedRefundCount = nonNegativeInteger(
    row.untrusted_refund_count,
    'refund_obligation_state_invalid',
  );
  const unresolvedRefundCount = nonNegativeInteger(
    row.unresolved_refund_count,
    'refund_obligation_state_invalid',
  );
  const dueMinor = withdrawalDueMinor + cancellationDueMinor;
  if (!Number.isSafeInteger(dueMinor)) {
    throw new PaymentDomainError(409, 'refund_obligation_state_invalid');
  }
  const conflictingFamilies = withdrawalCount > 0 && cancellationCount > 0;
  const providerTruthNeedsReview = untrustedRefundCount > 0
    || unresolvedRefundCount > 0;
  const unresolved = withdrawalUnresolved > 0
    || cancellationUnresolved > 0
    || actualLossUnresolved > 0
    || providerTruthNeedsReview;
  const outstandingMinor = Math.max(0, dueMinor - succeededRefundMinor);
  return Object.freeze({
    blocked: conflictingFamilies || unresolved || outstandingMinor > 0,
    conflictingFamilies,
    unresolved,
    outstandingMinor,
    dueMinor,
    succeededRefundMinor,
    providerTruthNeedsReview,
    untrustedRefundCount,
    unresolvedRefundCount,
  });
}

const snapshotsSql = `
  WITH target_bookings AS (
    SELECT booking.id
      FROM bookings AS booking
     WHERE ($1::text IS NOT NULL AND booking.id = $1)
        OR ($2::text IS NOT NULL
            AND (booking.owner_id = $2 OR booking.renter_id = $2))
  )
  SELECT target.id AS booking_id,
         COALESCE(withdrawal.obligation_count, 0)::int AS withdrawal_obligation_count,
         COALESCE(withdrawal.unresolved_count, 0)::int AS withdrawal_unresolved_count,
         COALESCE(withdrawal.due_minor, 0)::bigint AS withdrawal_due_minor,
         COALESCE(cancellation.obligation_count, 0)::int AS cancellation_obligation_count,
         COALESCE(cancellation.unresolved_count, 0)::int AS cancellation_unresolved_count,
         COALESCE(cancellation.due_minor, 0)::bigint AS cancellation_due_minor,
         COALESCE(actual_loss.unresolved_count, 0)::int AS actual_loss_unresolved_count,
         COALESCE(refunded.succeeded_minor, 0)::bigint AS succeeded_refund_minor,
         COALESCE(refunded.untrusted_count, 0)::int AS untrusted_refund_count,
         COALESCE(refunded.unresolved_count, 0)::int AS unresolved_refund_count
    FROM target_bookings AS target
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS obligation_count,
             count(*) FILTER (WHERE effective.amount_due_minor IS NULL)::int
               AS unresolved_count,
             COALESCE(sum(effective.amount_due_minor), 0)::bigint AS due_minor
        FROM (
          SELECT CASE
                   WHEN obligation.status = 'required' THEN obligation.amount_due_minor
                   ELSE event.amount_due_minor
                 END AS amount_due_minor
            FROM v51_refund_obligations AS obligation
            LEFT JOIN v51_refund_obligation_events AS event
              ON event.obligation_id = obligation.id
             AND event.event_type = 'calculation_completed'
           WHERE obligation.booking_id = target.id
        ) AS effective
    ) AS withdrawal ON true
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS obligation_count,
             count(*) FILTER (WHERE effective.amount_due_minor IS NULL)::int
               AS unresolved_count,
             COALESCE(sum(effective.amount_due_minor), 0)::bigint AS due_minor
        FROM (
          SELECT CASE
                   WHEN obligation.status = 'required' THEN obligation.amount_due_minor
                   ELSE event.amount_due_minor
                 END AS amount_due_minor
            FROM v51_cancellation_refund_obligations AS obligation
            LEFT JOIN v52_cancellation_refund_resolution_events AS event
              ON event.obligation_id = obligation.id
           WHERE obligation.booking_id = target.id
        ) AS effective
    ) AS cancellation ON true
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS unresolved_count
        FROM v52_actual_loss_cases AS loss_case
        LEFT JOIN v52_actual_loss_resolutions AS resolution
          ON resolution.case_id = loss_case.id
       WHERE loss_case.booking_id = target.id
         AND resolution.id IS NULL
    ) AS actual_loss ON true
    LEFT JOIN LATERAL (
      SELECT COALESCE(sum(refund_truth.settled_refund_minor), 0)::bigint
               AS succeeded_minor,
             COALESCE(sum(refund_truth.untrusted_refund_count), 0)::int
               AS untrusted_count,
             count(*) FILTER (
               WHERE refund_truth.refund_truth_status IN ('pending', 'needsReview')
             )::int AS unresolved_count
        FROM payments AS payment
        JOIN sit_payment_refund_truth AS refund_truth
          ON refund_truth.payment_id = payment.id
       WHERE payment.booking_id = target.id
    ) AS refunded ON true
   ORDER BY target.id`;

export async function refundObligationSnapshotsForBookings(client, {
  bookingId = null,
  userId = null,
} = {}) {
  if ((!bookingId && !userId) || (bookingId && userId)) {
    throw new PaymentDomainError(500, 'refund_obligation_scope_invalid');
  }
  const result = await client.query(snapshotsSql, [bookingId, userId]);
  return result.rows.map((row) => Object.freeze({
    bookingId: row.booking_id,
    ...evaluateRefundObligationSnapshot(row),
  }));
}

export async function payoutRefundObligationSnapshot(client, bookingId) {
  const snapshots = await refundObligationSnapshotsForBookings(client, { bookingId });
  if (snapshots.length !== 1) {
    throw new PaymentDomainError(409, 'refund_obligation_booking_missing');
  }
  return snapshots[0];
}

export async function accountOpenRefundObligationCount(client, userId) {
  const snapshots = await refundObligationSnapshotsForBookings(client, { userId });
  return snapshots.filter((snapshot) => snapshot.blocked).length;
}
