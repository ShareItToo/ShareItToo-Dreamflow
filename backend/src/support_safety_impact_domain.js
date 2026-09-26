import { SupportCaseError } from './support_case_domain.js';

export const supportSafetyImpactReviewVersion = 'support_safety_impact_review_v1';

const identifiers = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/u;
const actionRelevantWorkflowStatuses = new Set([
  'requested',
  'accepted',
  'payment_pending',
  'confirmed',
  'active',
  'withdrawalReturnRequired',
  'returned',
  'disputed',
]);

export function isSupportSafetyImpactCase(row) {
  return (row?.case_type === 'moderation_content'
      && row?.case_subtype === 'prohibited_or_restricted_listing')
    || (row?.case_type === 'trust_safety'
      && row?.case_subtype === 'dangerous_item_or_injury');
}

export function isProtectedSupportSafetyIntake(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  if (raw.caseType === 'trust_safety') return true;
  return (raw.caseType === 'active_handover' && raw.caseSubType === 'unsafe_handover')
    || (raw.caseType === 'active_rental' && raw.caseSubType === 'unsafe_product_or_injury')
    || (raw.caseType === 'active_return' && raw.caseSubType === 'unsafe_return')
    || (raw.caseType === 'moderation_content'
      && raw.caseSubType === 'prohibited_or_restricted_listing')
    || raw.safetyTriage?.immediateDanger === true;
}

export function normalizeSupportSafetyImpactReview(raw, idempotencyKey) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new SupportCaseError(400, 'support_safety_impact_review_invalid');
  }
  const expectedVersion = Number(raw.expectedVersion);
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
    throw new SupportCaseError(400, 'support_safety_impact_case_version_invalid');
  }
  if (raw.scopeReviewed !== true
      || raw.proportionalityBoundaryConfirmed !== true
      || raw.noAutomatedActionConfirmed !== true) {
    throw new SupportCaseError(400, 'support_safety_impact_confirmations_required');
  }
  const key = typeof idempotencyKey === 'string' ? idempotencyKey.trim() : '';
  if (!identifiers.test(key)) {
    throw new SupportCaseError(400, 'idempotency_key_required');
  }
  return Object.freeze({
    expectedVersion,
    idempotencyKey: `support.safety-impact-review:${key}`,
  });
}

export function classifySupportSafetyBookingScope(rows) {
  if (!Array.isArray(rows) || rows.length > 200) {
    throw new SupportCaseError(409, 'support_safety_impact_scope_too_large');
  }
  const seen = new Set();
  const bookings = rows.map((row) => {
    const id = typeof row?.id === 'string' ? row.id.trim() : '';
    const workflowStatus = typeof row?.workflow_status === 'string'
      ? row.workflow_status.trim()
      : '';
    if (!identifiers.test(id) || !workflowStatus || seen.has(id)) {
      throw new SupportCaseError(409, 'support_safety_impact_booking_scope_invalid');
    }
    seen.add(id);
    return Object.freeze({ id, workflowStatus });
  }).sort((left, right) => left.id.localeCompare(right.id));
  return Object.freeze({
    bookings: Object.freeze(bookings),
    actionRelevantBookingIds: Object.freeze(bookings
      .filter((booking) => actionRelevantWorkflowStatuses.has(booking.workflowStatus))
      .map((booking) => booking.id)),
    historicalBookingIds: Object.freeze(bookings
      .filter((booking) => !actionRelevantWorkflowStatuses.has(booking.workflowStatus))
      .map((booking) => booking.id)),
  });
}
