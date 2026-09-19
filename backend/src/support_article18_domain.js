import { SupportCaseError, supportCaseIdempotencyKey } from './support_case_domain.js';

export const supportArticle18Determinations = Object.freeze([
  'information_required',
  'not_established',
  'reporting_path_required',
]);

export const supportArticle18RoutingBases = Object.freeze([
  'not_applicable',
  'concerned_member_state_identified',
  'state_not_identified_fallback_required',
]);

export const supportArticle18InformationScope = Object.freeze([
  'case_reference',
  'account_identifier',
  'content_reference',
  'evidence_digest',
  'affected_location',
  'contact_reference',
]);

const determinationValues = new Set(supportArticle18Determinations);
const routingBasisValues = new Set(supportArticle18RoutingBases);
const informationScopeValues = new Set(supportArticle18InformationScope);
const secretAssignment = /(?:api[_ -]?key|client[_ -]?secret|password|passwort|pin|token)\s*[:=]\s*\S+/iu;

function requiredText(value, { minimum, maximum, code }) {
  if (typeof value !== 'string') throw new SupportCaseError(400, code);
  const result = value.trim();
  if (result.length < minimum || result.length > maximum
      || /[\u0000-\u001f\u007f]/u.test(result)
      || /[<>]/u.test(result)
      || secretAssignment.test(result)) {
    throw new SupportCaseError(400, code);
  }
  return result;
}

function optionalUuid(value, code) {
  if (value === undefined || value === null || value === '') return null;
  const result = requiredText(value, { minimum: 36, maximum: 36, code }).toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(result)) {
    throw new SupportCaseError(400, code);
  }
  return result;
}

function requiredReference(value, code) {
  const result = requiredText(value, { minimum: 12, maximum: 300, code });
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{11,299}$/u.test(result)) {
    throw new SupportCaseError(400, code);
  }
  return result;
}

function exactStringArray(value, {
  code,
  minimum = 0,
  maximum,
  normalize = (entry) => entry,
  accepts,
}) {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
    throw new SupportCaseError(400, code);
  }
  const result = value.map((entry) => normalize(requiredText(entry, {
    minimum: 2,
    maximum: 200,
    code,
  })));
  if (new Set(result).size !== result.length || result.some((entry) => !accepts(entry))) {
    throw new SupportCaseError(400, code);
  }
  return Object.freeze(result);
}

export function normalizeSupportArticle18Assessment(raw, idempotencyKey) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new SupportCaseError(400, 'support_article18_assessment_required');
  }
  const allowedKeys = new Set([
    'determination',
    'routingBasis',
    'factualBasis',
    'evidenceReferences',
    'concernedMemberStates',
    'informationScope',
    'reviewerAuthorizationEvidenceRef',
    'humanReviewed',
    'automationRole',
    'noAutomatedDispatchConfirmed',
    'supersedesAssessmentId',
  ]);
  if (Object.keys(raw).some((key) => !allowedKeys.has(key))) {
    throw new SupportCaseError(400, 'support_article18_assessment_shape_invalid');
  }

  const determination = requiredText(raw.determination, {
    minimum: 3,
    maximum: 40,
    code: 'support_article18_determination_invalid',
  });
  if (!determinationValues.has(determination)) {
    throw new SupportCaseError(400, 'support_article18_determination_invalid');
  }
  const routingBasis = requiredText(raw.routingBasis, {
    minimum: 3,
    maximum: 60,
    code: 'support_article18_routing_basis_invalid',
  });
  if (!routingBasisValues.has(routingBasis)) {
    throw new SupportCaseError(400, 'support_article18_routing_basis_invalid');
  }
  const evidenceReferences = exactStringArray(raw.evidenceReferences, {
    code: 'support_article18_evidence_references_invalid',
    minimum: 1,
    maximum: 50,
    accepts: (entry) => /^[A-Za-z0-9][A-Za-z0-9_.:-]{2,199}$/u.test(entry),
  });
  const concernedMemberStates = exactStringArray(raw.concernedMemberStates ?? [], {
    code: 'support_article18_member_states_invalid',
    maximum: 27,
    normalize: (entry) => entry.toUpperCase(),
    accepts: (entry) => /^[A-Z]{2}$/u.test(entry),
  });
  const informationScope = exactStringArray(raw.informationScope ?? [], {
    code: 'support_article18_information_scope_invalid',
    maximum: supportArticle18InformationScope.length,
    accepts: (entry) => informationScopeValues.has(entry),
  });

  if (raw.humanReviewed !== true || raw.automationRole !== 'none') {
    throw new SupportCaseError(400, 'support_article18_human_review_required');
  }
  if (raw.noAutomatedDispatchConfirmed !== true) {
    throw new SupportCaseError(400, 'support_article18_no_auto_dispatch_confirmation_required');
  }
  if (determination === 'reporting_path_required') {
    if (routingBasis === 'not_applicable' || informationScope.length === 0) {
      throw new SupportCaseError(400, 'support_article18_reporting_path_incomplete');
    }
    if (routingBasis === 'concerned_member_state_identified'
        && concernedMemberStates.length === 0) {
      throw new SupportCaseError(400, 'support_article18_member_states_required');
    }
    if (routingBasis === 'state_not_identified_fallback_required'
        && concernedMemberStates.length !== 0) {
      throw new SupportCaseError(400, 'support_article18_fallback_state_conflict');
    }
  } else if (routingBasis !== 'not_applicable'
      || concernedMemberStates.length !== 0
      || informationScope.length !== 0) {
    throw new SupportCaseError(400, 'support_article18_non_reporting_scope_forbidden');
  }

  return Object.freeze({
    determination,
    routingBasis,
    factualBasis: requiredText(raw.factualBasis, {
      minimum: 20,
      maximum: 8000,
      code: 'support_article18_factual_basis_invalid',
    }),
    evidenceReferences,
    concernedMemberStates,
    informationScope,
    reviewerAuthorizationEvidenceRef: requiredReference(
      raw.reviewerAuthorizationEvidenceRef,
      'support_article18_reviewer_authorization_required',
    ),
    humanReviewed: true,
    automationRole: 'none',
    externalDeliveryAllowed: false,
    externalDeliveryStatus: 'disabled_not_configured',
    supersedesAssessmentId: optionalUuid(
      raw.supersedesAssessmentId,
      'support_article18_supersession_invalid',
    ),
    idempotencyKey: supportCaseIdempotencyKey(
      idempotencyKey,
      'support.article18.assessment',
    ),
  });
}
