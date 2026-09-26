import {
  ModerationDomainError,
  normalizeModerationDecisionInput,
} from './moderation_domain.js';

export const provisionalAccountMeasureNotice =
  'Diese Kontoeinschränkung ist vorläufig. Sie ist keine Feststellung von Schuld oder eines Verstoßes. Die Prüfung ist noch nicht abgeschlossen.';

export const approvedAccountMeasureNotice =
  'Diese Kontoeinschränkung wurde nach unabhängiger Prüfung freigegeben. Sie ist keine Feststellung strafrechtlicher oder zivilrechtlicher Schuld.';

export const accountSuspensionProposalVersion = 'sit_account_suspension_proposal_v1';

function requiredText(value, maximum, code, minimum = 1) {
  if (typeof value !== 'string') throw new ModerationDomainError(400, code);
  const result = value.trim();
  if (result.length < minimum || result.length > maximum) {
    throw new ModerationDomainError(400, code);
  }
  return result;
}

function optionalText(value, maximum, code) {
  if (value === undefined || value === null || value === '') return null;
  return requiredText(value, maximum, code);
}

function exactUuid(value, code) {
  const result = optionalText(value, 80, code);
  if (result && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(result)) {
    throw new ModerationDomainError(400, code);
  }
  return result;
}

function positiveInteger(value, code) {
  if (!Number.isInteger(value) || value < 1) throw new ModerationDomainError(400, code);
  return value;
}

function exactHash(value, code) {
  const result = requiredText(value, 64, code);
  if (!/^[0-9a-f]{64}$/u.test(result)) throw new ModerationDomainError(400, code);
  return result;
}

function serializeDecision(decision) {
  return Object.freeze({
    facts: decision.facts,
    basis: decision.basis,
    reasoning: decision.reasoning,
    detectionMethod: decision.detectionMethod,
    automatedMeans: decision.automatedMeans,
    statementOfReasons: Object.freeze({
      version: decision.statementOfReasons.version,
      decisionGround: decision.statementOfReasons.decisionGround,
      decisionOrigin: decision.statementOfReasons.decisionOrigin,
      territorialScope: decision.statementOfReasons.territorialScope,
      durationType: decision.statementOfReasons.durationType,
      endsAt: null,
      automationRole: decision.statementOfReasons.automationRole,
    }),
  });
}

export function normalizePermanentAccountSuspensionProposal(raw, userId) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ModerationDomainError(400, 'account_suspension_proposal_invalid');
  }
  if (raw.endsAt !== undefined && raw.endsAt !== null && raw.endsAt !== '') {
    throw new ModerationDomainError(400, 'permanent_account_suspension_end_not_applicable');
  }
  const reasonCode = requiredText(
    raw.reasonCode,
    120,
    'suspension_reason_required',
  ).toLowerCase();
  if (!/^[a-z0-9_.:-]{3,120}$/u.test(reasonCode)) {
    throw new ModerationDomainError(400, 'invalid_suspension_reason');
  }
  const decision = normalizeModerationDecisionInput(raw.decision, { statementRequired: true });
  if (decision.statementOfReasons.durationType !== 'until_reversed'
      || decision.statementOfReasons.endsAt) {
    throw new ModerationDomainError(400, 'permanent_account_suspension_duration_required');
  }
  return Object.freeze({
    reportId: exactUuid(raw.reportId, 'invalid_report_id'),
    reasonCode,
    note: optionalText(raw.note, 8000, 'invalid_suspension_note'),
    payload: Object.freeze({
      version: accountSuspensionProposalVersion,
      userId,
      scope: 'account',
      durationType: 'until_reversed',
      reasonCode,
      note: optionalText(raw.note, 8000, 'invalid_suspension_note'),
      reportId: exactUuid(raw.reportId, 'invalid_report_id'),
      noGuiltDetermination: true,
      userFacingMeasureNotice: approvedAccountMeasureNotice,
      decision: serializeDecision(decision),
    }),
  });
}

export function normalizeAccountSuspensionProposalReview(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ModerationDomainError(400, 'account_suspension_proposal_review_invalid');
  }
  const outcome = requiredText(
    raw.outcome,
    20,
    'account_suspension_proposal_review_outcome_required',
  ).toLowerCase();
  if (!['approved', 'rejected'].includes(outcome)) {
    throw new ModerationDomainError(400, 'account_suspension_proposal_review_outcome_invalid');
  }
  return Object.freeze({
    outcome,
    expectedVersion: positiveInteger(
      raw.expectedVersion,
      'account_suspension_proposal_version_invalid',
    ),
    expectedPayloadSha256: exactHash(
      raw.expectedPayloadSha256,
      'account_suspension_proposal_payload_hash_required',
    ),
    rejectionReason: outcome === 'rejected'
      ? requiredText(
          raw.rejectionReason,
          2000,
          'account_suspension_proposal_rejection_reason_required',
          3,
        )
      : null,
  });
}

export function shapeAccountSuspensionProposal(row) {
  return Object.freeze({
    id: row.id,
    userId: row.user_id,
    reportId: row.report_id ?? null,
    payload: row.payload,
    payloadSha256: row.payload_sha256,
    status: row.status,
    proposedBy: row.proposed_by,
    approvedBy: row.approved_by ?? null,
    approvedAt: row.approved_at ? new Date(row.approved_at).toISOString() : null,
    rejectedBy: row.rejected_by ?? null,
    rejectedAt: row.rejected_at ? new Date(row.rejected_at).toISOString() : null,
    rejectionReason: row.rejection_reason ?? null,
    appliedSuspensionId: row.applied_suspension_id ?? null,
    lockVersion: Number(row.lock_version),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  });
}
