import { PaymentDomainError } from './payment_domain.js';

function nonNegativeInteger(value, code = 'refund_truth_invalid') {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new PaymentDomainError(409, code);
  }
  return parsed;
}

export function parsePaymentRefundTruthRow(row) {
  if (!['none', 'pending', 'providerBound', 'needsReview']
    .includes(row.refund_truth_status)
      || typeof row.settled_refund_within_capture !== 'boolean'
      || typeof row.refund_cache_matches_settlement !== 'boolean'
      || typeof row.refund_status_matches_settlement !== 'boolean') {
    throw new PaymentDomainError(409, 'refund_truth_invalid');
  }
  return Object.freeze({
    paymentId: row.payment_id,
    status: row.refund_truth_status,
    untrustedCount: nonNegativeInteger(row.untrusted_refund_count),
    invalidCount: nonNegativeInteger(row.invalid_refund_count),
    activeCount: nonNegativeInteger(row.active_refund_count),
    terminalCount: nonNegativeInteger(row.terminal_refund_count),
    providerObservationReviewCount: nonNegativeInteger(
      row.provider_observation_review_count,
    ),
    providerLocalPendingCount: nonNegativeInteger(
      row.provider_bound_local_pending_count,
    ),
    providerLocalReviewCount: nonNegativeInteger(
      row.provider_bound_local_review_count,
    ),
    settledCount: nonNegativeInteger(row.settled_refund_count),
    settledMinor: nonNegativeInteger(row.settled_refund_minor),
    settledOwnerMinor: nonNegativeInteger(row.settled_owner_refund_minor),
    withinCapture: row.settled_refund_within_capture,
    cacheMatches: row.refund_cache_matches_settlement,
    paymentStatusMatches: row.refund_status_matches_settlement,
  });
}

export async function readPaymentRefundTruth(client, paymentId) {
  const result = await client.query(
    'SELECT * FROM sit_payment_refund_truth WHERE payment_id = $1',
    [paymentId],
  );
  if (result.rowCount !== 1) {
    throw new PaymentDomainError(409, 'refund_truth_missing');
  }
  return parsePaymentRefundTruthRow(result.rows[0]);
}

function baseTruthReliable(truth) {
  return truth.withinCapture
    && truth.cacheMatches
    && truth.paymentStatusMatches
    && truth.untrustedCount === 0
    && truth.invalidCount === 0
    && truth.terminalCount === 0
    && truth.providerObservationReviewCount === 0
    && truth.activeCount <= 1
    && truth.providerLocalPendingCount <= 1
    && truth.providerLocalReviewCount <= 1;
}

export function assertRefundTruthSettled(truth) {
  if (!baseTruthReliable(truth)
      || truth.activeCount !== 0
      || truth.providerLocalPendingCount !== 0
      || truth.providerLocalReviewCount !== 0
      || !['none', 'providerBound'].includes(truth.status)) {
    throw new PaymentDomainError(409, 'refund_truth_needs_review');
  }
  return truth;
}

export function assertRefundTruthRecoverableFor(refund, truth) {
  if (!baseTruthReliable(truth)) {
    throw new PaymentDomainError(409, 'refund_truth_needs_review');
  }
  const expectedActive = ['created', 'pending'].includes(refund?.status) ? 1 : 0;
  const expectedProviderPending = refund?.status === 'succeeded'
      && refund?.local_settlement_status === 'pending'
    ? 1 : 0;
  const expectedProviderReview = refund?.status === 'succeeded'
      && refund?.local_settlement_status === 'needs_review'
    ? 1 : 0;
  if (truth.activeCount !== expectedActive
      || truth.providerLocalPendingCount !== expectedProviderPending
      || truth.providerLocalReviewCount !== expectedProviderReview
      || !['pending', 'needsReview'].includes(truth.status)) {
    throw new PaymentDomainError(409, 'refund_truth_needs_review');
  }
  return truth;
}

export function publicPaymentRefundTruth(truth) {
  const needsReview = truth.status === 'needsReview';
  const pending = truth.status === 'pending';
  return Object.freeze({
    status: needsReview ? 'needsReview' : pending ? 'pending' : truth.status,
    refundedMinor: needsReview || pending ? null : truth.settledMinor,
    needsReview,
    pending,
  });
}
