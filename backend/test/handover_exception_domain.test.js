import assert from 'node:assert/strict';
import test from 'node:test';

import {
  handoverExceptionAuditMetadata,
  HandoverExceptionError,
  handoverExceptionFingerprint,
  normalizeHandoverExceptionInput,
} from '../src/handover_exception_domain.js';
import {
  normalizeSupportCaseInput,
  supportIntakeScopeVersion,
  supportPacketVersion,
  supportSafetyGuidanceVersion,
  supportSafetyTriageVersion,
} from '../src/support_case_domain.js';

function intake(kind, overrides = {}) {
  return {
    kind,
    details: 'Beobachtbare Fakten zur Übergabesituation.',
    immediateDanger: false,
    safeAbortGuidanceAcknowledged: kind === 'item_mismatch',
    doNotPayGuidanceAcknowledged: kind === 'offplatform_deposit_request',
    contactAttemptAcknowledged: kind === 'party_no_show',
    ...overrides,
  };
}

test('the three handover exceptions have exact server-owned P1 routes', () => {
  const mismatch = normalizeHandoverExceptionInput(intake('item_mismatch'));
  assert.deepEqual(mismatch.route, {
    caseType: 'active_handover',
    caseSubType: 'item_not_as_listed',
    priority: 'p1',
    safeAbortGuidanceRequired: true,
    doNotPayGuidanceRequired: false,
    contactAttemptRequired: false,
    trustSafetyReviewRequired: false,
  });

  const deposit = normalizeHandoverExceptionInput(
    intake('offplatform_deposit_request'),
  );
  assert.equal(deposit.route.caseSubType, 'offplatform_deposit_request');
  assert.equal(deposit.route.trustSafetyReviewRequired, true);

  const noShow = normalizeHandoverExceptionInput(intake('party_no_show'));
  assert.equal(noShow.route.caseType, 'cancellation_no_show');
  assert.equal(noShow.route.caseSubType, 'handover_no_show');
  assert.equal(noShow.route.priority, 'p1');
});

test('client routing, acute danger and missing or surplus acknowledgements fail closed', () => {
  for (const raw of [
    { ...intake('item_mismatch'), priority: 'p4' },
    intake('item_mismatch', { immediateDanger: true }),
    intake('item_mismatch', { safeAbortGuidanceAcknowledged: false }),
    intake('party_no_show', { contactAttemptAcknowledged: false }),
    intake('offplatform_deposit_request', {
      doNotPayGuidanceAcknowledged: false,
    }),
    intake('party_no_show', { safeAbortGuidanceAcknowledged: true }),
  ]) {
    assert.throws(
      () => normalizeHandoverExceptionInput(raw),
      (error) => error instanceof HandoverExceptionError,
    );
  }
});

test('audit receipt is deterministic, minimized and non-decisional', () => {
  const normalized = normalizeHandoverExceptionInput(intake('item_mismatch'));
  const requestFingerprint = handoverExceptionFingerprint({
    bookingId: 'booking-1',
    actorId: 'renter-1',
    normalized,
  });
  const receipt = handoverExceptionAuditMetadata({
    normalized,
    supportCaseId: 'case-1',
    workflowStatus: 'confirmed',
    contactAttemptCount: 0,
    counterpartyConfirmedAppointment: false,
    requestFingerprint,
  });
  assert.equal(Object.keys(receipt).length, 19);
  assert.match(receipt.requestFingerprint, /^[0-9a-f]{64}$/u);
  assert.equal(receipt.handoverCompletionChanged, false);
  assert.equal(receipt.bookingStatusChanged, false);
  assert.equal(receipt.moneyOutcomeDecided, false);
  assert.equal(receipt.guiltDetermined, false);
  assert.equal(receipt.accountMeasureTaken, false);
  assert.equal(receipt.listingMeasureTaken, false);
  assert.equal(JSON.stringify(receipt).includes(normalized.details), false);
});

test('generic support intake cannot bypass the specialized server workflow', () => {
  const rawSupport = {
    caseType: 'trust_safety',
    caseSubType: 'offplatform_deposit_request',
    summary: 'Eine externe Sicherheitszahlung wurde verlangt.',
    safetyTriage: {
      version: supportSafetyTriageVersion,
      packetVersion: supportPacketVersion,
      guidanceVersion: supportSafetyGuidanceVersion,
      immediateDanger: false,
      guidanceShown: false,
    },
    issueScope: {
      version: supportIntakeScopeVersion,
      singleIssueConfirmed: true,
      separationGuidanceShown: false,
    },
  };
  assert.throws(
    () => normalizeSupportCaseInput(rawSupport),
    (error) => error.code === 'support_specialized_intake_required',
  );
  const authorized = normalizeSupportCaseInput(rawSupport, {
    specializedIntakeAuthority: 'handover_exception_workflow',
  });
  assert.equal(authorized.priority, 'p1');
  assert.equal(authorized.currentOwnerRole, undefined);
  assert.equal(authorized.ownerRole, 'trust_safety_owner');
});
