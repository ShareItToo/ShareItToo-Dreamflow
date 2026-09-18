#!/usr/bin/env node

import { assertReadinessFindingsUnchanged, normalizeReadinessFindings } from './staging_forward_migration_rehearsal.mjs';

function fail(code) {
  const error = new Error(`Readiness finding classification failed: ${code}`);
  error.code = code;
  throw error;
}

export function classifyReadinessFindings({ fingerprint, sourceEvidence = {} } = {}) {
  const normalized = normalizeReadinessFindings(fingerprint);
  const evidenceKeys = Object.keys(sourceEvidence);
  for (const key of evidenceKeys) {
    if (!/^[0-9a-f]{64}$/u.test(key)) fail('source_evidence_key_invalid');
    const value = sourceEvidence[key];
    if (!value || !['staging_operation', 'synthetic_fixture', 'legacy_fixture', 'unknown'].includes(value.classification)) {
      fail('source_evidence_classification_invalid');
    }
  }
  const payment = normalized.paymentRecoveryNeedsReview.map((finding) => Object.freeze({
    ...finding,
    classification: sourceEvidence[finding.id_hash]?.classification ?? 'unknown',
    remediation: finding.cause === 'refund_truth_needs_review'
      ? 'reconcile provider refund truth and perform authorized review; do not auto-resolve'
      : finding.cause === 'contract_blocked'
        ? 'repair/approve exact contract binding through authorized workflow; do not auto-resolve'
        : 'perform cause-specific payment recovery review; do not auto-resolve',
  }));
  const support = normalized.supportNextUpdateOverdue.map((finding) => Object.freeze({
    ...finding,
    classification: sourceEvidence[finding.id_hash]?.classification ?? 'unknown',
    remediation: 'support owner must post a valid progress update or close via the governed workflow; do not auto-resolve',
  }));
  return Object.freeze({
    status: payment.some((finding) => finding.classification === 'unknown') || support.some((finding) => finding.classification === 'unknown')
      ? 'source-readback-required'
      : 'classified',
    payment,
    support,
    liveRemediation: 'blocked-until-source-classification-and-expected-set-match',
  });
}

export function assertExpectedFindingSet({ baseline, current, expectedPaymentCount = 2, expectedSupportCount = 1 } = {}) {
  const before = normalizeReadinessFindings(baseline);
  const after = normalizeReadinessFindings(current);
  if (before.paymentRecoveryNeedsReview.length !== expectedPaymentCount
      || before.supportNextUpdateOverdue.length !== expectedSupportCount) fail('expected_finding_count_mismatch');
  assertReadinessFindingsUnchanged(before, after);
  return true;
}
