const REPORT_TARGETS = new Set(['user', 'listing', 'booking', 'message', 'review']);
const REPORT_PRIORITIES = new Set(['low', 'normal', 'high', 'urgent']);
const REVIEW_DIRECTIONS = new Set(['renter_to_owner', 'owner_to_renter']);
const REVIEW_CRITERIA = Object.freeze([
  'communication',
  'reliability',
  'article_as_described',
  'handover_return',
]);
const MODERATION_DETECTION_METHODS = new Set(['human', 'automated', 'hybrid']);
const MODERATION_DECISION_GROUNDS = new Set([
  'alleged_illegal_content',
  'terms_violation',
]);
const MODERATION_DECISION_ORIGINS = new Set(['notice', 'own_initiative']);
const MODERATION_AUTOMATION_ROLES = new Set(['none', 'signal', 'decision_support']);
const MODERATION_DURATION_TYPES = new Set([
  'fixed',
  'until_reversed',
  'not_applicable',
]);
export const moderationStatementVersion = 'sit_dsa_statement_of_reasons_v1';

const REPORT_TRANSITIONS = Object.freeze({
  support: Object.freeze({
    open: new Set(['triaged', 'investigating']),
    triaged: new Set(['investigating']),
    investigating: new Set(['triaged']),
    actioned: new Set([]),
    dismissed: new Set([]),
    closed: new Set([]),
  }),
  admin: Object.freeze({
    open: new Set(['triaged', 'investigating', 'dismissed', 'closed']),
    triaged: new Set(['investigating', 'dismissed', 'closed']),
    investigating: new Set(['triaged', 'actioned', 'dismissed', 'closed']),
    actioned: new Set(['investigating', 'closed']),
    dismissed: new Set(['investigating', 'closed']),
    closed: new Set(['investigating']),
  }),
});

export class ModerationDomainError extends Error {
  constructor(status, code, details = undefined) {
    super(code);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function requiredText(value, maximum, code) {
  if (typeof value !== 'string') throw new ModerationDomainError(400, code);
  const result = value.trim();
  if (!result || result.length > maximum) throw new ModerationDomainError(400, code);
  return result;
}

function optionalText(value, maximum, code) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new ModerationDomainError(400, code);
  const result = value.trim();
  if (!result) return null;
  if (result.length > maximum) throw new ModerationDomainError(400, code);
  return result;
}

export function moderationIdempotencyKey(value, suffix = 'moderation') {
  const key = requiredText(value, 200, 'idempotency_key_required');
  if (!/^[A-Za-z0-9_.:-]+$/.test(key)) {
    throw new ModerationDomainError(400, 'invalid_idempotency_key');
  }
  return `${suffix}:${key}`;
}

export function normalizeReportInput(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ModerationDomainError(400, 'invalid_report');
  }
  const targetType = requiredText(raw.targetType, 30, 'invalid_report_target_type').toLowerCase();
  if (!REPORT_TARGETS.has(targetType)) {
    throw new ModerationDomainError(400, 'invalid_report_target_type');
  }
  const targetId = requiredText(raw.targetId, 160, 'invalid_report_target');
  const reasonCode = requiredText(raw.reasonCode, 120, 'invalid_report_reason').toLowerCase();
  if (!/^[a-z0-9_.:-]+$/.test(reasonCode)) {
    throw new ModerationDomainError(400, 'invalid_report_reason');
  }
  const priority = optionalText(raw.priority, 20, 'invalid_report_priority') ?? 'normal';
  if (!REPORT_PRIORITIES.has(priority)) {
    throw new ModerationDomainError(400, 'invalid_report_priority');
  }
  const evidenceUploadIds = raw.evidenceUploadIds ?? [];
  if (!Array.isArray(evidenceUploadIds) || evidenceUploadIds.length > 8) {
    throw new ModerationDomainError(400, 'invalid_report_evidence');
  }
  const evidence = [...new Set(evidenceUploadIds.map((value) => String(value).trim()))];
  if (evidence.some((value) => !/^[0-9a-f-]{36}$/i.test(value))) {
    throw new ModerationDomainError(400, 'invalid_report_evidence');
  }
  return {
    targetType,
    targetId,
    reasonCode,
    priority,
    details: optionalText(raw.details, 8000, 'invalid_report_details'),
    reporterReference: optionalText(raw.reference, 500, 'invalid_report_reference'),
    evidenceUploadIds: evidence,
  };
}

export function normalizeHarassmentBlockReportInput(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ModerationDomainError(400, 'invalid_harassment_block_report');
  }
  const allowedKeys = new Set([
    'targetUserId',
    'immediateDanger',
    'details',
    'reference',
    'evidenceUploadIds',
  ]);
  if (Object.keys(raw).some((key) => !allowedKeys.has(key))) {
    throw new ModerationDomainError(400, 'invalid_harassment_block_report_fields');
  }
  if (raw.immediateDanger === true) {
    throw new ModerationDomainError(409, 'immediate_danger_requires_safety_path');
  }
  if (raw.immediateDanger !== false) {
    throw new ModerationDomainError(400, 'non_acute_confirmation_required');
  }
  return Object.freeze({
    ...normalizeReportInput({
      targetType: 'user',
      targetId: raw.targetUserId,
      reasonCode: 'harassment',
      priority: 'normal',
      details: raw.details,
      reference: raw.reference,
      evidenceUploadIds: raw.evidenceUploadIds,
    }),
    immediateDanger: false,
  });
}

export function canTransitionReport({ role, fromStatus, toStatus }) {
  if (fromStatus === toStatus) return true;
  return REPORT_TRANSITIONS[role]?.[fromStatus]?.has(toStatus) === true;
}

export function assertReportTransition({ role, fromStatus, toStatus, resolution }) {
  if (!canTransitionReport({ role, fromStatus, toStatus })) {
    throw new ModerationDomainError(409, 'invalid_report_transition', {
      role,
      fromStatus,
      toStatus,
    });
  }
  if (['actioned', 'dismissed', 'closed'].includes(toStatus)
      && (!resolution || typeof resolution !== 'object' || Array.isArray(resolution))) {
    throw new ModerationDomainError(400, 'report_resolution_required');
  }
}

export function moderationReviewDeadline(issuedAt) {
  const date = issuedAt instanceof Date ? new Date(issuedAt) : new Date(issuedAt);
  if (!Number.isFinite(date.getTime())) {
    throw new ModerationDomainError(400, 'moderation_decision_time_invalid');
  }
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + 6);
  const lastDay = new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    0,
  )).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date;
}

export function normalizeModerationDecisionInput(raw, { statementRequired = false } = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ModerationDomainError(400, 'moderation_decision_required');
  }
  const detectionMethod = requiredText(
    raw.detectionMethod,
    30,
    'moderation_detection_method_required',
  ).toLowerCase();
  if (!MODERATION_DETECTION_METHODS.has(detectionMethod)) {
    throw new ModerationDomainError(400, 'moderation_detection_method_invalid');
  }
  const automatedMeans = optionalText(
    raw.automatedMeans,
    2000,
    'moderation_automated_means_invalid',
  );
  if (detectionMethod === 'human' && automatedMeans) {
    throw new ModerationDomainError(400, 'moderation_automated_means_not_applicable');
  }
  if (detectionMethod !== 'human' && !automatedMeans) {
    throw new ModerationDomainError(400, 'moderation_automated_means_required');
  }
  const base = {
    facts: requiredText(raw.facts, 8000, 'moderation_facts_required'),
    basis: requiredText(raw.basis, 2000, 'moderation_basis_required'),
    reasoning: requiredText(raw.reasoning, 8000, 'moderation_reasoning_required'),
    detectionMethod,
    automatedMeans,
  };
  if (statementRequired && detectionMethod === 'automated') {
    throw new ModerationDomainError(400, 'moderation_human_review_required');
  }
  if (!statementRequired && raw.statementOfReasons === undefined) {
    return Object.freeze(base);
  }
  const statement = raw.statementOfReasons;
  if (!statement || typeof statement !== 'object' || Array.isArray(statement)) {
    throw new ModerationDomainError(400, 'moderation_statement_of_reasons_required');
  }
  const decisionGround = requiredText(
    statement.decisionGround,
    60,
    'moderation_decision_ground_required',
  ).toLowerCase();
  if (!MODERATION_DECISION_GROUNDS.has(decisionGround)) {
    throw new ModerationDomainError(400, 'moderation_decision_ground_invalid');
  }
  const decisionOrigin = requiredText(
    statement.decisionOrigin,
    60,
    'moderation_decision_origin_required',
  ).toLowerCase();
  if (!MODERATION_DECISION_ORIGINS.has(decisionOrigin)) {
    throw new ModerationDomainError(400, 'moderation_decision_origin_invalid');
  }
  const automationRole = requiredText(
    statement.automationRole,
    60,
    'moderation_automation_role_required',
  ).toLowerCase();
  if (!MODERATION_AUTOMATION_ROLES.has(automationRole)) {
    throw new ModerationDomainError(400, 'moderation_automation_role_invalid');
  }
  if (detectionMethod === 'human' && automationRole !== 'none') {
    throw new ModerationDomainError(400, 'moderation_automation_role_not_applicable');
  }
  if (detectionMethod !== 'human' && automationRole === 'none') {
    throw new ModerationDomainError(400, 'moderation_automation_role_required');
  }
  const durationType = requiredText(
    statement.durationType,
    60,
    'moderation_duration_type_required',
  ).toLowerCase();
  if (!MODERATION_DURATION_TYPES.has(durationType)) {
    throw new ModerationDomainError(400, 'moderation_duration_type_invalid');
  }
  const endsAt = statement.endsAt === undefined || statement.endsAt === null
    || statement.endsAt === ''
    ? null
    : new Date(statement.endsAt);
  if (durationType === 'fixed' && (!endsAt || !Number.isFinite(endsAt.getTime()))) {
    throw new ModerationDomainError(400, 'moderation_statement_end_required');
  }
  if (durationType === 'until_reversed' && endsAt) {
    throw new ModerationDomainError(400, 'moderation_statement_end_not_applicable');
  }
  if (durationType === 'not_applicable' && endsAt) {
    throw new ModerationDomainError(400, 'moderation_statement_end_not_applicable');
  }
  return Object.freeze({
    ...base,
    statementOfReasons: Object.freeze({
      version: moderationStatementVersion,
      decisionGround,
      decisionOrigin,
      territorialScope: requiredText(
        statement.territorialScope,
        2000,
        'moderation_territorial_scope_required',
      ),
      durationType,
      endsAt,
      automationRole,
    }),
  });
}

export function normalizeModerationReviewRequestInput(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ModerationDomainError(400, 'moderation_review_request_invalid');
  }
  return Object.freeze({
    reason: requiredText(raw.reason, 8000, 'moderation_review_reason_required'),
  });
}

export function normalizeReviewInput(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ModerationDomainError(400, 'invalid_review');
  }
  const direction = requiredText(raw.direction, 40, 'invalid_review_direction');
  if (!REVIEW_DIRECTIONS.has(direction)) {
    throw new ModerationDomainError(400, 'invalid_review_direction');
  }
  if (!Array.isArray(raw.criteria) || raw.criteria.length !== REVIEW_CRITERIA.length) {
    throw new ModerationDomainError(400, 'incomplete_review_criteria');
  }
  const byKey = new Map();
  for (const value of raw.criteria) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new ModerationDomainError(400, 'invalid_review_criterion');
    }
    const key = requiredText(value.key, 80, 'invalid_review_criterion');
    const stars = Number(value.stars);
    if (!REVIEW_CRITERIA.includes(key) || byKey.has(key)
        || !Number.isInteger(stars) || stars < 1 || stars > 5) {
      throw new ModerationDomainError(400, 'invalid_review_criterion');
    }
    byKey.set(key, {
      key,
      stars,
      note: optionalText(value.note, 1000, 'invalid_review_note'),
    });
  }
  if (REVIEW_CRITERIA.some((key) => !byKey.has(key))) {
    throw new ModerationDomainError(400, 'incomplete_review_criteria');
  }
  const criteria = REVIEW_CRITERIA.map((key) => byKey.get(key));
  const rating = Math.round((criteria.reduce((sum, item) => sum + item.stars, 0)
    / criteria.length) * 10) / 10;
  const notes = criteria
    .filter((item) => item.note)
    .map((item) => `${item.key}: ${item.note}`)
    .join('\n');
  return {
    direction,
    criteria,
    rating,
    body: notes || null,
  };
}

export function shapeReview(row) {
  return {
    id: row.id,
    bookingId: row.booking_id,
    itemId: row.listing_id,
    reviewerId: row.reviewer_id,
    reviewedUserId: row.reviewee_id,
    direction: row.direction,
    rating: Number(row.rating),
    criteria: Array.isArray(row.criteria) ? row.criteria : [],
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export function shapeStaffUser(row, role) {
  const profile = row.profile && typeof row.profile === 'object' ? row.profile : {};
  return {
    id: row.id,
    displayName: String(profile.displayName ?? 'Mitglied').slice(0, 80),
    role: row.role,
    accountStatus: row.account_status,
    emailVerified: Boolean(row.email_verified_at),
    createdAt: new Date(row.created_at).toISOString(),
    ...(role === 'admin' ? { email: row.email } : {}),
  };
}

export const reviewCriterionKeys = REVIEW_CRITERIA;
