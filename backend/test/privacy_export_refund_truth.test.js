import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL('../src/privacy_export.js', import.meta.url),
  'utf8',
);
const paymentQueryStart = source.indexOf('`SELECT payment.id, payment.booking_id,');
const paymentQueryEnd = source.indexOf(
  'rows(client,\n      `SELECT refund.id',
  paymentQueryStart,
);
const paymentQuery = source.slice(paymentQueryStart, paymentQueryEnd);

test('privacy payment export labels cached values as unverified', () => {
  assert.ok(paymentQueryStart >= 0 && paymentQueryEnd > paymentQueryStart);
  assert.match(
    paymentQuery,
    /payment\.status AS stored_payment_status_unverified/u,
  );
  assert.match(
    paymentQuery,
    /payment\.refunded_minor AS stored_refunded_minor_unverified/u,
  );
  assert.doesNotMatch(paymentQuery, /payment\.status\s*,/u);
  assert.doesNotMatch(paymentQuery, /payment\.refunded_minor\s*,/u);
});

test('privacy payment export separates provider and local settlement truth', () => {
  assert.match(
    paymentQuery,
    /LEFT JOIN sit_payment_refund_truth AS refund_truth[\s\S]*refund_truth\.payment_id = payment\.id/u,
  );
  assert.match(paymentQuery, /refund_truth\.refund_truth_status/u);
  assert.match(
    paymentQuery,
    /refund_truth\.payment_id IS NULL[\s\S]*refund_truth\.refund_truth_status = 'needsReview'[\s\S]*AS refund_truth_needs_review/u,
  );
  assert.match(
    paymentQuery,
    /refund_truth\.refund_truth_status = 'pending'[\s\S]*AS refund_truth_pending/u,
  );
  assert.match(
    paymentQuery,
    /WHEN refund_truth\.payment_id IS NULL[\s\S]*refund_truth\.refund_truth_status = 'needsReview'[\s\S]*THEN NULL[\s\S]*refund\.status = 'succeeded'[\s\S]*refund\.provider_refund_id IS NOT NULL[\s\S]*refund\.succeeded_at IS NOT NULL[\s\S]*refund\.failure_code IS NULL[\s\S]*refund\.provider_refund_model = \$2[\s\S]*refund\.legacy_refund_platform_fee_claim IS NULL[\s\S]*AS provider_confirmed_refunded_minor/u,
  );
  assert.match(
    paymentQuery,
    /WHEN refund_truth\.payment_id IS NULL[\s\S]*refund_truth\.refund_truth_status = 'needsReview'[\s\S]*THEN NULL[\s\S]*refund_truth\.settled_refund_minor[\s\S]*AS locally_settled_refunded_minor/u,
  );
});

test('privacy payment export exposes a verified amount only for stable truth', () => {
  assert.match(
    paymentQuery,
    /WHEN refund_truth\.refund_truth_status IN \('none', 'providerBound'\)[\s\S]*THEN refund_truth\.settled_refund_minor[\s\S]*ELSE NULL[\s\S]*AS verified_refunded_minor/u,
  );
});
