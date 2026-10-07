import crypto from 'node:crypto';

export const listingAiDraftDomainVersion = 'N2-2026-08-23.1';
export const listingAiDraftSchemaVersion = 'listing-ai-draft-v1';
export const listingAiPromptVersion = 'listing-ai-prompt-v1';
export const listingAiPriceEngineAuthority = 'SIT_REGIONAL_PRICE_ENGINE_V2';
export const listingAiConditionValues = Object.freeze([
  'new',
  'like-new',
  'good',
  'acceptable',
  'worn',
]);

export const listingAiDraftFieldKeys = Object.freeze([
  'title',
  'category',
  'subcategory',
  'brand',
  'model',
  'description',
  'condition',
  'accessories',
  'projectTags',
  'useCases',
  'safetyNotes',
  'replacementValueMinor',
  'pickupRegion',
]);

export const listingAiOwnerConfirmationIds = Object.freeze([
  'ownership',
  'item_identity',
  'allowed_category',
  'functionality',
  'condition',
  'accessories',
  'owner_price',
  'duration_discounts',
  'availability',
  'pickup_region',
  'final_publication',
]);

const confidenceValues = new Set(['HIGH', 'MEDIUM', 'LOW']);
const sourceTypes = new Set([
  'owner_input',
  'image_analysis',
  'account_default',
  'deterministic_engine',
  'mock_provider',
  'provider_output',
]);
const claimConfirmationFields = new Set([
  'condition',
  'accessories',
  'replacementValueMinor',
]);
const derivativeStates = Object.freeze({
  prepared: new Set(['analysis_ready', 'purged']),
  analysis_ready: new Set(['consumed', 'purged']),
  consumed: new Set(['purged']),
  purged: new Set(),
});

export class ListingAiDraftError extends Error {
  constructor(status, code, details = undefined) {
    super(code);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function fail(code, details) {
  throw new ListingAiDraftError(400, code, details);
}

function object(value, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code);
  return value;
}

function text(value, { minimum = 1, maximum = 200, code } = {}) {
  const candidate = typeof value === 'string' ? value.trim() : '';
  if (candidate.length < minimum || candidate.length > maximum) fail(code ?? 'invalid_text');
  return candidate;
}

function identifier(value, code) {
  const candidate = text(value, { maximum: 160, code });
  if (!/^[A-Za-z0-9_.:-]{8,160}$/u.test(candidate)) fail(code);
  return candidate;
}

function version(value, expected, code) {
  if (value !== expected) fail(code);
  return value;
}

function instant(value, code) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) fail(code);
  return date.toISOString();
}

function integer(value, { minimum = 0, maximum = Number.MAX_SAFE_INTEGER, code }) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) fail(code);
  return value;
}

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function opaqueImageReference(value) {
  const candidate = identifier(value, 'invalid_listing_ai_image_reference');
  if (/[/\\]|https?:|file:|@/iu.test(candidate)) fail('unsafe_listing_ai_image_reference');
  return candidate;
}

function normalizeImageReferences(values) {
  if (!Array.isArray(values) || values.length < 1 || values.length > 4) {
    fail('listing_ai_image_count_out_of_range');
  }
  const normalized = values.map(opaqueImageReference);
  if (new Set(normalized).size !== normalized.length) fail('duplicate_listing_ai_image_reference');
  return normalized;
}

function normalizeSource(raw, { imageReferences }) {
  const value = object(raw, 'invalid_listing_ai_field_source');
  if (!sourceTypes.has(value.type)) fail('invalid_listing_ai_field_source_type');
  const imageReference = value.imageReference == null
    ? null
    : opaqueImageReference(value.imageReference);
  if (value.type === 'image_analysis' && imageReference == null) {
    fail('listing_ai_image_source_reference_required');
  }
  if (imageReference != null && !imageReferences.includes(imageReference)) {
    fail('listing_ai_image_source_reference_unknown');
  }
  return {
    type: value.type,
    imageReference,
    detail: value.detail == null
      ? null
      : text(value.detail, { maximum: 240, code: 'invalid_listing_ai_source_detail' }),
  };
}

function normalizeFieldValue(value, key, confidence) {
  if (confidence === 'LOW') {
    if (value !== null && value !== undefined && value !== '') {
      fail('listing_ai_low_confidence_value_must_be_blank', { field: key });
    }
    return null;
  }
  if (key === 'replacementValueMinor') {
    return integer(value, {
      minimum: 1,
      maximum: 100_000_000,
      code: 'invalid_listing_ai_replacement_value_minor',
    });
  }
  if (key === 'condition') {
    if (!listingAiConditionValues.includes(value)) {
      fail('invalid_listing_ai_condition');
    }
    return value;
  }
  if (key === 'projectTags' || key === 'useCases' || key === 'accessories') {
    if (!Array.isArray(value) || value.length > 12) fail('invalid_listing_ai_list_field', { field: key });
    return value.map((entry) => text(entry, {
      maximum: 120,
      code: 'invalid_listing_ai_list_field_entry',
    }));
  }
  return text(value, { maximum: 4000, code: 'invalid_listing_ai_field_value' });
}

export function normalizeListingAiDraftField(key, raw, {
  imageReferences,
  promptVersion = listingAiPromptVersion,
  schemaVersion = listingAiDraftSchemaVersion,
} = {}) {
  if (!listingAiDraftFieldKeys.includes(key)) fail('unknown_listing_ai_field', { field: key });
  const value = object(raw, 'invalid_listing_ai_field');
  if (!confidenceValues.has(value.confidence)) fail('invalid_listing_ai_field_confidence');
  const normalizedSource = normalizeSource(value.source, { imageReferences });
  const confirmationRequired = value.confidence !== 'HIGH'
    || claimConfirmationFields.has(key)
    || value.confirmationRequired === true;
  const ownerConfirmed = value.ownerConfirmed === true;
  if (ownerConfirmed && !confirmationRequired) fail('unexpected_listing_ai_field_confirmation');
  return deepFreeze({
    value: normalizeFieldValue(value.value, key, value.confidence),
    confidence: value.confidence,
    source: normalizedSource,
    confirmationRequired,
    reasonCode: text(value.reasonCode, {
      maximum: 120,
      code: 'invalid_listing_ai_field_reason_code',
    }),
    promptVersion: version(promptVersion, listingAiPromptVersion, 'invalid_listing_ai_prompt_version'),
    schemaVersion: version(schemaVersion, listingAiDraftSchemaVersion, 'invalid_listing_ai_schema_version'),
    ownerConfirmed,
  });
}

function normalizeFields(raw, context) {
  const input = object(raw, 'invalid_listing_ai_fields');
  const extraKeys = Object.keys(input).filter((key) => !listingAiDraftFieldKeys.includes(key));
  if (extraKeys.length > 0) fail('unknown_listing_ai_fields', { fields: extraKeys });
  const fields = {};
  for (const key of listingAiDraftFieldKeys) {
    if (input[key] != null) fields[key] = normalizeListingAiDraftField(key, input[key], context);
  }
  return fields;
}

function normalizeClarificationQuestions(raw) {
  if (!Array.isArray(raw) || raw.length > 3) fail('listing_ai_clarification_limit_exceeded');
  const ids = new Set();
  return raw.map((entry) => {
    const value = object(entry, 'invalid_listing_ai_clarification');
    const id = identifier(value.id, 'invalid_listing_ai_clarification_id');
    if (ids.has(id)) fail('duplicate_listing_ai_clarification_id');
    ids.add(id);
    const field = text(value.field, { maximum: 80, code: 'invalid_listing_ai_clarification_field' });
    if (!listingAiDraftFieldKeys.includes(field)) fail('invalid_listing_ai_clarification_field');
    return {
      id,
      field,
      question: text(value.question, { maximum: 300, code: 'invalid_listing_ai_clarification_question' }),
      answered: value.answered === true,
    };
  });
}

function normalizeOwnerConfirmations(raw = {}) {
  const input = object(raw, 'invalid_listing_ai_owner_confirmations');
  const extraKeys = Object.keys(input).filter((key) => !listingAiOwnerConfirmationIds.includes(key));
  if (extraKeys.length > 0) fail('unknown_listing_ai_owner_confirmation');
  return Object.fromEntries(listingAiOwnerConfirmationIds.map((id) => {
    const value = input[id] ?? false;
    if (typeof value !== 'boolean') fail('invalid_listing_ai_owner_confirmation');
    return [id, value];
  }));
}

export function createListingAiDraftRevision({
  draftId,
  ownerId,
  revision = 1,
  imageReferences,
  fields = {},
  clarificationQuestions = [],
  ownerConfirmations = {},
  promptVersion = listingAiPromptVersion,
  schemaVersion = listingAiDraftSchemaVersion,
  generationMode = 'manual_foundation',
  generatedAt = new Date(),
}) {
  const normalizedImages = normalizeImageReferences(imageReferences);
  if (!['manual_foundation', 'mock', 'provider'].includes(generationMode)) {
    fail('invalid_listing_ai_generation_mode');
  }
  const normalizedFields = normalizeFields(fields, {
    imageReferences: normalizedImages,
    promptVersion,
    schemaVersion,
  });
  const normalizedQuestions = normalizeClarificationQuestions(clarificationQuestions);
  const normalizedConfirmations = normalizeOwnerConfirmations(ownerConfirmations);
  const normalized = {
    domainVersion: listingAiDraftDomainVersion,
    schemaVersion: version(schemaVersion, listingAiDraftSchemaVersion, 'invalid_listing_ai_schema_version'),
    promptVersion: version(promptVersion, listingAiPromptVersion, 'invalid_listing_ai_prompt_version'),
    draftId: identifier(draftId, 'invalid_listing_ai_draft_id'),
    ownerId: identifier(ownerId, 'invalid_listing_ai_owner_id'),
    revision: integer(revision, { minimum: 1, maximum: 1_000_000, code: 'invalid_listing_ai_revision' }),
    generationMode,
    imageReferences: normalizedImages,
    fields: normalizedFields,
    clarificationQuestions: normalizedQuestions,
    ownerConfirmations: normalizedConfirmations,
    generatedAt: instant(generatedAt, 'invalid_listing_ai_generated_at'),
    publicationAction: 'explicit_owner_action_required',
    autoPublishAllowed: false,
    historicalListingRewriteAllowed: false,
  };
  return deepFreeze({
    ...normalized,
    payloadSha256: digest(normalized),
  });
}

export function assessListingAiDraftReadiness(revision) {
  const value = object(revision, 'invalid_listing_ai_revision_payload');
  const missingConfirmations = listingAiOwnerConfirmationIds.filter(
    (id) => value.ownerConfirmations?.[id] !== true,
  );
  const fieldsNeedingReview = Object.entries(value.fields ?? {})
    .filter(([, field]) => field.confirmationRequired === true && field.ownerConfirmed !== true)
    .map(([key]) => key);
  const unansweredClarifications = (value.clarificationQuestions ?? [])
    .filter((question) => question.answered !== true)
    .map((question) => question.id);
  return deepFreeze({
    readyToPublish: missingConfirmations.length === 0
      && fieldsNeedingReview.length === 0
      && unansweredClarifications.length === 0,
    missingConfirmations,
    fieldsNeedingReview,
    unansweredClarifications,
    functionalityConfirmed: value.ownerConfirmations?.functionality === true,
    publicationAction: 'explicit_owner_action_required',
    autoPublishAllowed: false,
  });
}

export function transitionListingAiDerivative(raw, nextState, { now = new Date() } = {}) {
  const value = object(raw, 'invalid_listing_ai_derivative');
  const currentState = text(value.state, { maximum: 32, code: 'invalid_listing_ai_derivative_state' });
  if (!(currentState in derivativeStates) || !(nextState in derivativeStates)) {
    fail('invalid_listing_ai_derivative_state');
  }
  if (!derivativeStates[currentState].has(nextState)) {
    fail('invalid_listing_ai_derivative_transition', { currentState, nextState });
  }
  return deepFreeze({
    ...value,
    state: nextState,
    updatedAt: instant(now, 'invalid_listing_ai_derivative_transition_time'),
    purgedAt: nextState === 'purged'
      ? instant(now, 'invalid_listing_ai_derivative_purge_time')
      : null,
  });
}

export function normalizeRegionalMarketObservation(raw) {
  const value = object(raw, 'invalid_regional_market_observation');
  const coarseRegionKey = text(value.coarseRegionKey, {
    maximum: 80,
    code: 'invalid_regional_market_region',
  });
  if (!/^[a-z0-9][a-z0-9_-]{2,79}$/u.test(coarseRegionKey)
      || /street|strasse|straße|@|\d{4,}/iu.test(coarseRegionKey)) {
    fail('regional_market_observation_must_be_coarse');
  }
  if (!['owner_observation', 'pilot_aggregate', 'public_aggregate', 'synthetic_test'].includes(value.sourceType)) {
    fail('invalid_regional_market_observation_source');
  }
  return deepFreeze({
    observationId: identifier(value.observationId, 'invalid_regional_market_observation_id'),
    draftId: identifier(value.draftId, 'invalid_listing_ai_draft_id'),
    coarseRegionKey,
    categoryId: text(value.categoryId, { maximum: 80, code: 'invalid_regional_market_category' }),
    subcategory: text(value.subcategory, { maximum: 120, code: 'invalid_regional_market_subcategory' }),
    dailyPriceMinor: integer(value.dailyPriceMinor, {
      minimum: 1,
      maximum: 100_000_000,
      code: 'invalid_regional_market_price_minor',
    }),
    currency: value.currency === 'EUR' ? 'EUR' : fail('invalid_regional_market_currency'),
    sourceType: value.sourceType,
    observedAt: instant(value.observedAt, 'invalid_regional_market_observed_at'),
    exactAddressStored: false,
  });
}

export function normalizeRegionalPriceEngineSnapshot(raw) {
  const value = object(raw, 'invalid_regional_price_snapshot');
  if (value.engineAuthority !== listingAiPriceEngineAuthority) {
    fail('invalid_regional_price_engine_authority');
  }
  const low = integer(value.rangeLowMinor, {
    minimum: 1,
    maximum: 100_000_000,
    code: 'invalid_regional_price_range',
  });
  const recommended = integer(value.recommendedDailyMinor, {
    minimum: low,
    maximum: 100_000_000,
    code: 'invalid_regional_price_recommendation',
  });
  const high = integer(value.rangeHighMinor, {
    minimum: recommended,
    maximum: 100_000_000,
    code: 'invalid_regional_price_range',
  });
  return deepFreeze({
    snapshotId: identifier(value.snapshotId, 'invalid_regional_price_snapshot_id'),
    draftId: identifier(value.draftId, 'invalid_listing_ai_draft_id'),
    draftVersionId: identifier(value.draftVersionId, 'invalid_listing_ai_draft_version_id'),
    engineAuthority: listingAiPriceEngineAuthority,
    engineVersion: text(value.engineVersion, { maximum: 80, code: 'invalid_regional_price_engine_version' }),
    currency: value.currency === 'EUR' ? 'EUR' : fail('invalid_regional_price_currency'),
    rangeLowMinor: low,
    recommendedDailyMinor: recommended,
    rangeHighMinor: high,
    explanation: text(value.explanation, { maximum: 1000, code: 'invalid_regional_price_explanation' }),
    inputSha256: /^[a-f0-9]{64}$/u.test(value.inputSha256 ?? '')
      ? value.inputSha256
      : fail('invalid_regional_price_input_hash'),
    createdAt: instant(value.createdAt, 'invalid_regional_price_created_at'),
    authoritativeProviderPriceUsed: false,
  });
}

export function normalizeListingAiBudgetAggregate(raw) {
  const value = object(raw, 'invalid_listing_ai_budget_aggregate');
  const budget = integer(value.budgetCents, {
    minimum: 0,
    maximum: 10_000_000,
    code: 'invalid_listing_ai_budget_cents',
  });
  const spent = integer(value.spentCents, {
    minimum: 0,
    maximum: budget,
    code: 'invalid_listing_ai_spent_cents',
  });
  const reserved = integer(value.reservedCents, {
    minimum: 0,
    maximum: budget - spent,
    code: 'invalid_listing_ai_reserved_cents',
  });
  return deepFreeze({
    periodKey: text(value.periodKey, { maximum: 32, code: 'invalid_listing_ai_budget_period' }),
    budgetCents: budget,
    spentCents: spent,
    reservedCents: reserved,
    remainingCents: budget - spent - reserved,
    providerCallAllowed: value.providerCallAllowed === true && budget - spent - reserved > 0,
    paidCallPerformed: false,
  });
}
