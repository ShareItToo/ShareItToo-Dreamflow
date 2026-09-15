// Technical-only guard for possible special-category/health data.
// This module deliberately makes no Article 9 legal determination.

export const specialCategoryDetectionVersion = 'sit_special_category_detection_v1';
export const specialCategoryHandlingVersion = 'sit_special_category_handling_v1';

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
  const patterns = includeInjury
    ? [...specialCategoryPatterns, ...injuryPatterns]
    : specialCategoryPatterns;
  const patternIndex = patterns.findIndex((pattern) => pattern.test(normalized));
  if (patternIndex < 0) return null;
  return Object.freeze({
    classification: 'possible_special_category',
    detectionVersion: specialCategoryDetectionVersion,
    patternIndex,
  });
}

export function detectPossibleSpecialCategoryFields(fields) {
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
      const detection = detectPossibleSpecialCategoryText(value, {
        includeInjury: field !== 'summary',
      });
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
  });
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
