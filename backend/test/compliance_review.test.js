import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  evaluateProfessionalReviewTrigger,
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

test('fee query counts only live fully captured fees and live successful platform refunds', () => {
  const source = readFileSync(new URL('../src/compliance_review.js', import.meta.url), 'utf8');
  for (const marker of [
    'payment.livemode = true',
    'payment.captured_minor = payment.amount_minor',
    "refund.status = 'succeeded'",
    'refund.livemode = true',
    'refund.platform_share_minor',
    'activationAllowed: false',
  ]) assert.match(source, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'u'));
});
