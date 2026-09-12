import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeSupportArticle18Assessment,
} from '../src/support_article18_domain.js';

function reportingAssessment(overrides = {}) {
  return {
    determination: 'reporting_path_required',
    routingBasis: 'concerned_member_state_identified',
    factualBasis:
      'Verified synthetic facts require an authorized Article 18 routing review.',
    evidenceReferences: ['support-evidence:synthetic-1'],
    concernedMemberStates: ['de'],
    informationScope: ['case_reference', 'evidence_digest'],
    reviewerAuthorizationEvidenceRef: 'internal-test:admin-step-up',
    humanReviewed: true,
    automationRole: 'none',
    noAutomatedDispatchConfirmed: true,
    ...overrides,
  };
}

test('Article 18 reporting-path preparation is human-only and external delivery stays disabled', () => {
  const result = normalizeSupportArticle18Assessment(
    reportingAssessment(),
    'article18-assessment-1',
  );
  assert.equal(result.determination, 'reporting_path_required');
  assert.equal(result.routingBasis, 'concerned_member_state_identified');
  assert.deepEqual(result.concernedMemberStates, ['DE']);
  assert.deepEqual(result.informationScope, ['case_reference', 'evidence_digest']);
  assert.equal(result.humanReviewed, true);
  assert.equal(result.automationRole, 'none');
  assert.equal(result.externalDeliveryAllowed, false);
  assert.equal(result.externalDeliveryStatus, 'disabled_not_configured');
  assert.equal(
    result.idempotencyKey,
    'support.article18.assessment:article18-assessment-1',
  );
});

test('unknown concerned state uses the explicit establishment-or-Europol fallback route', () => {
  const result = normalizeSupportArticle18Assessment(reportingAssessment({
    routingBasis: 'state_not_identified_fallback_required',
    concernedMemberStates: [],
  }), 'article18-assessment-fallback');
  assert.deepEqual(result.concernedMemberStates, []);
  assert.equal(result.routingBasis, 'state_not_identified_fallback_required');
});

test('non-reporting outcomes cannot carry a disclosure scope', () => {
  assert.throws(
    () => normalizeSupportArticle18Assessment(reportingAssessment({
      determination: 'not_established',
    }), 'article18-invalid-non-reporting'),
    /support_article18_non_reporting_scope_forbidden/u,
  );
});

test('missing human review, auto-dispatch confirmation or authorization evidence fails closed', () => {
  for (const [overrides, pattern] of [
    [{ humanReviewed: false }, /support_article18_human_review_required/u],
    [{ automationRole: 'classifier' }, /support_article18_human_review_required/u],
    [{ noAutomatedDispatchConfirmed: false }, /support_article18_no_auto_dispatch_confirmation_required/u],
    [{ reviewerAuthorizationEvidenceRef: '' }, /support_article18_reviewer_authorization_required/u],
    [{ reviewerAuthorizationEvidenceRef: 'approval with spaces' }, /support_article18_reviewer_authorization_required/u],
  ]) {
    assert.throws(
      () => normalizeSupportArticle18Assessment(
        reportingAssessment(overrides),
        `article18-invalid-${pattern.source}`,
      ),
      pattern,
    );
  }
});

test('assessment text and references reject credentials, markup and duplicates', () => {
  assert.throws(
    () => normalizeSupportArticle18Assessment(reportingAssessment({
      factualBasis: 'Password: should-not-be-recorded-in-this-assessment',
    }), 'article18-secret'),
    /support_article18_factual_basis_invalid/u,
  );
  assert.throws(
    () => normalizeSupportArticle18Assessment(reportingAssessment({
      evidenceReferences: ['evidence:1', 'evidence:1'],
    }), 'article18-duplicate'),
    /support_article18_evidence_references_invalid/u,
  );
});
