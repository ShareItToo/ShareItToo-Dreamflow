import assert from 'node:assert/strict';
import test from 'node:test';
import { assertExpectedFindingSet, classifyReadinessFindings } from '../ops/classify_readiness_findings.mjs';

const payment = [
  { source: 'payment_refund_truth', id_hash: 'a'.repeat(64), cause: 'refund_truth_needs_review', status: 'needsReview', time_class: '>24h' },
  { source: 'payment_refund_truth', id_hash: 'b'.repeat(64), cause: 'refund_truth_needs_review', status: 'needsReview', time_class: '1-24h' },
];
const support = [{ id_hash: 'c'.repeat(64), cause: 'next_update_overdue', status: 'open', priority: 'p3', time_class: '>24h' }];

test('classification is sanitized, source-aware and does not auto-resolve', () => {
  const result = classifyReadinessFindings({ fingerprint: { paymentRecoveryNeedsReview: payment, supportNextUpdateOverdue: support }, sourceEvidence: { ['a'.repeat(64)]: { classification: 'legacy_fixture' }, ['b'.repeat(64)]: { classification: 'staging_operation' }, ['c'.repeat(64)]: { classification: 'synthetic_fixture' } } });
  assert.equal(result.status, 'classified');
  assert.match(result.payment[0].remediation, /provider refund truth/u);
  assert.equal(result.support[0].classification, 'synthetic_fixture');
  assert.equal(result.liveRemediation, 'blocked-until-source-classification-and-expected-set-match');
});

test('expected set and drift fail closed', () => {
  const baseline = { paymentRecoveryNeedsReview: payment, supportNextUpdateOverdue: support };
  assert.equal(assertExpectedFindingSet({ baseline, current: baseline }), true);
  assert.throws(() => assertExpectedFindingSet({ baseline: { ...baseline, supportNextUpdateOverdue: [] }, current: baseline }), /expected_finding_count_mismatch/u);
  assert.throws(() => classifyReadinessFindings({ fingerprint: baseline, sourceEvidence: { z: { classification: 'unknown' } } }), /source_evidence_key_invalid/u);
});
