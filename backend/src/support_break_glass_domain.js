import { SupportCaseError, supportCaseIdempotencyKey } from './support_case_domain.js';

export const supportBreakGlassReasonCodes = Object.freeze([
  'p0_immediate_safety_response',
  'p0_incident_containment',
  'p0_assignment_failure_continuity',
]);

export const supportBreakGlassReviewOutcomes = Object.freeze([
  'appropriate',
  'concern_escalated',
]);

const reasonCodes = new Set(supportBreakGlassReasonCodes);
const reviewOutcomes = new Set(supportBreakGlassReviewOutcomes);
const forbiddenSecretAssignment = /(?:api[_ -]?key|client[_ -]?secret|password|passwort|pin|token)\s*[:=]\s*\S+/iu;

function requiredText(value, { minimum, maximum, code }) {
  if (typeof value !== 'string') throw new SupportCaseError(400, code);
  const result = value.trim();
  if (result.length < minimum || result.length > maximum || /[\u0000-\u001f\u007f]/u.test(result)) {
    throw new SupportCaseError(400, code);
  }
  if (/[<>]/u.test(result) || forbiddenSecretAssignment.test(result)) {
    throw new SupportCaseError(400, code);
  }
  return result;
}

export function normalizeSupportBreakGlassRequest(raw, idempotencyKey) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new SupportCaseError(400, 'support_break_glass_reason_required');
  }
  const reasonCode = requiredText(raw.reasonCode, {
    minimum: 3,
    maximum: 80,
    code: 'support_break_glass_reason_required',
  });
  if (!reasonCodes.has(reasonCode)) {
    throw new SupportCaseError(400, 'support_break_glass_reason_invalid');
  }
  const justification = requiredText(raw.justification, {
    minimum: 12,
    maximum: 500,
    code: 'support_break_glass_justification_invalid',
  });
  return Object.freeze({
    reasonCode,
    justification,
    idempotencyKey: supportCaseIdempotencyKey(
      idempotencyKey,
      'support.break_glass.create',
    ),
  });
}

export function normalizeSupportBreakGlassReview(raw, idempotencyKey) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new SupportCaseError(400, 'support_break_glass_review_required');
  }
  const outcome = requiredText(raw.outcome, {
    minimum: 3,
    maximum: 40,
    code: 'support_break_glass_review_outcome_required',
  });
  if (!reviewOutcomes.has(outcome)) {
    throw new SupportCaseError(400, 'support_break_glass_review_outcome_invalid');
  }
  const notes = requiredText(raw.notes, {
    minimum: 12,
    maximum: 1000,
    code: 'support_break_glass_review_notes_invalid',
  });
  return Object.freeze({
    outcome,
    notes,
    idempotencyKey: supportCaseIdempotencyKey(
      idempotencyKey,
      'support.break_glass.review',
    ),
  });
}
