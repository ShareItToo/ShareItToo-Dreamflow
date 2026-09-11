import crypto from 'node:crypto';

import {
  assessListingAiDraftReadiness,
  createListingAiDraftRevision,
  listingAiDraftFieldKeys,
  listingAiOwnerConfirmationIds,
} from './listing_ai_draft_domain.js';
import {
  createListingAiGateway,
  normalizeOnDeviceObservations,
} from './listing_ai_gateway.js';
import {
  listingAiImageDisclosureText,
  listingAiImageDisclosureVersion,
  listingAiOnDeviceDisclosureText,
  listingAiOnDeviceDisclosureVersion,
  runListingAiImagePrivacyPipeline,
} from './listing_ai_image_pipeline.js';
import {
  buildRegionalDurationPriceSchedule,
  previewRegionalPriceWithV52Fee,
  recommendRegionalPriceV2,
  selectOwnerRegionalDailyPrice,
} from './regional_price_engine_v2.js';
import {
  privatePilotAllowedCatalogKeys,
  privatePilotCatalogKey,
} from './private_pilot_domain.js';

export const blueOceanListingWorkflowVersion = 'N6-2026-08-24.1';
export const blueOceanListingDisclosureVersion = listingAiImageDisclosureVersion;
export const blueOceanListingDisclosureText = listingAiImageDisclosureText;
export const blueOceanOnDeviceDisclosureVersion = listingAiOnDeviceDisclosureVersion;
export const blueOceanOnDeviceDisclosureText = listingAiOnDeviceDisclosureText;

const sensitiveOnDeviceLabelRules = Object.freeze([
  Object.freeze({ type: 'face', pattern: /^(?:face|person|portrait|selfie|mensch|gesicht)$/iu }),
  Object.freeze({ type: 'document', pattern: /^(?:document|passport|identity document|id card|driver license|ausweis|reisepass|führerschein)$/iu }),
  Object.freeze({ type: 'financial_data', pattern: /^(?:credit card|payment card|bank card|kreditkarte|bankkarte)$/iu }),
]);

function onDeviceScreening(observation) {
  const visualSignals = [];
  for (const label of observation.labels) {
    const match = sensitiveOnDeviceLabelRules.find((entry) => entry.pattern.test(label.text));
    if (!match || label.confidence < 0.35) continue;
    visualSignals.push({
      type: match.type,
      confidence: label.confidence >= 0.75 ? 'HIGH' : 'MEDIUM',
    });
  }
  return Object.freeze({
    localOcrText: observation.ocrText,
    visualScanCompleted: true,
    visualSignals: Object.freeze(visualSignals.slice(0, 12)),
  });
}

function bindOnDeviceAnalysis(raw, images, configuration) {
  if (configuration.provider !== 'on_device') return Object.freeze([]);
  if (!Array.isArray(raw) || raw.length !== images.length) {
    throw new BlueOceanListingWorkflowError(
      400,
      'blue_ocean_on_device_analysis_invalid',
    );
  }
  const input = Object.freeze({
    imageReferences: Object.freeze(images.map((entry) => entry.imageReference)),
  });
  const bound = raw.map((entry, index) => ({
    ...(entry && typeof entry === 'object' && !Array.isArray(entry) ? entry : {}),
    imageReference: images[index].imageReference,
  }));
  try {
    return normalizeOnDeviceObservations(bound, input, {
      required: true,
      expectedModel: configuration.model,
    });
  } catch {
    throw new BlueOceanListingWorkflowError(
      400,
      'blue_ocean_on_device_analysis_invalid',
    );
  }
}

const confirmationForField = Object.freeze({
  title: 'item_identity',
  category: 'allowed_category',
  subcategory: 'allowed_category',
  brand: 'item_identity',
  model: 'item_identity',
  description: 'item_identity',
  condition: 'condition',
  accessories: 'accessories',
  projectTags: 'item_identity',
  useCases: 'item_identity',
  safetyNotes: 'item_identity',
  replacementValueMinor: 'item_identity',
  pickupRegion: 'pickup_region',
});

export const blueOceanRegionalPriceRuleByCatalogKey = Object.freeze({
  [privatePilotCatalogKey('cat5', 'Staubsauger')]: 'cleaning_machines',
  [privatePilotCatalogKey('cat7', 'Rasenmäher')]: 'garden_machines',
  [privatePilotCatalogKey('cat7', 'Heckenscheren')]: 'garden_machines',
  [privatePilotCatalogKey('cat7', 'Gartengeräte')]: 'garden_machines',
  [privatePilotCatalogKey('cat8', 'Handwerkzeuge')]: 'ladders_hand_tools',
  [privatePilotCatalogKey('cat8', 'Elektrowerkzeuge')]: 'power_tools',
  [privatePilotCatalogKey('cat8', 'Bohrmaschinen')]: 'power_tools',
  [privatePilotCatalogKey('cat8', 'Sägen')]: 'power_tools',
  [privatePilotCatalogKey('cat8', 'Schleifer')]: 'power_tools',
  [privatePilotCatalogKey('cat20', 'Zubehör')]: 'accessories',
  [privatePilotCatalogKey('cat22', 'Party-Deko')]: 'event_camping',
  [privatePilotCatalogKey('cat22', 'Eventtechnik')]: 'event_camping',
  [privatePilotCatalogKey('cat22', 'Tische & Stühle')]: 'event_camping',
  [privatePilotCatalogKey('cat22', 'Pavillons')]: 'event_camping',
  [privatePilotCatalogKey('cat22', 'Buffet & Catering')]: 'event_camping',
  [privatePilotCatalogKey('cat23', 'Zelte')]: 'event_camping',
  [privatePilotCatalogKey('cat23', 'Schlafsäcke')]: 'event_camping',
  [privatePilotCatalogKey('cat23', 'Campingküche')]: 'event_camping',
  [privatePilotCatalogKey('cat23', 'Outdoor-Zubehör')]: 'accessories',
});

export const blueOceanPriceReviewVersion = 'WP07-2026-09-05.1';
const blueOceanManualPriceNotice =
  'Für diese Artikelart gibt es noch keine belastbare SIT-Preisregel. '
  + 'Lege deinen Tagespreis selbst fest und bestätige ihn; SIT zeigt keine erfundene Empfehlung.';

const conditionByListingValue = Object.freeze({
  new: 'like_new',
  'like-new': 'like_new',
  like_new: 'like_new',
  good: 'good',
  acceptable: 'visibly_used_but_functional',
  worn: 'visibly_used_but_functional',
  visibly_used_but_functional: 'visibly_used_but_functional',
});

const replacementBands = new Set([
  'under_100',
  'eur_100_250',
  'eur_250_500',
  'eur_500_1000',
  'over_1000',
]);

export class BlueOceanListingWorkflowError extends Error {
  constructor(status, code, details = undefined) {
    super(code);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function fail(status, code, details) {
  throw new BlueOceanListingWorkflowError(status, code, details);
}

function object(value, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(400, code);
  return value;
}

function exactKeys(value, expected, code) {
  object(value, code);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length
      || actual.some((key, index) => key !== wanted[index])) {
    fail(400, code);
  }
}

function text(value, { minimum = 1, maximum = 4000, code }) {
  const candidate = typeof value === 'string' ? value.trim() : '';
  if (candidate.length < minimum || candidate.length > maximum) fail(400, code);
  return candidate;
}

function identifier(value, code, pattern = /^[A-Za-z0-9_.:-]{8,160}$/u) {
  const candidate = text(value, { maximum: 160, code });
  if (!pattern.test(candidate) || /[/\\]|https?:|file:|@/iu.test(candidate)) fail(400, code);
  return candidate;
}

function optionalOwnerDailyPriceMinor(value) {
  if (value == null) return null;
  if (!Number.isSafeInteger(value) || value < 1 || value > 100_000_000) {
    fail(400, 'blue_ocean_owner_daily_price_invalid');
  }
  return value;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}

function normalizedConfirmations(raw) {
  exactKeys(raw, listingAiOwnerConfirmationIds, 'blue_ocean_owner_confirmations_invalid');
  return Object.fromEntries(listingAiOwnerConfirmationIds.map((id) => {
    if (typeof raw[id] !== 'boolean') fail(400, 'blue_ocean_owner_confirmation_invalid');
    return [id, raw[id]];
  }));
}

function normalizeEditedFieldValue(key, raw) {
  if (key === 'replacementValueMinor') {
    if (raw == null || raw === '') return null;
    if (!Number.isSafeInteger(raw) || raw < 1 || raw > 100_000_000) {
      fail(400, 'blue_ocean_replacement_value_invalid');
    }
    return raw;
  }
  if (['accessories', 'projectTags', 'useCases'].includes(key)) {
    if (!Array.isArray(raw) || raw.length > 12) fail(400, 'blue_ocean_list_field_invalid');
    return raw.map((entry) => text(entry, {
      maximum: 120,
      code: 'blue_ocean_list_field_entry_invalid',
    }));
  }
  if (raw == null || raw === '') return null;
  return text(raw, { maximum: 4000, code: 'blue_ocean_field_value_invalid' });
}

function revisedFields(previous, editedFields, ownerConfirmations) {
  exactKeys(editedFields, listingAiDraftFieldKeys, 'blue_ocean_edited_fields_invalid');
  return Object.fromEntries(listingAiDraftFieldKeys.map((key) => {
    const value = normalizeEditedFieldValue(key, editedFields[key]);
    const prior = previous.fields?.[key];
    if (value == null) {
      const confirmationId = confirmationForField[key];
      return [key, {
        value: null,
        confidence: 'LOW',
        source: prior?.source ?? {
          type: 'owner_input',
          imageReference: null,
          detail: 'owner_left_blank',
        },
        confirmationRequired: true,
        reasonCode: prior?.reasonCode ?? 'owner_input_missing',
        ownerConfirmed: ownerConfirmations[confirmationId] === true,
      }];
    }
    const confirmationId = confirmationForField[key];
    const confirmationRequired = prior?.confirmationRequired === true
      || ['condition', 'accessories', 'replacementValueMinor'].includes(key);
    return [key, {
      value,
      confidence: 'HIGH',
      source: {
        type: 'owner_input',
        imageReference: null,
        detail: 'owner_reviewed_editable_draft',
      },
      confirmationRequired,
      reasonCode: 'owner_reviewed',
      ownerConfirmed: confirmationRequired && ownerConfirmations[confirmationId] === true,
    }];
  }));
}

function revisedQuestions(previous, answeredIds) {
  if (!Array.isArray(answeredIds) || answeredIds.length > 3) {
    fail(400, 'blue_ocean_clarification_answers_invalid');
  }
  const answered = new Set(answeredIds.map((entry) => identifier(
    entry,
    'blue_ocean_clarification_answer_invalid',
  )));
  const known = new Set((previous.clarificationQuestions ?? []).map((entry) => entry.id));
  if ([...answered].some((entry) => !known.has(entry))) {
    fail(400, 'blue_ocean_clarification_answer_unknown');
  }
  return (previous.clarificationQuestions ?? []).map((entry) => ({
    id: entry.id,
    field: entry.field,
    question: entry.question,
    answered: answered.has(entry.id),
  }));
}

function imageReviewMetadata(preflight) {
  const warnings = preflight.images.flatMap((image) => image.screening.reasonCodes.map((code) => ({
    imageReference: image.imageReference,
    code,
    action: image.screening.userAction,
  })));
  return deepFreeze({
    imageOrder: preflight.images.map((image) => image.imageReference),
    imageWarnings: warnings,
    missingPhotoSuggestions: preflight.images.length < 3
      ? ['Ergänze bei Bedarf eine Gesamtansicht und eine Detailansicht.']
      : [],
    originalMetadataRetained: false,
    temporaryDerivativeBytesPurged: true,
    realImageSafetyReviewCompleted: preflight.providerEligible === true,
  });
}

function manualFallback(reasonCode, preflight = null, generated = null, { paidProvider = false } = {}) {
  const providerCallCount = (preflight?.screeningProviderCallCount ?? 0)
    + (generated?.providerCallCount ?? 0);
  return deepFreeze({
    workflowVersion: blueOceanListingWorkflowVersion,
    status: 'manual_fallback',
    reasonCode,
    openManualEditor: true,
    photosPreserved: true,
    manualInputsPreserved: true,
    imageReview: preflight ? imageReviewMetadata(preflight) : null,
    autoPublishAllowed: false,
    providerCallCount,
    paidCallPerformed: paidProvider && providerCallCount > 0,
    estimatedCostCents: generated?.estimatedCostCents === null
      ? null
      : (preflight?.screeningEstimatedCostCents ?? 0)
        + (generated?.estimatedCostCents ?? 0),
    billedCostCents: paidProvider && providerCallCount > 0 ? null : 0,
  });
}

function normalizeScreening(raw) {
  exactKeys(raw, ['localOcrText', 'visualScanCompleted', 'visualSignals'], 'blue_ocean_screening_invalid');
  return raw;
}

export function createBlueOceanListingWorkflow({
  configuration,
  gateway = createListingAiGateway({ configuration }),
  screenImage = async () => ({
    localOcrText: '',
    visualScanCompleted: false,
    visualSignals: [],
  }),
  screenDerivative,
  audit = () => {},
} = {}) {
  if (!configuration) fail(500, 'blue_ocean_configuration_required');
  return Object.freeze({
    async analyze({
      draftId,
      ownerId,
      generationKey,
      images,
      consent,
      onDeviceAnalysis = null,
    }) {
      if (!Array.isArray(images) || images.length < 1 || images.length > 4) {
        fail(400, 'blue_ocean_image_count_invalid');
      }
      const boundOnDeviceAnalysis = bindOnDeviceAnalysis(
        onDeviceAnalysis,
        images,
        configuration,
      );
      const screenedImages = [];
      for (let index = 0; index < images.length; index += 1) {
        const image = images[index];
        const value = object(image, 'blue_ocean_image_invalid');
        const screening = configuration.provider === 'on_device'
          ? onDeviceScreening(boundOnDeviceAnalysis[index])
          : normalizeScreening(await screenImage({
            imageReference: value.imageReference,
            bytes: value.bytes,
            mimeType: value.mimeType,
          }));
        screenedImages.push({
          imageReference: identifier(value.imageReference, 'blue_ocean_image_reference_invalid'),
          originalFilename: null,
          bytes: value.bytes,
          localScreening: screening,
        });
      }
      let preflight;
      try {
        preflight = await runListingAiImagePrivacyPipeline({
          images: screenedImages,
          consent,
          auditSink: audit,
          screenDerivative,
          timeoutMs: configuration.timeoutMs,
          consumeDerivatives: async (derivatives) => gateway.generate({
            draftId,
            ownerId,
            generationKey,
            revision: 1,
            imageReferences: derivatives.map((entry) => entry.imageReference),
            untrustedOcr: configuration.provider === 'on_device'
              ? boundOnDeviceAnalysis.map((entry) => ({
                imageReference: entry.imageReference,
                text: entry.ocrText,
              }))
              : [],
            manualInputPresent: true,
            onDeviceObservations: configuration.provider === 'on_device'
              ? boundOnDeviceAnalysis
              : null,
            analysisImages: derivatives.map((entry) => ({
              imageReference: entry.imageReference,
              mimeType: entry.mimeType,
              bytes: entry.bytes,
              sha256: entry.sha256,
            })),
          }),
          disclosureVersion: configuration.provider === 'on_device'
            ? listingAiOnDeviceDisclosureVersion
            : listingAiImageDisclosureVersion,
          disclosureText: configuration.provider === 'on_device'
            ? listingAiOnDeviceDisclosureText
            : listingAiImageDisclosureText,
        });
      } catch (error) {
        if (!String(error?.code ?? '').startsWith('listing_ai_image_visual_screen_')) {
          throw error;
        }
        const providerCallCount = Number.isSafeInteger(error?.details?.providerCallCount)
          ? Math.max(0, Math.min(screenedImages.length, error.details.providerCallCount))
          : 1;
        return deepFreeze({
          ...manualFallback(
            error.code,
            null,
            null,
            { paidProvider: configuration.provider === 'openai' },
          ),
          providerCallCount,
          paidCallPerformed: configuration.provider === 'openai'
            && providerCallCount > 0,
          estimatedCostCents: configuration.provider === 'openai'
            && providerCallCount > 0 ? null : 0,
          billedCostCents: configuration.provider === 'openai'
            && providerCallCount > 0 ? null : 0,
        });
      }
      if (!preflight.providerEligible) {
        return manualFallback(
          preflight.status === 'blocked'
            ? 'blue_ocean_sensitive_image_blocked'
            : 'blue_ocean_image_review_required',
          preflight,
          null,
          { paidProvider: configuration.provider === 'openai' },
        );
      }
      const generated = preflight.consumerResult;
      if (generated?.status !== 'draft_ready') {
        return manualFallback(
          generated?.reasonCode ?? 'blue_ocean_generation_failed',
          preflight,
          generated,
          { paidProvider: configuration.provider === 'openai' },
        );
      }
      const providerCallCount = preflight.screeningProviderCallCount
        + generated.providerCallCount;
      return deepFreeze({
        workflowVersion: blueOceanListingWorkflowVersion,
        status: 'draft_ready',
        revision: generated.revision,
        imageReview: imageReviewMetadata(preflight),
        disclosureVersion: configuration.provider === 'on_device'
          ? blueOceanOnDeviceDisclosureVersion
          : blueOceanListingDisclosureVersion,
        disclosureAccepted: true,
        clarificationLimit: 3,
        ownerConfirmationIds: listingAiOwnerConfirmationIds,
        providerCallCount,
        paidCallPerformed: configuration.provider === 'openai' && providerCallCount > 0,
        estimatedCostCents: preflight.screeningEstimatedCostCents
          + generated.estimatedCostCents,
        billedCostCents: configuration.provider === 'openai' ? null : 0,
        autoPublishAllowed: false,
      });
    },
  });
}

export function reviewBlueOceanListingDraft({
  previousRevision,
  generationKey,
  editedFields,
  answeredClarificationIds,
  ownerConfirmations: rawConfirmations,
  pricing,
  previewDays = [1, 7],
  imagePreflightPassed,
  consentValid,
  generatedAt = new Date(),
}) {
  const previous = object(previousRevision, 'blue_ocean_previous_revision_invalid');
  const ownerConfirmations = normalizedConfirmations(rawConfirmations);
  identifier(generationKey, 'blue_ocean_generation_key_invalid', /^[a-f0-9]{64}$/u);
  const fields = revisedFields(previous, editedFields, ownerConfirmations);
  const revision = createListingAiDraftRevision({
    draftId: previous.draftId,
    ownerId: previous.ownerId,
    revision: previous.revision + 1,
    imageReferences: previous.imageReferences,
    fields,
    clarificationQuestions: revisedQuestions(previous, answeredClarificationIds),
    ownerConfirmations,
    generationMode: 'manual_foundation',
    generatedAt,
  });

  const priceInput = object(pricing, 'blue_ocean_pricing_invalid');
  exactKeys(priceInput, [
    'replacementValueBand',
    'ownerConfirmedReplacementValueBand',
    'ownerConfirmedReplacementValueMinor',
    'ownerDailyPriceMinor',
    'durationPricingEnabled',
  ], 'blue_ocean_pricing_invalid');
  if (!replacementBands.has(priceInput.replacementValueBand)) {
    fail(400, 'blue_ocean_replacement_value_band_invalid');
  }
  const condition = conditionByListingValue[fields.condition.value];
  if (!condition) fail(409, 'blue_ocean_condition_outside_stage_a_scope');
  if (!Array.isArray(previewDays)
      || previewDays.length < 1
      || previewDays.length > 3
      || previewDays.some((days) => !Number.isSafeInteger(days) || days < 1 || days > 30)) {
    fail(400, 'blue_ocean_preview_days_invalid');
  }
  const catalogKey = privatePilotCatalogKey(
    fields.category.value,
    fields.subcategory.value,
  );
  if (!privatePilotAllowedCatalogKeys.includes(catalogKey)) {
    fail(409, 'blue_ocean_catalog_pair_outside_private_pilot');
  }
  const categoryKey = blueOceanRegionalPriceRuleByCatalogKey[catalogKey] ?? null;
  const requestedDaily = optionalOwnerDailyPriceMinor(priceInput.ownerDailyPriceMinor);
  const priceMode = categoryKey == null
    ? 'owner_manual_no_recommendation'
    : 'regional_recommendation';
  const recommendation = categoryKey == null
    ? null
    : recommendRegionalPriceV2({
      categoryKey,
      subcategory: fields.subcategory.value,
      brandModelFamily: [fields.brand.value, fields.model.value].filter(Boolean).join(' ') || null,
      condition,
      replacementValueBand: priceInput.replacementValueBand,
      replacementValueBandConfidence: priceInput.ownerConfirmedReplacementValueBand ? 'HIGH' : 'LOW',
      ownerConfirmedReplacementValueBand: priceInput.ownerConfirmedReplacementValueBand,
      ownerConfirmedReplacementValueMinor: priceInput.ownerConfirmedReplacementValueMinor,
      observations: [],
    });
  const ownerDailyPriceMinor = categoryKey == null
    ? requestedDaily
    : (requestedDaily ?? recommendation.recommendedDailyMinor);
  const selection = categoryKey == null
    ? deepFreeze({
      recommendationAvailable: false,
      engineRecommendationMinor: null,
      ownerSelectedDailyMinor: ownerDailyPriceMinor,
      ownerOverrideApplied: false,
      ownerConfirmed: ownerConfirmations.owner_price === true
        && ownerDailyPriceMinor != null,
      publicationPriceReady: ownerConfirmations.owner_price === true
        && ownerDailyPriceMinor != null,
      automaticPublicationAllowed: false,
    })
    : selectOwnerRegionalDailyPrice({
      recommendation,
      ownerDailyPriceMinor,
      ownerConfirmed: ownerConfirmations.owner_price,
    });
  const durationSchedule = ownerDailyPriceMinor == null
    ? null
    : buildRegionalDurationPriceSchedule({
      ownerDailyPriceMinor,
      enabled: priceInput.durationPricingEnabled === true,
    });
  const quotePreviews = durationSchedule == null
    ? []
    : [...new Set(previewDays)].map((days) => ({
      days,
      ...previewRegionalPriceWithV52Fee({
        ownerDailyPriceMinor,
        days,
        durationPricingEnabled: durationSchedule.enabled,
      }),
    }));
  const domainReadiness = assessListingAiDraftReadiness(revision);
  const missingBeforeFinalPublication = domainReadiness.missingConfirmations.filter(
    (id) => id !== 'final_publication',
  );
  const previewReady = missingBeforeFinalPublication.length === 0
    && domainReadiness.fieldsNeedingReview.length === 0
    && domainReadiness.unansweredClarifications.length === 0
    && imagePreflightPassed === true
    && consentValid === true
    && selection.publicationPriceReady;
  const readyToPublish = previewReady
    && ownerConfirmations.final_publication === true
    && domainReadiness.readyToPublish;
  const readiness = deepFreeze({
    state: readyToPublish ? 'READY_TO_PUBLISH' : 'NEEDS_REVIEW',
    previewReady,
    readyToPublish,
    missingConfirmations: domainReadiness.missingConfirmations,
    fieldsNeedingReview: domainReadiness.fieldsNeedingReview,
    unansweredClarifications: domainReadiness.unansweredClarifications,
    imagePreflightPassed: imagePreflightPassed === true,
    consentValid: consentValid === true,
    functionalityConfirmed: domainReadiness.functionalityConfirmed,
    ownerPriceConfirmed: selection.publicationPriceReady,
    explicitPublicationActionRequired: true,
    autoPublishAllowed: false,
  });
  return deepFreeze({
    workflowVersion: blueOceanListingWorkflowVersion,
    priceReviewVersion: blueOceanPriceReviewVersion,
    priceMode,
    priceNotice: categoryKey == null ? blueOceanManualPriceNotice : null,
    status: 'review_ready',
    generationKey,
    revision,
    recommendation,
    selection,
    durationSchedule,
    quotePreviews,
    readiness,
    priceInputSha256: digest({
      priceReviewVersion: blueOceanPriceReviewVersion,
      priceMode,
      catalogKey,
      categoryKey,
      subcategory: fields.subcategory.value,
      condition,
      pricing: priceInput,
      observationCount: 0,
    }),
    publicationAction: 'explicit_owner_action_required',
    paidCallPerformed: false,
    autoPublishAllowed: false,
  });
}

export function assertBlueOceanExplicitPublication(review, { explicitOwnerAction }) {
  const value = object(review, 'blue_ocean_review_invalid');
  if (explicitOwnerAction !== true) fail(409, 'blue_ocean_explicit_publication_required');
  if (value.readiness?.readyToPublish !== true
      || value.readiness?.state !== 'READY_TO_PUBLISH') {
    fail(409, 'blue_ocean_draft_not_ready_to_publish', value.readiness);
  }
  return deepFreeze({
    authorized: true,
    draftId: value.revision.draftId,
    revision: value.revision.revision,
    payloadSha256: value.revision.payloadSha256,
    ownerDailyPriceMinor: value.selection.ownerSelectedDailyMinor,
    publicationAction: 'explicit_owner_action_verified',
    autoPublishAllowed: false,
  });
}
