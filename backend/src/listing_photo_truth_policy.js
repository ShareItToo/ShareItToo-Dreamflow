export const listingPhotoTruthPolicyVersion = 'listing-photo-truth-v1';

export const listingPhotoTruthPolicyText =
  'Ich veröffentliche nur aktuelle echte Artikelbilder. Zuschneiden, Belichtung und das Schwärzen privater Details sind erlaubt, wenn Artikel, Zustand und Umfang wahr bleiben. KI-generierte oder materiell veränderte Bilder dürfen nicht veröffentlicht werden.';

export const listingPhotoTruthClassifications = Object.freeze([
  'unknown',
  'authentic',
  'truth_preserving_edit',
  'generated',
  'materially_altered',
]);

const forbiddenClassifications = new Set([
  'generated',
  'materially_altered',
]);

export class ListingPhotoTruthPolicyError extends Error {
  constructor(code, details = undefined) {
    super(code);
    this.code = code;
    this.details = details;
  }
}

function fail(code, details = undefined) {
  throw new ListingPhotoTruthPolicyError(code, details);
}

function normalizeClassification(value, index) {
  const classification = value == null || value === '' ? 'unknown' : value;
  if (typeof classification !== 'string'
      || !listingPhotoTruthClassifications.includes(classification)) {
    fail('listing_photo_truth_classification_invalid', { index });
  }
  if (forbiddenClassifications.has(classification)) {
    fail('listing_photo_truth_forbidden_image', { index, classification });
  }
  return classification;
}

export function assertListingPhotoTruthPolicy({
  policyVersion = null,
  policyText = null,
  classifications = null,
  expectedCount = null,
  requireAttestation = false,
} = {}) {
  const omitted = policyVersion == null && policyText == null;
  if (omitted && requireAttestation) {
    fail('listing_photo_truth_policy_required');
  }
  if (!omitted && (policyVersion !== listingPhotoTruthPolicyVersion
      || policyText !== listingPhotoTruthPolicyText)) {
    fail('listing_photo_truth_policy_required');
  }
  if (classifications != null && !Array.isArray(classifications)) {
    fail('listing_photo_truth_classifications_invalid');
  }
  if (expectedCount != null
      && classifications != null
      && classifications.length !== expectedCount) {
    fail('listing_photo_truth_classifications_mismatch');
  }
  const normalized = classifications == null
    ? (expectedCount == null ? [] : Array.from({ length: expectedCount }, () => 'unknown'))
    // Client declarations are never provenance. Safe declarations remain
    // publishable, but the server records them as unknown and keeps the
    // existing moderation/content-scan path authoritative.
    : classifications.map((value, index) => {
      normalizeClassification(value, index);
      return 'unknown';
    });
  return Object.freeze({
    policyVersion: omitted ? null : listingPhotoTruthPolicyVersion,
    policyText: omitted ? null : listingPhotoTruthPolicyText,
    classifications: Object.freeze(normalized),
  });
}

export function assertListingPhotoTruthClassification(value, details = {}) {
  const classification = normalizeClassification(value, details.index ?? 0);
  return Object.freeze({
    classification: 'unknown',
    declaredClassification: classification,
    policyVersion: listingPhotoTruthPolicyVersion,
  });
}
