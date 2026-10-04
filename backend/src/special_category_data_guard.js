// Technical-only guard for possible special-category/health data.
// This module deliberately makes no Article 9 legal determination.

export const specialCategoryDetectionVersion = 'sit_special_category_detection_v1';
export const specialCategoryHandlingVersion = 'sit_special_category_handling_v1';
// A client warning/checkbox is never Article 9 authorization.  This versioned
// shape is reserved for a future server-owned legal gate; no current route
// issues it and no legal basis is selected in the present staging mode.
export const article9ServerAuthorizationVersion = 'sit_article9_server_authorization_v1';

const specialCategoryPatterns = Object.freeze([
  /(?<!\p{L})(?:gesundheit\p{L}*|health\p{L}*)(?!\p{L})/iu,
  /(?<!\p{L})(?:medizin\p{L}*|medical\p{L}*|medication\p{L}*|medikament\p{L}*)(?!\p{L})/iu,
  /(?<!\p{L})(?:diagnos\p{L}*|symptom\p{L}*)(?!\p{L})/iu,
  /(?<!\p{L})(?:allerg\p{L}*)(?!\p{L})/iu,
  /(?<!\p{L})(?:schwanger\p{L}*|pregnan\p{L}*)(?!\p{L})/iu,
  /(?<!\p{L})(?:behinder\p{L}*|disabilit\p{L}*)(?!\p{L})/iu,
  /(?<!\p{L})(?:krankheit\p{L}*|disease\p{L}*|illness\p{L}*|erkrank\p{L}*)(?!\p{L})/iu,
  /(?<!\p{L})(?:therapie\p{L}*|behandlung\p{L}*|treatment\p{L}*|rezept\p{L}*)(?!\p{L})/iu,
  /(?<!\p{L})(?:arzt\p{L}*|ärzt\p{L}*|doctor\p{L}*|physician\p{L}*|hospital\p{L}*|krankenhaus\p{L}*)(?!\p{L})/iu,
  /(?<!\p{L})(?:blutgruppe\p{L}*|blood\s+type)(?!\p{L})/iu,
]);
const injuryPatterns = Object.freeze([
  /(?<!\p{L})injur\p{L}*(?!\p{L})/iu,
  /(?<!\p{L})(?:person|jemand|körperlich|koerperlich)\p{L}*[^.!?]{0,50}verletz\p{L}*/iu,
  /(?<!\p{L})verletz\p{L}*[^.!?]{0,50}(?:person|jemand|körperlich|koerperlich)\p{L}*(?!\p{L})/iu,
]);

const allowedOwnerRoles = new Set([
  'trust_safety_owner',
  'privacy_owner',
  'legal_authority_owner',
]);

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function detectPossibleSpecialCategoryText(value, { includeInjury = true } = {}) {
  const normalized = text(value);
  if (!normalized) return null;
  const specialIndex = specialCategoryPatterns.findIndex((pattern) => pattern.test(normalized));
  if (specialIndex >= 0) {
    return Object.freeze({
      classification: 'possible_special_category',
      detectionVersion: specialCategoryDetectionVersion,
      patternIndex: specialIndex,
    });
  }
  if (!includeInjury) return null;
  // Explicitly neutral accident reports such as "keine Verletzung" are not
  // health data.  Keep scanning the rest of the text for actual medical terms.
  const injuryText = normalized.replace(
    /\b(?:keine?|ohne|no|without)\s+(?:eine?\s+)?(?:person\s+)?(?:körperlich\s+|koerperlich\s+)?verletz\p{L}*/giu,
    ' ',
  );
  const injuryIndex = injuryPatterns.findIndex((pattern) => pattern.test(injuryText));
  if (injuryIndex < 0) return null;
  return Object.freeze({
    classification: 'possible_special_category',
    detectionVersion: specialCategoryDetectionVersion,
    patternIndex: specialCategoryPatterns.length + injuryIndex,
  });
}

export function detectPossibleSpecialCategoryFields(fields, { includeInjury = true } = {}) {
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) return null;
  const matches = Object.entries(fields)
    .map(([field, value]) => {
      if (field === 'productSafetyInjuryOccurred' && value === true) {
        return {
          field,
          classification: 'possible_special_category',
          detectionVersion: specialCategoryDetectionVersion,
          patternIndex: null,
        };
      }
      const detection = detectPossibleSpecialCategoryText(value, { includeInjury });
      return detection ? { field, ...detection } : null;
    })
    .filter(Boolean);
  return matches.length === 0
    ? null
    : Object.freeze({
      classification: 'possible_special_category',
      detectionVersion: specialCategoryDetectionVersion,
      fields: Object.freeze(matches.map(({ field }) => field)),
    });
}

export function normalizeSpecialCategoryHandling(raw, {
  detection = null,
  serverSideArticle9Authorization = null,
  errorFactory,
  requiredCode = 'special_category_handling_required',
  shapeCode = 'special_category_handling_invalid',
  notApplicableCode = 'special_category_handling_not_applicable',
} = {}) {
  const fail = (code, details) => {
    if (typeof errorFactory === 'function') throw errorFactory(code, details);
    throw new Error(code);
  };
  if (!detection) {
    if (raw !== undefined && raw !== null) fail(notApplicableCode);
    return null;
  }
  if (!isTrustedServerArticle9Authorization(serverSideArticle9Authorization)) {
    fail('article9_server_authorization_required', {
      detectionVersion: detection.detectionVersion,
      inputStored: false,
      externalDelivery: false,
    });
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    fail(requiredCode, { detectionVersion: detection.detectionVersion });
  }
  const allowedKeys = new Set([
    'version',
    'necessityAcknowledged',
    'warningShown',
    'ownerRole',
    'scope',
    'replicationPolicy',
  ]);
  if (Object.keys(raw).length !== allowedKeys.size
      || Object.keys(raw).some((key) => !allowedKeys.has(key))) {
    fail(shapeCode);
  }
  if (text(raw.version) !== specialCategoryHandlingVersion
      || raw.necessityAcknowledged !== true
      || raw.warningShown !== true
      || !allowedOwnerRoles.has(text(raw.ownerRole))
      || text(raw.scope) !== 'case_bound'
      || text(raw.replicationPolicy) !== 'no_unrestricted_replication') {
    fail(shapeCode);
  }
  return Object.freeze({
    version: specialCategoryHandlingVersion,
    classification: 'possible_special_category',
    necessityAcknowledged: true,
    warningShown: true,
    ownerRole: text(raw.ownerRole),
    scope: 'case_bound',
    replicationPolicy: 'no_unrestricted_replication',
    detectionVersion: detection.detectionVersion,
    detectedFields: Object.freeze([...detection.fields]),
    authorizationVersion: article9ServerAuthorizationVersion,
    authorizationReference: serverSideArticle9Authorization.approvalReference,
  });
}

export function isTrustedServerArticle9Authorization(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = new Set([
    'version', 'source', 'decision', 'approvalReference', 'caseBinding',
    'article9Basis', 'issuedAt',
  ]);
  if (Object.keys(value).some((key) => !keys.has(key))) return false;
  return text(value.version) === article9ServerAuthorizationVersion
    && value.source === 'server'
    && value.decision === 'approved'
    && /^[A-Za-z0-9_.:-]{8,160}$/u.test(text(value.approvalReference))
    && /^[A-Za-z0-9_.:-]{3,160}$/u.test(text(value.caseBinding))
    && /^[A-Za-z0-9_.:-]{3,160}$/u.test(text(value.article9Basis))
    && Number.isFinite(new Date(value.issuedAt).getTime());
}

export function assertNoPossibleSpecialCategoryText(value, {
  errorFactory,
  code = 'special_category_content_blocked',
  field = 'content',
} = {}) {
  const detection = detectPossibleSpecialCategoryText(value);
  if (!detection) return null;
  if (typeof errorFactory === 'function') {
    throw errorFactory(code, {
      classification: detection.classification,
      detectionVersion: detection.detectionVersion,
      field,
      inputStored: false,
      externalDelivery: false,
    });
  }
  throw new Error(code);
}
