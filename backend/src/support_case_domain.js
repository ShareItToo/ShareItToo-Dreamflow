import crypto from 'node:crypto';

export const supportCaseFamilies = Object.freeze({
  general_help: Object.freeze([
    'login_or_registration',
    'profile_or_verification',
    'notification_or_push',
    'invoice_or_document',
    'app_error_or_display',
    'accessibility_or_usability',
    'general_how_to',
    'feedback_or_improvement',
  ]),
  booking_pre_start: Object.freeze([
    'booking_request_or_acceptance',
    'availability_or_overlap',
    'date_or_time_confirmation',
    'address_reveal',
    'delivery_or_collection',
    'pre_start_cancellation',
    'booking_change_or_extension',
  ]),
  active_handover: Object.freeze([
    'party_not_present',
    'item_not_as_listed',
    'handover_photo_missing',
    'qr_or_code_failure',
    'identity_or_person_mismatch',
    'unsafe_handover',
    'handover_confirmation_conflict',
  ]),
  active_rental: Object.freeze([
    'item_failure_or_defect',
    'unsafe_product_or_injury',
    'loss_or_theft',
    'usage_or_accessory_issue',
    'extension_request',
    'early_return_request',
    'contact_or_harassment',
  ]),
  active_return: Object.freeze([
    'party_not_present',
    'return_location_or_time',
    'return_photo_missing',
    'qr_or_code_failure',
    'condition_disagreement',
    'accessory_or_part_missing',
    'unsafe_return',
    'return_confirmation_conflict',
  ]),
  post_return_dispute: Object.freeze([
    'damage_report',
    'missing_item_report',
    'late_return_dispute',
    'cleaning_or_condition_dispute',
    'new_evidence_after_completion',
  ]),
  cancellation_no_show: Object.freeze([
    'renter_cancellation',
    'owner_cancellation',
    'mutual_cancellation',
    'handover_no_show',
    'return_no_show',
    'short_notice_acceptance_or_grace_period',
  ]),
  money_case: Object.freeze([
    'payment_failed_or_requires_action',
    'duplicate_or_unrecognized_charge',
    'refund_request_or_review',
    'refund_processing_or_failure',
    'payout_eligibility_or_hold',
    'payout_processing_or_failure',
    'chargeback_or_payment_dispute',
    'invoice_amount_or_fee',
  ]),
  trust_safety: Object.freeze([
    'threat_or_violence',
    'harassment_or_stalking',
    'suspected_fraud_or_impersonation',
    'offplatform_deposit_request',
    'account_takeover',
    'dangerous_item_or_injury',
    'self_harm_or_harm_threat',
    'repeated_abuse_or_evasion',
    'immediate_physical_danger',
  ]),
  moderation_content: Object.freeze([
    'illegal_content_notice',
    'prohibited_or_restricted_listing',
    'misleading_listing',
    'image_or_text_violation',
    'listing_visibility_or_removal',
    'account_or_service_restriction',
    'appeal_against_platform_action',
  ]),
  privacy_security: Object.freeze([
    'access_or_copy_request',
    'correction_or_deletion_request',
    'objection_or_restriction_request',
    'unauthorized_data_exposure',
    'suspected_personal_data_breach',
    'wrong_recipient_or_wrong_account',
    'identity_verification_for_rights_request',
  ]),
  legal_authority: Object.freeze([
    'law_enforcement_or_court_request',
    'regulator_or_data_protection_authority',
    'formal_legal_notice',
    'consumer_dispute_information',
    'policy_or_legal_ambiguity',
    'media_or_public_statement',
  ]),
  listing_quality: Object.freeze([
    'missing_required_information',
    'unclear_condition_or_accessories',
    'photo_quality',
    'category_or_pricing_clarification',
    'marketplace_improvement_guidance',
  ]),
});

export const supportCaseStatuses = Object.freeze([
  'received',
  'acknowledged',
  'waiting_for_user',
  'waiting_for_other_party',
  'under_review',
  'escalated',
  'decision_pending_approval',
  'decided',
  'resolved',
  'closed',
  'reopened',
]);

export const supportStatusMachineSource = Object.freeze({
  version: '1.0.0',
  packetVersion: 'SIT_SUPPORT_PACKET_V1_2026-08-20',
  driveFileId: '1qj0md6DoHt7lDAfIvFtmMiT0vQ48KbYG',
  sha256: '3cc58111a6079f9f82ce90d9fed18d4a8b10bd27191777ed30130d03fbbf2f55',
  statusCount: 11,
  transitionCount: 18,
});

export const supportPriorities = Object.freeze(['p0', 'p1', 'p2', 'p3', 'p4']);
export const supportApprovalLevels = Object.freeze([
  'green_automatic',
  'yellow_human_review',
  'red_explicit_decision',
]);
export const supportWaitingOnValues = Object.freeze([
  'none',
  'reporter',
  'other_party',
  'support_owner',
  'finance_owner',
  'trust_safety_owner',
  'privacy_owner',
  'legal_authority_owner',
  'external_processor',
]);
export const supportOwnerRoles = Object.freeze([
  'triage_owner',
  'general_support_owner',
  'booking_operations_owner',
  'finance_owner',
  'trust_safety_owner',
  'moderation_owner',
  'privacy_owner',
  'legal_authority_owner',
  'founder_approval',
]);

export const supportSafetyTriageVersion = 'sit_support_safety_triage_v1';
export const supportIntakeScopeVersion = 'sit_support_single_issue_scope_v1';
export const supportDsaNoticeIntakeVersion = 'sit_dsa_notice_intake_v1';
export const supportProductSafetyIntakeVersion = 'sit_product_safety_intake_v1';
export const supportProductSafetyContactPointVersion =
  'sit_product_safety_contact_point_v1';
export const supportFeedbackContextVersion = 'sit_support_feedback_context_v1';
export const supportDsaNoticeLocatorStatuses = Object.freeze([
  'complete',
  'needs_clarification',
]);
export const supportPacketVersion = 'SIT_SUPPORT_PACKET_V1_2026-08-20';
export const supportSafetyGuidanceVersion = 'T-003@1.0.0';

const severityValues = new Set(['low', 'moderate', 'high', 'critical']);
const sourceChannels = new Set(['app', 'web', 'email', 'phone', 'internal', 'api']);
const operatingModes = new Set(['simulation', 'internal_testing']);
const dsaNoticeContentTypes = new Set([
  'listing',
  'profile',
  'review',
  'message',
  'other',
]);
const productSafetyIssueKinds = new Set([
  'dangerous_product',
  'accident_or_injury',
]);
const supportFeedbackKinds = new Set([
  'improvement_suggestion',
  'non_urgent_explanation',
  'general_feedback',
]);
const supportFeedbackProductAreas = new Set([
  'app_experience',
  'listing_and_catalog',
  'booking_and_schedule',
  'handover_and_return',
  'payments_and_documents',
  'messages_and_notifications',
  'profile_and_account',
  'accessibility',
  'other',
]);
const dsaNoticeReferencePatterns = Object.freeze({
  listing: /^listing:[A-Za-z0-9][A-Za-z0-9_.-]{0,119}$/u,
  profile: /^profile:[A-Za-z0-9][A-Za-z0-9_.-]{0,119}$/u,
  review: /^review:[A-Za-z0-9][A-Za-z0-9_.-]{0,119}$/u,
  message: /^(?:message:[A-Za-z0-9][A-Za-z0-9_.-]{0,119}|thread:[A-Za-z0-9][A-Za-z0-9_.-]{0,119}:message:[A-Za-z0-9][A-Za-z0-9_.-]{0,119})$/u,
});
const waitingOnValues = new Set(supportWaitingOnValues);
const approvalLevels = new Set(supportApprovalLevels);
const ownerRoles = new Set(supportOwnerRoles);
const closureReasons = new Set([
  'resolved_action_completed',
  'information_provided',
  'user_withdrew',
  'duplicate_merged',
  'no_response_after_clear_deadline',
  'outside_scope_with_route',
]);

const statusTransitions = Object.freeze({
  received: new Set(['acknowledged']),
  acknowledged: new Set(['waiting_for_user', 'waiting_for_other_party', 'under_review']),
  waiting_for_user: new Set(['under_review']),
  waiting_for_other_party: new Set(['under_review']),
  under_review: new Set([
    'waiting_for_user',
    'waiting_for_other_party',
    'escalated',
    'decision_pending_approval',
    'decided',
  ]),
  escalated: new Set(['under_review']),
  decision_pending_approval: new Set(['decided', 'under_review']),
  decided: new Set(['resolved']),
  resolved: new Set(['closed']),
  closed: new Set(['reopened']),
  reopened: new Set(['under_review']),
});

const p0Subtypes = new Set([
  'immediate_physical_danger',
  'threat_or_violence',
  'self_harm_or_harm_threat',
  'account_takeover',
  'suspected_personal_data_breach',
  'unauthorized_data_exposure',
  'law_enforcement_or_court_request',
]);
const article18CandidateSubtypes = new Set([
  'threat_or_violence',
  'immediate_physical_danger',
]);
const p1Families = new Set(['active_handover', 'active_rental', 'active_return']);
const p1Subtypes = new Set([
  'handover_no_show',
  'offplatform_deposit_request',
]);
const p2Families = new Set([
  'booking_pre_start',
  'post_return_dispute',
  'cancellation_no_show',
  'money_case',
  'trust_safety',
  'moderation_content',
  'privacy_security',
  'legal_authority',
]);
const specializedIntakeRoutes = new Set([
  'active_handover:item_not_as_listed',
  'cancellation_no_show:handover_no_show',
  'trust_safety:offplatform_deposit_request',
]);

export class SupportCaseError extends Error {
  constructor(status, code, details = undefined) {
    super(code);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function requiredText(value, maximum, code, minimum = 1) {
  if (typeof value !== 'string') throw new SupportCaseError(400, code);
  const result = value.trim();
  if (result.length < minimum || result.length > maximum) {
    throw new SupportCaseError(400, code);
  }
  return result;
}

function optionalIdentifier(value, code, maximum = 120) {
  if (value === undefined || value === null || value === '') return null;
  const result = requiredText(value, maximum, code);
  if (!/^[A-Za-z0-9_.:-]+$/u.test(result)) throw new SupportCaseError(400, code);
  return result;
}

function optionalUuid(value, code) {
  if (value === undefined || value === null || value === '') return null;
  const result = requiredText(value, 36, code).toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(result)) {
    throw new SupportCaseError(400, code);
  }
  return result;
}

function requiredFutureDate(value, now, code, maximumDays = 31) {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  const upperBound = new Date(now.getTime() + (maximumDays * 24 * 60 * 60 * 1000));
  if (!Number.isFinite(date.getTime()) || date <= now || date > upperBound) {
    throw new SupportCaseError(400, code);
  }
  return date;
}

export function supportCaseIdempotencyKey(value, suffix = 'support.case') {
  const key = requiredText(value, 160, 'idempotency_key_required');
  if (!/^[A-Za-z0-9_.:-]+$/u.test(key)) {
    throw new SupportCaseError(400, 'invalid_idempotency_key');
  }
  return `${suffix}:${key}`;
}

function humanReadableRandomSuffix(randomBytes) {
  if (!Buffer.isBuffer(randomBytes) || randomBytes.length === 0) {
    throw new TypeError('random_bytes_required');
  }
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const entropy = randomBytes.length >= 12
    ? randomBytes.subarray(0, 12)
    : Buffer.concat([randomBytes, Buffer.alloc(12 - randomBytes.length)]);
  return [...entropy].map((byte) => alphabet[byte & 31]).join('');
}

export function newHumanReadableCaseNumber(randomBytes = crypto.randomBytes(12)) {
  return `SIT-${humanReadableRandomSuffix(randomBytes)}`;
}

export function newHumanReadableDsaNoticeNumber(randomBytes = crypto.randomBytes(12)) {
  return `SIT-N-${humanReadableRandomSuffix(randomBytes)}`;
}

export function newHumanReadableProductSafetyNoticeNumber(
  randomBytes = crypto.randomBytes(12),
) {
  return `SIT-P-${humanReadableRandomSuffix(randomBytes)}`;
}

export function supportRouteFor(caseType, caseSubType, signals = {}) {
  const family = supportCaseFamilies[caseType];
  if (!family) throw new SupportCaseError(400, 'support_case_type_invalid');
  if (!family.includes(caseSubType)) {
    throw new SupportCaseError(400, 'support_case_subtype_invalid');
  }

  const explicitP0Signal = signals.immediateDanger === true
    || signals.accountTakeover === true
    || signals.possibleHighRiskDataExposure === true
    || signals.imminentAuthorityDeadline === true;
  const article18CandidateFlag = caseType === 'trust_safety'
    && article18CandidateSubtypes.has(caseSubType);
  const productSafetyCandidate = caseType === 'trust_safety'
    && caseSubType === 'dangerous_item_or_injury';
  let priority = 'p3';
  if (explicitP0Signal || p0Subtypes.has(caseSubType)) priority = 'p0';
  else if (caseType === 'general_help'
      && caseSubType === 'feedback_or_improvement') priority = 'p4';
  else if (productSafetyCandidate) priority = 'p1';
  else if (p1Subtypes.has(caseSubType)) priority = 'p1';
  else if (p1Families.has(caseType)) priority = 'p1';
  else if (p2Families.has(caseType)) priority = 'p2';

  const baseOwnerRole = {
    general_help: 'general_support_owner',
    booking_pre_start: 'booking_operations_owner',
    active_handover: 'booking_operations_owner',
    active_rental: 'booking_operations_owner',
    active_return: 'booking_operations_owner',
    post_return_dispute: 'booking_operations_owner',
    cancellation_no_show: 'booking_operations_owner',
    money_case: 'finance_owner',
    trust_safety: 'trust_safety_owner',
    moderation_content: 'moderation_owner',
    privacy_security: 'privacy_owner',
    legal_authority: 'legal_authority_owner',
    listing_quality: 'general_support_owner',
  }[caseType];
  const ownerRole = signals.immediateDanger === true
    ? 'trust_safety_owner'
    : baseOwnerRole;
  const redDecisionBoundary = priority === 'p0'
    || ['money_case', 'privacy_security', 'legal_authority'].includes(caseType)
    || caseSubType === 'illegal_content_notice'
    || caseSubType === 'account_takeover'
    || productSafetyCandidate;
  const approvalLevel = redDecisionBoundary
    ? 'red_explicit_decision'
    : (['general_help', 'listing_quality'].includes(caseType)
        && ['p3', 'p4'].includes(priority)
      ? 'green_automatic'
      : 'yellow_human_review');
  const waitingOn = {
    finance_owner: 'finance_owner',
    trust_safety_owner: 'trust_safety_owner',
    privacy_owner: 'privacy_owner',
    legal_authority_owner: 'legal_authority_owner',
  }[ownerRole] ?? 'support_owner';

  return Object.freeze({
    priority,
    severity: priority === 'p0' ? 'critical' : (priority === 'p1' ? 'high' : (priority === 'p2' ? 'moderate' : 'low')),
    ownerRole,
    approvalLevel,
    waitingOn,
    safetyFlag: caseType === 'trust_safety' || explicitP0Signal,
    privacyFlag: caseType === 'privacy_security' || signals.possibleHighRiskDataExposure === true,
    dsaFlag: caseType === 'moderation_content',
    authorityFlag: caseType === 'legal_authority'
      || signals.imminentAuthorityDeadline === true
      || article18CandidateFlag
      || productSafetyCandidate,
    article18CandidateFlag,
    moneyFlag: caseType === 'money_case',
    accountTakeoverFlag: caseSubType === 'account_takeover' || signals.accountTakeover === true,
  });
}

function normalizeProductSafetyNotice(raw, { required }) {
  if (!required) {
    if (raw !== undefined && raw !== null) {
      throw new SupportCaseError(400, 'support_product_safety_notice_not_applicable');
    }
    return null;
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new SupportCaseError(400, 'support_product_safety_notice_required');
  }
  const allowedKeys = new Set([
    'version',
    'contactPointVersion',
    'issueKind',
    'productIdentification',
    'riskDescription',
    'injuryOccurred',
    'safetyGuidanceAcknowledged',
  ]);
  if (Object.keys(raw).some((key) => !allowedKeys.has(key))) {
    throw new SupportCaseError(400, 'support_product_safety_notice_invalid');
  }
  const version = requiredText(
    raw.version,
    80,
    'support_product_safety_version_invalid',
  );
  if (version !== supportProductSafetyIntakeVersion) {
    throw new SupportCaseError(400, 'support_product_safety_version_invalid');
  }
  const contactPointVersion = requiredText(
    raw.contactPointVersion,
    80,
    'support_product_safety_contact_point_version_invalid',
  );
  if (contactPointVersion !== supportProductSafetyContactPointVersion) {
    throw new SupportCaseError(
      400,
      'support_product_safety_contact_point_version_invalid',
    );
  }
  const issueKind = requiredText(
    raw.issueKind,
    60,
    'support_product_safety_issue_kind_invalid',
  ).toLowerCase();
  if (!productSafetyIssueKinds.has(issueKind)) {
    throw new SupportCaseError(400, 'support_product_safety_issue_kind_invalid');
  }
  if (typeof raw.injuryOccurred !== 'boolean') {
    throw new SupportCaseError(400, 'support_product_safety_injury_state_invalid');
  }
  if (raw.safetyGuidanceAcknowledged !== true) {
    throw new SupportCaseError(400, 'support_product_safety_guidance_required');
  }
  return Object.freeze({
    version,
    contactPointVersion,
    issueKind,
    productIdentification: requiredText(
      raw.productIdentification,
      300,
      'support_product_safety_product_identification_required',
      3,
    ),
    riskDescription: requiredText(
      raw.riskDescription,
      2000,
      'support_product_safety_risk_description_required',
      20,
    ),
    injuryOccurred: raw.injuryOccurred,
    safetyGuidanceAcknowledged: true,
  });
}

function normalizeSupportSafetyTriage(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new SupportCaseError(400, 'support_safety_triage_required');
  }
  const version = requiredText(
    raw.version,
    80,
    'support_safety_triage_version_invalid',
  );
  if (version !== supportSafetyTriageVersion) {
    throw new SupportCaseError(400, 'support_safety_triage_version_invalid');
  }
  const packetVersion = requiredText(
    raw.packetVersion,
    80,
    'support_packet_version_invalid',
  );
  if (packetVersion !== supportPacketVersion) {
    throw new SupportCaseError(400, 'support_packet_version_invalid');
  }
  const guidanceVersion = requiredText(
    raw.guidanceVersion,
    80,
    'support_safety_guidance_version_invalid',
  );
  if (guidanceVersion !== supportSafetyGuidanceVersion) {
    throw new SupportCaseError(400, 'support_safety_guidance_version_invalid');
  }
  if (typeof raw.immediateDanger !== 'boolean'
      || typeof raw.guidanceShown !== 'boolean') {
    throw new SupportCaseError(400, 'support_safety_triage_answer_invalid');
  }
  if (raw.guidanceShown !== raw.immediateDanger) {
    throw new SupportCaseError(400, 'support_safety_guidance_evidence_invalid');
  }
  return Object.freeze({
    version,
    packetVersion,
    guidanceVersion,
    immediateDanger: raw.immediateDanger,
    guidanceShown: raw.guidanceShown,
  });
}

function normalizeSupportIssueScope(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new SupportCaseError(400, 'support_issue_scope_required');
  }
  const version = requiredText(
    raw.version,
    80,
    'support_issue_scope_version_invalid',
  );
  if (version !== supportIntakeScopeVersion) {
    throw new SupportCaseError(400, 'support_issue_scope_version_invalid');
  }
  if (typeof raw.singleIssueConfirmed !== 'boolean'
      || typeof raw.separationGuidanceShown !== 'boolean') {
    throw new SupportCaseError(400, 'support_issue_scope_answer_invalid');
  }
  if (raw.singleIssueConfirmed !== true) {
    throw new SupportCaseError(400, 'support_single_issue_confirmation_required');
  }
  return Object.freeze({
    version,
    singleIssueConfirmed: true,
    separationGuidanceShown: raw.separationGuidanceShown,
  });
}

function normalizeSupportFeedbackContext(raw, { required }) {
  if (!required) {
    if (raw !== undefined && raw !== null) {
      throw new SupportCaseError(400, 'support_feedback_context_not_applicable');
    }
    return null;
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new SupportCaseError(400, 'support_feedback_context_required');
  }
  const allowedKeys = new Set([
    'version',
    'feedbackKind',
    'productArea',
    'nonUrgentConfirmed',
  ]);
  const keys = Object.keys(raw);
  if (keys.length !== allowedKeys.size
      || keys.some((key) => !allowedKeys.has(key))) {
    throw new SupportCaseError(400, 'support_feedback_context_shape_invalid');
  }
  const version = requiredText(
    raw.version,
    80,
    'support_feedback_context_version_invalid',
  );
  if (version !== supportFeedbackContextVersion) {
    throw new SupportCaseError(400, 'support_feedback_context_version_invalid');
  }
  const feedbackKind = requiredText(
    raw.feedbackKind,
    60,
    'support_feedback_kind_invalid',
  ).toLowerCase();
  if (!supportFeedbackKinds.has(feedbackKind)) {
    throw new SupportCaseError(400, 'support_feedback_kind_invalid');
  }
  const productArea = requiredText(
    raw.productArea,
    80,
    'support_feedback_product_area_invalid',
  ).toLowerCase();
  if (!supportFeedbackProductAreas.has(productArea)) {
    throw new SupportCaseError(400, 'support_feedback_product_area_invalid');
  }
  if (raw.nonUrgentConfirmed !== true) {
    throw new SupportCaseError(400, 'support_feedback_non_urgent_confirmation_required');
  }
  return Object.freeze({
    version,
    feedbackKind,
    productArea,
    nonUrgentConfirmed: true,
  });
}

function normalizeDsaNotice(raw, { required }) {
  if (!required) {
    if (raw !== undefined && raw !== null) {
      throw new SupportCaseError(400, 'support_dsa_notice_not_applicable');
    }
    return null;
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new SupportCaseError(400, 'support_dsa_notice_required');
  }
  const allowedKeys = new Set([
    'version',
    'contentType',
    'contentLocator',
    'illegalityStatement',
    'jurisdictionOrLegalBasis',
    'goodFaithConfirmed',
  ]);
  if (Object.keys(raw).some((key) => !allowedKeys.has(key))) {
    throw new SupportCaseError(400, 'support_dsa_notice_shape_invalid');
  }
  const version = requiredText(
    raw.version,
    80,
    'support_dsa_notice_version_invalid',
  );
  if (version !== supportDsaNoticeIntakeVersion) {
    throw new SupportCaseError(400, 'support_dsa_notice_version_invalid');
  }
  const contentType = requiredText(
    raw.contentType,
    20,
    'support_dsa_notice_content_type_invalid',
  ).toLowerCase();
  if (!dsaNoticeContentTypes.has(contentType)) {
    throw new SupportCaseError(400, 'support_dsa_notice_content_type_invalid');
  }
  if (raw.goodFaithConfirmed !== true) {
    throw new SupportCaseError(400, 'support_dsa_notice_good_faith_required');
  }
  const jurisdictionOrLegalBasis = raw.jurisdictionOrLegalBasis === undefined
      || raw.jurisdictionOrLegalBasis === null
      || raw.jurisdictionOrLegalBasis === ''
    ? null
    : requiredText(
      raw.jurisdictionOrLegalBasis,
      2000,
      'support_dsa_notice_legal_basis_invalid',
    );
  const locator = classifyDsaNoticeLocator(raw.contentLocator, contentType);
  return Object.freeze({
    version,
    contentType,
    contentLocator: locator.contentLocator,
    locatorStatus: locator.locatorStatus,
    locatorKind: locator.locatorKind,
    illegalityStatement: requiredText(
      raw.illegalityStatement,
      8000,
      'support_dsa_notice_illegality_statement_invalid',
      20,
    ),
    jurisdictionOrLegalBasis,
    goodFaithConfirmed: true,
  });
}

export function classifyDsaNoticeLocator(value, contentType, {
  requireExact = false,
} = {}) {
  if (!dsaNoticeContentTypes.has(contentType)) {
    throw new SupportCaseError(400, 'support_dsa_notice_content_type_invalid');
  }
  if (value !== undefined && value !== null && typeof value !== 'string') {
    throw new SupportCaseError(400, 'support_dsa_notice_locator_invalid');
  }
  const contentLocator = value?.trim() || null;
  if (contentLocator != null && contentLocator.length > 2000) {
    throw new SupportCaseError(400, 'support_dsa_notice_locator_invalid');
  }

  let locatorKind = null;
  if (contentLocator != null) {
    try {
      const url = new URL(contentLocator);
      if (['http:', 'https:'].includes(url.protocol)
          && url.hostname
          && !url.username
          && !url.password) {
        locatorKind = 'url';
      }
    } catch {
      // A non-URL may still be an exact, type-bound SIT reference below.
    }
    if (locatorKind == null
        && dsaNoticeReferencePatterns[contentType]?.test(contentLocator)) {
      locatorKind = `${contentType}_reference`;
    }
  }

  if (requireExact && locatorKind == null) {
    throw new SupportCaseError(
      422,
      'support_dsa_notice_locator_exact_required',
      { accepted: ['http_or_https_url', `${contentType}_reference`] },
    );
  }
  return Object.freeze({
    contentLocator,
    locatorStatus: locatorKind == null ? 'needs_clarification' : 'complete',
    locatorKind,
  });
}

export function normalizeDsaNoticeLocatorCompletion(raw, { contentType }) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new SupportCaseError(400, 'support_dsa_notice_locator_completion_invalid');
  }
  const allowedKeys = new Set(['contentLocator', 'expectedVersion']);
  if (Object.keys(raw).some((key) => !allowedKeys.has(key))) {
    throw new SupportCaseError(400, 'support_dsa_notice_locator_completion_invalid');
  }
  const expectedVersion = Number(raw.expectedVersion);
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
    throw new SupportCaseError(400, 'support_expected_version_invalid');
  }
  return Object.freeze({
    ...classifyDsaNoticeLocator(raw.contentLocator, contentType, {
      requireExact: true,
    }),
    expectedVersion,
  });
}

export function normalizeSupportCaseInput(raw, {
  sourceChannel = 'app',
  operatingMode = 'simulation',
  specializedIntakeAuthority = null,
  nextUpdateAt,
  now = new Date(),
} = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new SupportCaseError(400, 'support_case_invalid');
  }
  if (!sourceChannels.has(sourceChannel)) {
    throw new SupportCaseError(400, 'support_source_channel_invalid');
  }
  if (!operatingModes.has(operatingMode)) {
    throw new SupportCaseError(400, 'support_operating_mode_invalid');
  }
  const caseType = requiredText(raw.caseType, 60, 'support_case_type_invalid').toLowerCase();
  const caseSubType = requiredText(raw.caseSubType, 100, 'support_case_subtype_invalid').toLowerCase();
  if (specializedIntakeRoutes.has(`${caseType}:${caseSubType}`)
      && specializedIntakeAuthority !== 'handover_exception_workflow') {
    throw new SupportCaseError(409, 'support_specialized_intake_required');
  }
  const safetyTriage = normalizeSupportSafetyTriage(raw.safetyTriage);
  const issueScope = normalizeSupportIssueScope(raw.issueScope);
  if (raw.immediateDanger !== undefined
      && raw.immediateDanger !== safetyTriage.immediateDanger) {
    throw new SupportCaseError(400, 'support_safety_triage_conflict');
  }
  const feedbackCase = caseType === 'general_help'
    && caseSubType === 'feedback_or_improvement';
  const feedbackContext = normalizeSupportFeedbackContext(raw.feedbackContext, {
    required: feedbackCase,
  });
  if (feedbackCase && (
    safetyTriage.immediateDanger === true
    || raw.accountTakeover === true
    || raw.possibleHighRiskDataExposure === true
    || raw.imminentAuthorityDeadline === true
  )) {
    throw new SupportCaseError(400, 'support_feedback_urgent_route_required');
  }
  const route = supportRouteFor(caseType, caseSubType, {
    immediateDanger: safetyTriage.immediateDanger,
    accountTakeover: raw.accountTakeover,
    possibleHighRiskDataExposure: raw.possibleHighRiskDataExposure,
    imminentAuthorityDeadline: raw.imminentAuthorityDeadline,
  });
  const dsaNotice = normalizeDsaNotice(raw.dsaNotice, {
    required: caseType === 'moderation_content'
      && caseSubType === 'illegal_content_notice',
  });
  const productSafetyNotice = normalizeProductSafetyNotice(
    raw.productSafetyNotice,
    {
      required: caseType === 'trust_safety'
        && caseSubType === 'dangerous_item_or_injury',
    },
  );
  const internalCheckpointMinutes = {
    p0: 15,
    p1: 60,
    p2: 240,
    p3: 1440,
    p4: 1440,
  }[route.priority];
  const deadline = nextUpdateAt === undefined
    ? new Date(now.getTime() + (internalCheckpointMinutes * 60 * 1000))
    : requiredFutureDate(nextUpdateAt, now, 'support_next_update_at_required');

  const links = Object.freeze({
    linkedBookingId: optionalIdentifier(
      raw.linkedBookingId,
      'support_linked_booking_invalid',
    ),
    linkedListingId: optionalIdentifier(
      raw.linkedListingId,
      'support_linked_listing_invalid',
    ),
    linkedPaymentId: optionalUuid(raw.linkedPaymentId, 'support_linked_payment_invalid'),
    linkedRefundId: optionalUuid(raw.linkedRefundId, 'support_linked_refund_invalid'),
    linkedPayoutId: optionalUuid(raw.linkedPayoutId, 'support_linked_payout_invalid'),
  });
  if (feedbackCase && Object.values(links).some((value) => value !== null)) {
    throw new SupportCaseError(400, 'support_feedback_entity_link_not_allowed');
  }

  return Object.freeze({
    caseType,
    caseSubType,
    status: 'received',
    ...route,
    sourceChannel,
    operatingMode,
    locale: 'de-DE',
    ...links,
    safetyTriage,
    issueScope,
    dsaNotice,
    productSafetyNotice,
    feedbackContext,
    waitingReason: 'Der Eingang wartet auf die fachliche Übernahme.',
    nextAction: route.priority === 'p0'
      ? 'Sicherheitsroute unverzüglich prüfen und einem verantwortlichen Owner zuweisen.'
      : (feedbackCase
        ? 'Feedback beantworten und dem bestätigten Produktbereich zuordnen.'
        : 'Eingang fachlich prüfen und einem verantwortlichen Owner zuweisen.'),
    nextUpdateAt: deadline,
    userFacingSummary: requiredText(raw.summary, 2000, 'support_summary_required', 3),
  });
}

export function canTransitionSupportCase(fromStatus, toStatus) {
  return statusTransitions[fromStatus]?.has(toStatus) === true;
}

export function normalizeSupportCaseTransition(caseRecord, raw, {
  actorRole,
  now = new Date(),
} = {}) {
  if (!caseRecord || typeof caseRecord !== 'object' || !raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new SupportCaseError(400, 'support_transition_invalid');
  }
  if (!['support', 'admin', 'system'].includes(actorRole)) {
    throw new SupportCaseError(403, 'support_transition_forbidden');
  }
  const toStatus = requiredText(raw.status, 40, 'support_status_invalid').toLowerCase();
  if (!supportCaseStatuses.includes(toStatus) || toStatus === 'paused') {
    throw new SupportCaseError(400, 'support_status_invalid');
  }
  if (!canTransitionSupportCase(caseRecord.status, toStatus)) {
    throw new SupportCaseError(409, 'support_transition_not_allowed', {
      fromStatus: caseRecord.status,
      toStatus,
    });
  }
  const expectedVersion = Number(raw.expectedVersion);
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1
      || expectedVersion !== Number(caseRecord.lock_version)) {
    throw new SupportCaseError(409, 'support_case_version_conflict');
  }
  const reason = requiredText(raw.reason, 2000, 'support_transition_reason_required', 3);
  const updates = {
    status: toStatus,
    transitionReason: reason,
    waitingOn: 'none',
    waitingReason: null,
    nextAction: null,
    nextUpdateAt: null,
    userActionDueAt: null,
    currentOwnerRole: caseRecord.current_owner_role,
    currentOwnerId: caseRecord.current_owner_id ?? null,
    escalationTargetRole: null,
    decisionId: caseRecord.decision_id ?? null,
    implementationPendingAction: null,
    resolutionReference: null,
    closureReason: null,
    reopenReason: null,
    appealAvailable: caseRecord.appeal_available === true,
    appealDeadline: caseRecord.appeal_deadline
      ? new Date(caseRecord.appeal_deadline)
      : null,
  };

  const activeNext = () => {
    updates.nextAction = requiredText(raw.nextAction, 2000, 'support_next_action_required', 3);
    updates.nextUpdateAt = requiredFutureDate(raw.nextUpdateAt, now, 'support_next_update_at_required');
  };

  if (['acknowledged', 'under_review', 'reopened'].includes(toStatus)) {
    activeNext();
    updates.waitingOn = raw.waitingOn ?? 'support_owner';
  }
  if (toStatus === 'waiting_for_user' || toStatus === 'waiting_for_other_party') {
    activeNext();
    updates.waitingOn = toStatus === 'waiting_for_user' ? 'reporter' : 'other_party';
    updates.waitingReason = requiredText(raw.waitingReason, 2000, 'support_waiting_reason_required', 3);
    if (toStatus === 'waiting_for_user') {
      updates.userActionDueAt = requiredFutureDate(
        raw.userActionDueAt,
        now,
        'support_user_action_due_at_required',
      );
    }
  }
  if (toStatus === 'escalated') {
    activeNext();
    updates.escalationTargetRole = requiredText(
      raw.escalationTargetRole,
      80,
      'support_escalation_target_required',
    );
    if (!ownerRoles.has(updates.escalationTargetRole)) {
      throw new SupportCaseError(400, 'support_escalation_target_invalid');
    }
    updates.currentOwnerRole = updates.escalationTargetRole;
    updates.currentOwnerId = optionalIdentifier(raw.currentOwnerId, 'support_owner_invalid');
    updates.waitingOn = {
      finance_owner: 'finance_owner',
      trust_safety_owner: 'trust_safety_owner',
      privacy_owner: 'privacy_owner',
      legal_authority_owner: 'legal_authority_owner',
    }[updates.currentOwnerRole] ?? 'support_owner';
  }
  if (toStatus === 'decision_pending_approval') {
    activeNext();
    updates.waitingOn = 'support_owner';
    if (caseRecord.approval_level === 'green_automatic') {
      throw new SupportCaseError(409, 'support_decision_approval_level_invalid');
    }
    updates.decisionId = optionalUuid(raw.decisionId, 'support_decision_id_required');
    if (!updates.decisionId) throw new SupportCaseError(400, 'support_decision_id_required');
  }
  if (toStatus === 'decided') {
    activeNext();
    updates.waitingOn = 'support_owner';
    updates.decisionId = optionalUuid(raw.decisionId, 'support_decision_id_required');
    if (!updates.decisionId) throw new SupportCaseError(400, 'support_decision_id_required');
    if (caseRecord.decision_id && updates.decisionId !== caseRecord.decision_id) {
      throw new SupportCaseError(409, 'support_decision_id_mismatch');
    }
  }
  if (toStatus === 'resolved') {
    updates.resolutionReference = requiredText(
      raw.resolutionReference,
      2000,
      'support_resolution_reference_required',
      3,
    );
    if (caseRecord.priority === 'p0' && actorRole !== 'admin') {
      throw new SupportCaseError(403, 'support_p0_resolution_requires_admin');
    }
  }
  if (toStatus === 'closed') {
    updates.closureReason = requiredText(raw.closureReason, 80, 'support_closure_reason_required');
    if (!closureReasons.has(updates.closureReason)) {
      throw new SupportCaseError(400, 'support_closure_reason_invalid');
    }
    if (typeof raw.appealAvailable !== 'boolean') {
      throw new SupportCaseError(400, 'support_appeal_configuration_required');
    }
    updates.appealAvailable = raw.appealAvailable;
    if (updates.appealAvailable) {
      if (!caseRecord.decision_id) {
        throw new SupportCaseError(409, 'support_appeal_requires_published_decision');
      }
      updates.appealDeadline = requiredFutureDate(
        raw.appealDeadline,
        now,
        'support_appeal_deadline_required',
        366,
      );
    } else {
      if (raw.appealDeadline !== undefined && raw.appealDeadline !== null) {
        throw new SupportCaseError(400, 'support_appeal_deadline_without_availability');
      }
      updates.appealDeadline = null;
    }
    if (caseRecord.priority === 'p0' && actorRole !== 'admin') {
      throw new SupportCaseError(403, 'support_p0_closure_requires_admin');
    }
  }
  if (toStatus === 'reopened') {
    updates.reopenReason = requiredText(raw.reopenReason, 2000, 'support_reopen_reason_required', 3);
    updates.currentOwnerId = optionalIdentifier(raw.currentOwnerId, 'support_owner_invalid');
    if (!updates.currentOwnerId) {
      throw new SupportCaseError(400, 'support_reopen_owner_required');
    }
    updates.appealAvailable = false;
  }
  if (toStatus === 'under_review' && caseRecord.status === 'decision_pending_approval') {
    updates.decisionId = null;
  }
  if (!waitingOnValues.has(updates.waitingOn)) {
    throw new SupportCaseError(400, 'support_waiting_on_invalid');
  }
  if (!ownerRoles.has(updates.currentOwnerRole)) {
    throw new SupportCaseError(400, 'support_owner_role_invalid');
  }
  if (!approvalLevels.has(caseRecord.approval_level) || !severityValues.has(caseRecord.severity)) {
    throw new SupportCaseError(409, 'support_case_state_invalid');
  }
  return Object.freeze(updates);
}
