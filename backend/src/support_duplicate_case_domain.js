import { SupportCaseError } from './support_case_domain.js';

export const supportDuplicateCaseLinkVersion = 'support_duplicate_case_link_v1';

const identifiers = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/u;
const forbiddenCaseTypes = new Set([
  'privacy_security',
  'moderation_content',
  'legal_authority',
]);

export function normalizeSupportDuplicateCaseLink(raw, idempotencyKey) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new SupportCaseError(400, 'support_duplicate_case_link_invalid');
  }
  const duplicateExpectedVersion = Number(raw.duplicateExpectedVersion);
  const leadingExpectedVersion = Number(raw.leadingExpectedVersion);
  const leadingCaseId = typeof raw.leadingCaseId === 'string'
    ? raw.leadingCaseId.trim()
    : '';
  if (!Number.isSafeInteger(duplicateExpectedVersion)
      || duplicateExpectedVersion < 1
      || !Number.isSafeInteger(leadingExpectedVersion)
      || leadingExpectedVersion < 1) {
    throw new SupportCaseError(400, 'support_duplicate_case_version_invalid');
  }
  if (!identifiers.test(leadingCaseId)) {
    throw new SupportCaseError(400, 'support_duplicate_leading_case_invalid');
  }
  if (raw.sameCoreFactsConfirmed !== true
      || raw.sameParticipantsAndObjectsConfirmed !== true
      || raw.sameDecisionQuestionConfirmed !== true
      || raw.noSeparateDeadlineLossConfirmed !== true
      || raw.privacyDsaSeparationConfirmed !== true) {
    throw new SupportCaseError(400, 'support_duplicate_case_confirmations_required');
  }
  const key = typeof idempotencyKey === 'string' ? idempotencyKey.trim() : '';
  if (!identifiers.test(key)) {
    throw new SupportCaseError(400, 'idempotency_key_required');
  }
  return Object.freeze({
    duplicateExpectedVersion,
    leadingExpectedVersion,
    leadingCaseId,
    idempotencyKey: `support.duplicate-case-link:${key}`,
  });
}

function sorted(values) {
  return [...(values ?? [])].map(String).sort((left, right) => left.localeCompare(right));
}

export function assertSupportDuplicateCaseCompatibility(duplicateCase, leadingCase) {
  if (!duplicateCase || !leadingCase
      || duplicateCase.id === leadingCase.id
      || duplicateCase.status !== 'resolved'
      || ['resolved', 'closed'].includes(leadingCase.status)
      || !['simulation', 'internal_testing'].includes(duplicateCase.operating_mode)
      || duplicateCase.operating_mode !== leadingCase.operating_mode) {
    throw new SupportCaseError(409, 'support_duplicate_case_state_invalid');
  }
  if (forbiddenCaseTypes.has(duplicateCase.case_type)
      || forbiddenCaseTypes.has(leadingCase.case_type)
      || duplicateCase.privacy_flag === true
      || leadingCase.privacy_flag === true
      || duplicateCase.dsa_flag === true
      || leadingCase.dsa_flag === true
      || duplicateCase.authority_flag === true
      || leadingCase.authority_flag === true) {
    throw new SupportCaseError(409, 'support_duplicate_case_separate_lane_required');
  }
  if (duplicateCase.case_type !== leadingCase.case_type
      || duplicateCase.case_subtype !== leadingCase.case_subtype
      || duplicateCase.reporter_user_id !== leadingCase.reporter_user_id
      || JSON.stringify(sorted(duplicateCase.affected_user_ids))
        !== JSON.stringify(sorted(leadingCase.affected_user_ids))) {
    throw new SupportCaseError(409, 'support_duplicate_case_scope_mismatch');
  }
  for (const field of [
    'linked_booking_id',
    'linked_listing_id',
    'linked_payment_id',
    'linked_refund_id',
    'linked_payout_id',
  ]) {
    if ((duplicateCase[field] ?? null) !== (leadingCase[field] ?? null)) {
      throw new SupportCaseError(409, 'support_duplicate_case_scope_mismatch');
    }
  }
}
