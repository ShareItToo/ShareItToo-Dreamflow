import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  evaluateProfessionalReviewTrigger,
  getProfessionalReviewStatus,
  professionalReviewThresholdMinor,
} from '../src/compliance_review.js';

test('professional review threshold is EUR 5,000 net platform fee actually received', () => {
  assert.equal(professionalReviewThresholdMinor, 500_000);
  const below = evaluateProfessionalReviewTrigger({
    receivedPlatformFeeMinor: 500_000,
    refundedPlatformFeeMinor: 1,
  });
  assert.equal(below.netReceivedPlatformFeeMinor, 499_999);
  assert.equal(below.thresholdReached, false);
  assert.equal(below.reviewRequired, false);
  assert.equal(below.activationAllowed, false);

  const evidenceOpen = evaluateProfessionalReviewTrigger({
    receivedPlatformFeeMinor: 500_000,
    refundedPlatformFeeMinor: 0,
  });
  assert.equal(evidenceOpen.status, 'threshold_reached_reserve_evidence_open');
  assert.equal(evidenceOpen.reviewRequired, false);
});

test('covered obligations trigger professional review but never activation', () => {
  const result = evaluateProfessionalReviewTrigger({
    receivedPlatformFeeMinor: 600_000,
    refundedPlatformFeeMinor: 50_000,
    reserveAttestation: {
      operationsDueMinor: 100_000,
      taxDueMinor: 75_000,
      refundDueMinor: 25_000,
      availableReserveMinor: 200_000,
    },
  });
  assert.equal(result.netReceivedPlatformFeeMinor, 550_000);
  assert.equal(result.reservesCovered, true);
  assert.equal(result.reviewRequired, true);
  assert.equal(result.professionalReviewCompleted, false);
  assert.equal(result.activationAllowed, false);
});

test('an evidenced earlier incident is an independent review trigger', () => {
  const result = evaluateProfessionalReviewTrigger({
    receivedPlatformFeeMinor: 0,
    refundedPlatformFeeMinor: 0,
    incidentTrigger: { id: 'incident-1' },
  });
  assert.equal(result.status, 'professional_review_required_earlier_incident');
  assert.equal(result.reviewRequired, true);
  assert.equal(result.activationAllowed, false);
});

test('untrusted refund truth forces review and suppresses an exact net threshold result', () => {
  const result = evaluateProfessionalReviewTrigger({
    receivedPlatformFeeMinor: 600_000,
    refundedPlatformFeeMinor: 50_000,
    untrustedRefundCount: 1,
  });
  assert.equal(result.status, 'professional_review_required_untrusted_refund_truth');
  assert.equal(result.refundTruthExact, false);
  assert.equal(result.untrustedRefundCount, 1);
  assert.equal(result.refundedPlatformFeeMinor, null);
  assert.equal(result.netReceivedPlatformFeeMinor, null);
  assert.equal(result.thresholdReached, null);
  assert.equal(result.reviewRequired, true);
  assert.equal(result.activationAllowed, false);
});

test('unresolved canonical refund truth forces review and suppresses an exact net threshold result', () => {
  const result = evaluateProfessionalReviewTrigger({
    receivedPlatformFeeMinor: 600_000,
    refundedPlatformFeeMinor: 50_000,
    unresolvedRefundCount: 1,
  });
  assert.equal(result.status, 'professional_review_required_unresolved_refund_truth');
  assert.equal(result.refundTruthExact, false);
  assert.equal(result.untrustedRefundCount, 0);
  assert.equal(result.unresolvedRefundCount, 1);
  assert.equal(result.refundedPlatformFeeMinor, null);
  assert.equal(result.netReceivedPlatformFeeMinor, null);
  assert.equal(result.thresholdReached, null);
  assert.equal(result.reviewRequired, true);
  assert.equal(result.activationAllowed, false);
});

test('professional review consumes central stable truth and counts review-only payments', async () => {
  const calls = [];
  const client = {
    async query(statement, values) {
      calls.push({ statement, values });
      if (calls.length === 1) {
        return { rows: [{
          received_platform_fee_minor: '600000',
          refunded_platform_fee_minor: '50000',
          untrusted_refund_count: '1',
          unresolved_refund_count: '0',
        }] };
      }
      return { rows: [] };
    },
  };
  const result = await getProfessionalReviewStatus(client);
  assert.equal(result.reviewRequired, true);
  assert.equal(result.netReceivedPlatformFeeMinor, null);
  assert.equal(result.refundedPlatformFeeMinor, null);
  assert.equal(calls[0].values, undefined);
  assert.match(calls[0].statement, /JOIN sit_payment_refund_truth AS refund_truth/u);
  assert.match(
    calls[0].statement,
    /refund_truth\.refund_truth_status IN \('none', 'providerBound'\)/u,
  );
  assert.match(
    calls[0].statement,
    /refund_truth\.refund_truth_status = 'needsReview'[\s\S]*AS untrusted_refund_count/u,
  );
  assert.match(
    calls[0].statement,
    /refund_truth\.refund_truth_status = 'pending'[\s\S]*AS unresolved_refund_count/u,
  );
  assert.doesNotMatch(calls[0].statement, /FROM refunds AS refund/u);
});

test('fee query exposes only central settled refunds from stable live payment truth', () => {
  const source = readFileSync(new URL('../src/compliance_review.js', import.meta.url), 'utf8');
  for (const marker of [
    'payment.livemode = true',
    'payment.captured_minor = payment.amount_minor',
    'sit_payment_refund_truth',
    'refund_truth.settled_refund_minor',
    'refund_truth.settled_owner_refund_minor',
    "refund_truth.refund_truth_status IN ('none', 'providerBound')",
    'untrusted_refund_count',
    'unresolved_refund_count',
    'activationAllowed: false',
  ]) assert.match(source, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'u'));
});
