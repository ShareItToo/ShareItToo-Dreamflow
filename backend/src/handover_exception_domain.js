import crypto from 'node:crypto';

export const handoverExceptionVersion = 'v52_handover_exception_v1';

export const handoverExceptionRoutes = Object.freeze({
  item_mismatch: Object.freeze({
    caseType: 'active_handover',
    caseSubType: 'item_not_as_listed',
    priority: 'p1',
    safeAbortGuidanceRequired: true,
    doNotPayGuidanceRequired: false,
    contactAttemptRequired: false,
    trustSafetyReviewRequired: false,
  }),
  offplatform_deposit_request: Object.freeze({
    caseType: 'trust_safety',
    caseSubType: 'offplatform_deposit_request',
    priority: 'p1',
    safeAbortGuidanceRequired: false,
    doNotPayGuidanceRequired: true,
    contactAttemptRequired: false,
    trustSafetyReviewRequired: true,
  }),
  party_no_show: Object.freeze({
    caseType: 'cancellation_no_show',
    caseSubType: 'handover_no_show',
    priority: 'p1',
    safeAbortGuidanceRequired: false,
    doNotPayGuidanceRequired: false,
    contactAttemptRequired: true,
    trustSafetyReviewRequired: false,
  }),
});

export class HandoverExceptionError extends Error {
  constructor(status, code, details = undefined) {
    super(code);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function requiredText(value, maximum, code, minimum = 1) {
  if (typeof value !== 'string') throw new HandoverExceptionError(400, code);
  const normalized = value.trim();
  if (normalized.length < minimum || normalized.length > maximum) {
    throw new HandoverExceptionError(400, code);
  }
  return normalized;
}

export function handoverExceptionIdempotencyKey(value) {
  const normalized = requiredText(
    value,
    160,
    'idempotency_key_required',
    8,
  );
  if (!/^[A-Za-z0-9_.:-]+$/u.test(normalized)) {
    throw new HandoverExceptionError(400, 'invalid_idempotency_key');
  }
  return normalized;
}

export function normalizeHandoverExceptionInput(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new HandoverExceptionError(400, 'handover_exception_invalid');
  }
  const allowedKeys = new Set([
    'kind',
    'details',
    'immediateDanger',
    'safeAbortGuidanceAcknowledged',
    'doNotPayGuidanceAcknowledged',
    'contactAttemptAcknowledged',
  ]);
  if (Object.keys(raw).some((key) => !allowedKeys.has(key))) {
    throw new HandoverExceptionError(400, 'handover_exception_client_authority_forbidden');
  }
  if (raw.immediateDanger !== false) {
    throw new HandoverExceptionError(409, 'handover_exception_safety_route_required');
  }
  const kind = requiredText(raw.kind, 80, 'handover_exception_kind_invalid');
  const route = handoverExceptionRoutes[kind];
  if (!route) {
    throw new HandoverExceptionError(400, 'handover_exception_kind_invalid');
  }
  const details = requiredText(raw.details, 1400, 'handover_exception_details_required', 10);
  const safeAbortGuidanceAcknowledged = raw.safeAbortGuidanceAcknowledged === true;
  const doNotPayGuidanceAcknowledged = raw.doNotPayGuidanceAcknowledged === true;
  const contactAttemptAcknowledged = raw.contactAttemptAcknowledged === true;
  if (route.safeAbortGuidanceRequired && !safeAbortGuidanceAcknowledged) {
    throw new HandoverExceptionError(400, 'handover_exception_safe_abort_acknowledgement_required');
  }
  if (route.doNotPayGuidanceRequired && !doNotPayGuidanceAcknowledged) {
    throw new HandoverExceptionError(400, 'handover_exception_do_not_pay_acknowledgement_required');
  }
  if (route.contactAttemptRequired && !contactAttemptAcknowledged) {
    throw new HandoverExceptionError(400, 'handover_exception_contact_attempt_acknowledgement_required');
  }
  if (!route.safeAbortGuidanceRequired && safeAbortGuidanceAcknowledged) {
    throw new HandoverExceptionError(400, 'handover_exception_unexpected_acknowledgement');
  }
  if (!route.doNotPayGuidanceRequired && doNotPayGuidanceAcknowledged) {
    throw new HandoverExceptionError(400, 'handover_exception_unexpected_acknowledgement');
  }
  if (!route.contactAttemptRequired && contactAttemptAcknowledged) {
    throw new HandoverExceptionError(400, 'handover_exception_unexpected_acknowledgement');
  }
  return Object.freeze({
    kind,
    details,
    route,
    safeAbortGuidanceAcknowledged,
    doNotPayGuidanceAcknowledged,
    contactAttemptAcknowledged,
  });
}

export function handoverExceptionFingerprint({ bookingId, actorId, normalized }) {
  const canonical = JSON.stringify({
    version: handoverExceptionVersion,
    bookingId,
    actorId,
    kind: normalized.kind,
    details: normalized.details,
    safeAbortGuidanceAcknowledged: normalized.safeAbortGuidanceAcknowledged,
    doNotPayGuidanceAcknowledged: normalized.doNotPayGuidanceAcknowledged,
    contactAttemptAcknowledged: normalized.contactAttemptAcknowledged,
  });
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
}

export function handoverExceptionAuditMetadata({
  normalized,
  supportCaseId,
  workflowStatus,
  contactAttemptCount,
  counterpartyConfirmedAppointment,
  requestFingerprint,
}) {
  return Object.freeze({
    version: handoverExceptionVersion,
    kind: normalized.kind,
    supportCaseId,
    supportCaseType: normalized.route.caseType,
    supportCaseSubtype: normalized.route.caseSubType,
    priority: normalized.route.priority,
    workflowStatus,
    counterpartyConfirmedAppointment,
    contactAttemptCount,
    safeAbortGuidanceAcknowledged: normalized.safeAbortGuidanceAcknowledged,
    doNotPayGuidanceAcknowledged: normalized.doNotPayGuidanceAcknowledged,
    trustSafetyReviewRequired: normalized.route.trustSafetyReviewRequired,
    handoverCompletionChanged: false,
    bookingStatusChanged: false,
    moneyOutcomeDecided: false,
    guiltDetermined: false,
    accountMeasureTaken: false,
    listingMeasureTaken: false,
    requestFingerprint,
  });
}
