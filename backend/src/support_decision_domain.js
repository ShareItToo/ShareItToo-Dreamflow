import crypto from 'node:crypto';

import { SupportCaseError } from './support_case_domain.js';

const decisionCodes = /^[a-z0-9_.:-]+$/u;
const identifiers = /^[A-Za-z0-9_.:-]+$/u;
const hashes = /^[0-9a-f]{64}$/u;
const measureTypes = new Set([
  'information_only',
  'no_measure',
  'simulated_refund_review',
  'simulated_payout_review',
  'temporary_safety_review',
  'moderation_review',
  'privacy_response_review',
  'legal_response_review',
]);
const implementationTransitions = Object.freeze({
  not_started: new Set(['pending', 'succeeded', 'failed']),
  pending: new Set(['succeeded', 'failed']),
  succeeded: new Set(['reversed']),
  failed: new Set(['pending']),
  reversed: new Set(),
});

function requiredText(value, maximum, code, minimum = 1) {
  if (typeof value !== 'string') throw new SupportCaseError(400, code);
  const result = value.trim();
  if (result.length < minimum || result.length > maximum) {
    throw new SupportCaseError(400, code);
  }
  return result;
}

function optionalText(value, maximum, code) {
  if (value === undefined || value === null || value === '') return null;
  return requiredText(value, maximum, code);
}

function requiredUuid(value, code) {
  const result = requiredText(value, 36, code).toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(result)) {
    throw new SupportCaseError(400, code);
  }
  return result;
}

function boundedTextArray(value, code, { minimum = 0, maximum = 50, itemMaximum = 2000 } = {}) {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
    throw new SupportCaseError(400, code);
  }
  const result = value.map((item) => requiredText(item, itemMaximum, code, 3));
  if (new Set(result).size !== result.length) throw new SupportCaseError(400, code);
  return Object.freeze(result);
}

function boundedIdentifiers(value, code) {
  const result = boundedTextArray(value ?? [], code, { maximum: 50, itemMaximum: 160 });
  if (result.some((item) => !identifiers.test(item))) throw new SupportCaseError(400, code);
  return result;
}

function integer(value, code, { minimum = 1 } = {}) {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < minimum) throw new SupportCaseError(400, code);
  return result;
}

function exactHash(value, code) {
  const result = requiredText(value, 64, code).toLowerCase();
  if (!hashes.test(result)) throw new SupportCaseError(400, code);
  return result;
}

function canonicalPayload(value) {
  return JSON.stringify({
    decisionCode: value.decisionCode,
    decisionScope: value.decisionScope,
    confirmedFactsConsidered: value.confirmedFactsConsidered,
    materialUncertainties: value.materialUncertainties,
    policySnapshotId: value.policySnapshotId,
    ruleReference: value.ruleReference,
    measureType: value.measureType,
    amountMinor: value.amountMinor,
    currency: value.currency,
    duration: value.duration,
    affectedEntityIds: value.affectedEntityIds,
    unaffectedAreas: value.unaffectedAreas,
    implementationPlan: value.implementationPlan,
    automationUsed: value.automationUsed,
    recommendationId: value.recommendationId,
    userFacingDecision: value.userFacingDecision,
    userFacingEffect: value.userFacingEffect,
    userFacingReason: value.userFacingReason,
    userFacingImplementationResult: value.userFacingImplementationResult,
    internalReason: value.internalReason,
    redressRoute: value.redressRoute,
  });
}

export function supportDecisionIdempotencyKey(value, suffix = 'support.decision') {
  const key = requiredText(value, 160, 'idempotency_key_required');
  if (!identifiers.test(key)) throw new SupportCaseError(400, 'invalid_idempotency_key');
  return `${suffix}:${key}`;
}

export function supportDecisionPayloadHash(value) {
  return crypto.createHash('sha256').update(canonicalPayload(value)).digest('hex');
}

export function normalizeSupportDecisionInput(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new SupportCaseError(400, 'support_decision_invalid');
  }
  const decisionCode = requiredText(raw.decisionCode, 120, 'support_decision_code_required').toLowerCase();
  if (!decisionCodes.test(decisionCode)) {
    throw new SupportCaseError(400, 'support_decision_code_invalid');
  }
  const measureType = requiredText(raw.measureType, 80, 'support_measure_type_required').toLowerCase();
  if (!measureTypes.has(measureType)) throw new SupportCaseError(400, 'support_measure_type_invalid');
  const hasMoney = raw.amountMinor !== undefined && raw.amountMinor !== null;
  const moneyMeasure = ['simulated_refund_review', 'simulated_payout_review'].includes(measureType);
  if (hasMoney !== moneyMeasure) throw new SupportCaseError(400, 'support_decision_amount_scope_invalid');
  const amountMinor = hasMoney ? integer(raw.amountMinor, 'support_decision_amount_invalid', { minimum: 0 }) : null;
  const currency = hasMoney
    ? requiredText(raw.currency, 3, 'support_decision_currency_required').toUpperCase()
    : null;
  if (currency && currency !== 'EUR') throw new SupportCaseError(400, 'support_decision_currency_invalid');
  if (raw.automationUsed !== undefined && raw.automationUsed !== false) {
    throw new SupportCaseError(400, 'support_decision_automation_forbidden');
  }
  const recommendationId = optionalText(raw.recommendationId, 160, 'support_recommendation_id_invalid');
  if (recommendationId && !identifiers.test(recommendationId)) {
    throw new SupportCaseError(400, 'support_recommendation_id_invalid');
  }
  const result = Object.freeze({
    decisionCode,
    decisionScope: requiredText(raw.decisionScope, 2000, 'support_decision_scope_required', 3),
    confirmedFactsConsidered: boundedTextArray(
      raw.confirmedFactsConsidered,
      'support_confirmed_facts_required',
      { minimum: 1 },
    ),
    materialUncertainties: boundedTextArray(
      raw.materialUncertainties ?? [],
      'support_material_uncertainties_invalid',
    ),
    policySnapshotId: requiredUuid(raw.policySnapshotId, 'support_policy_snapshot_required'),
    ruleReference: requiredText(raw.ruleReference, 500, 'support_rule_reference_required', 3),
    measureType,
    amountMinor,
    currency,
    duration: optionalText(raw.duration, 200, 'support_decision_duration_invalid'),
    affectedEntityIds: boundedIdentifiers(raw.affectedEntityIds, 'support_affected_entities_invalid'),
    unaffectedAreas: boundedTextArray(
      raw.unaffectedAreas ?? [],
      'support_unaffected_areas_invalid',
      { maximum: 50, itemMaximum: 1000 },
    ),
    implementationPlan: requiredText(raw.implementationPlan, 8000, 'support_implementation_plan_required', 3),
    automationUsed: false,
    recommendationId,
    userFacingDecision: requiredText(
      raw.userFacingDecision,
      4000,
      'support_user_decision_required',
      3,
    ),
    userFacingEffect: requiredText(
      raw.userFacingEffect,
      4000,
      'support_user_effect_required',
      3,
    ),
    userFacingReason: requiredText(raw.userFacingReason, 8000, 'support_user_reason_required', 3),
    userFacingImplementationResult: requiredText(
      raw.userFacingImplementationResult,
      4000,
      'support_user_implementation_result_required',
      3,
    ),
    internalReason: requiredText(raw.internalReason, 8000, 'support_internal_reason_required', 3),
    redressRoute: requiredText(raw.redressRoute, 2000, 'support_redress_route_required', 3),
  });
  return Object.freeze({ ...result, payloadSha256: supportDecisionPayloadHash(result) });
}

export function normalizeSupportDecisionReview(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new SupportCaseError(400, 'support_decision_review_invalid');
  }
  const outcome = requiredText(raw.outcome, 20, 'support_decision_review_outcome_required').toLowerCase();
  if (!['approved', 'rejected'].includes(outcome)) {
    throw new SupportCaseError(400, 'support_decision_review_outcome_invalid');
  }
  return Object.freeze({
    outcome,
    expectedVersion: integer(raw.expectedVersion, 'support_decision_version_invalid'),
    expectedPayloadSha256: exactHash(
      raw.expectedPayloadSha256,
      'support_decision_payload_hash_required',
    ),
    rejectionReason: outcome === 'rejected'
      ? requiredText(raw.rejectionReason, 2000, 'support_decision_rejection_reason_required', 3)
      : null,
  });
}

export function normalizeSupportDecisionImplementation(raw, currentStatus) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new SupportCaseError(400, 'support_decision_implementation_invalid');
  }
  const status = requiredText(raw.status, 30, 'support_implementation_status_required').toLowerCase();
  if (!implementationTransitions[currentStatus]?.has(status)) {
    throw new SupportCaseError(409, 'support_implementation_transition_invalid', {
      fromStatus: currentStatus,
      toStatus: status,
    });
  }
  return Object.freeze({
    status,
    expectedVersion: integer(raw.expectedVersion, 'support_decision_version_invalid'),
    expectedPayloadSha256: exactHash(
      raw.expectedPayloadSha256,
      'support_decision_payload_hash_required',
    ),
    implementationReference: ['succeeded', 'reversed'].includes(status)
      ? requiredText(raw.implementationReference, 2000, 'support_implementation_reference_required', 3)
      : null,
    implementationFailureReason: status === 'failed'
      ? requiredText(raw.failureReason, 2000, 'support_implementation_failure_reason_required', 3)
      : null,
  });
}

export function normalizeSupportDecisionCommunication(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new SupportCaseError(400, 'support_decision_communication_invalid');
  }
  return Object.freeze({
    expectedVersion: integer(raw.expectedVersion, 'support_decision_version_invalid'),
    expectedPayloadSha256: exactHash(
      raw.expectedPayloadSha256,
      'support_decision_payload_hash_required',
    ),
  });
}
