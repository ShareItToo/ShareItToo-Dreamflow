import crypto from 'node:crypto';

import { platformFeeMinor, quoteRental } from './booking_domain.js';
import { createListingAiGateway } from './listing_ai_gateway.js';
import {
  listingAiMockModel,
  listingAiOpenAiModel,
  readListingAiGatewayConfiguration,
} from './listing_ai_gateway_config.js';
import { recommendRegionalPriceV2 } from './regional_price_engine_v2.js';

export const blueOceanSyntheticPilotHarnessVersion = 'N8-2026-08-24.1';
export const blueOceanSyntheticPilotResultClassification =
  'SYNTHETIC_PLANNING_OUTPUT_NOT_HUMAN_EVIDENCE';

const fieldCount = 13;
const participantCount = 30;
const cohortPlan = Object.freeze([
  Object.freeze({
    id: 'CORE',
    attempts: 13,
    participantOffset: 0,
    features: Object.freeze({
      v52: true,
      g2: true,
      g3: false,
      g4: false,
      g5: false,
      aiAssistedListing: false,
      regionalPriceRecommendation: false,
    }),
  }),
  Object.freeze({
    id: 'GROWTH',
    attempts: 13,
    participantOffset: 10,
    features: Object.freeze({
      v52: true,
      g2: true,
      g3: true,
      g4: true,
      g5: true,
      aiAssistedListing: false,
      regionalPriceRecommendation: false,
    }),
  }),
  Object.freeze({
    id: 'BLUE_OCEAN',
    attempts: 14,
    participantOffset: 20,
    features: Object.freeze({
      v52: true,
      g2: true,
      g3: true,
      g4: true,
      g5: true,
      aiAssistedListing: true,
      regionalPriceRecommendation: true,
    }),
  }),
]);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}

function basisPoints(numerator, denominator) {
  if (denominator === 0) return null;
  return Math.floor(((numerator * 10_000) + Math.floor(denominator / 2)) / denominator);
}

function roundedMean(values) {
  if (values.length === 0) return null;
  return Math.floor((values.reduce((sum, value) => sum + value, 0) + Math.floor(values.length / 2))
    / values.length);
}

function syntheticParticipantId(index) {
  return `synthetic_participant_${String(index).padStart(3, '0')}`;
}

function draftId(index) {
  return `listing_ai_draft_00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

function mockConfiguration() {
  return readListingAiGatewayConfiguration({
    SIT_LISTING_AI_PROVIDER: 'mock',
    SIT_LISTING_AI_MODEL: listingAiMockModel,
    SIT_LISTING_AI_BUDGET_CENTS: '0',
  });
}

function budgetExhaustedConfiguration() {
  return readListingAiGatewayConfiguration({
    SIT_LISTING_AI_PROVIDER: 'openai',
    SIT_LISTING_AI_MODEL: listingAiOpenAiModel,
    SIT_LISTING_AI_BUDGET_CENTS: '0',
  });
}

async function blueOceanDraftOutcome(attemptIndex, absoluteIndex) {
  const configuration = attemptIndex === 3
    ? readListingAiGatewayConfiguration()
    : (attemptIndex === 10 ? budgetExhaustedConfiguration() : mockConfiguration());
  const result = await createListingAiGateway({ configuration }).generate({
    draftId: draftId(absoluteIndex),
    ownerId: syntheticParticipantId(21 + (attemptIndex % 10)),
    generationKey: digest(`n8-generation-${absoluteIndex}`),
    revision: 1,
    imageReferences: [`analysis_image_${String(absoluteIndex).padStart(8, '0')}`],
    untrustedOcr: [],
    manualInputPresent: true,
  });
  if (result.status !== 'draft_ready') {
    return {
      aiDraftReady: false,
      manualFallback: true,
      categoryCorrect: null,
      brandModelPrecisionBasisPoints: null,
      unsupportedClaimCount: 0,
      clarificationCount: 0,
      editedFieldCount: fieldCount,
      recommendation: null,
    };
  }
  const revision = result.revision;
  const recommendation = recommendRegionalPriceV2({
    categoryKey: 'power_tools',
    subcategory: 'Bohrmaschinen',
    brandModelFamily: 'Mock-Marke Fixture-M18',
    condition: 'good',
    replacementValueBand: 'eur_100_250',
    replacementValueBandConfidence: 'HIGH',
    ownerConfirmedReplacementValueBand: true,
    observations: [],
    asOf: new Date('2026-08-24T00:00:00.000Z'),
  });
  return {
    aiDraftReady: true,
    manualFallback: false,
    categoryCorrect: revision.fields.category.value === 'cat8'
      && revision.fields.subcategory.value === 'Bohrmaschinen',
    brandModelPrecisionBasisPoints:
      (revision.fields.brand.value === 'Mock-Marke' ? 5_000 : 0)
      + (revision.fields.model.value === 'Fixture-M18' ? 5_000 : 0),
    unsupportedClaimCount: 0,
    clarificationCount: revision.clarificationQuestions.length,
    editedFieldCount: Object.values(revision.fields).filter(
      (field) => field.confidence !== 'HIGH' || field.confirmationRequired === true,
    ).length,
    recommendation,
  };
}

function manualDraftOutcome() {
  return {
    aiDraftReady: false,
    manualFallback: false,
    categoryCorrect: true,
    brandModelPrecisionBasisPoints: 10_000,
    unsupportedClaimCount: 0,
    clarificationCount: 0,
    editedFieldCount: fieldCount,
    recommendation: null,
  };
}

function timing(cohortId, attemptIndex, manualFallback) {
  if (cohortId === 'CORE') {
    const draftTimeSeconds = 470 + ((attemptIndex * 17) % 70);
    return { draftTimeSeconds, publishReadyTimeSeconds: draftTimeSeconds + 155 };
  }
  if (cohortId === 'GROWTH') {
    const draftTimeSeconds = 440 + ((attemptIndex * 19) % 65);
    return { draftTimeSeconds, publishReadyTimeSeconds: draftTimeSeconds + 135 };
  }
  const draftTimeSeconds = manualFallback
    ? 475 + ((attemptIndex * 13) % 50)
    : 165 + ((attemptIndex * 11) % 55);
  return { draftTimeSeconds, publishReadyTimeSeconds: draftTimeSeconds + 105 };
}

async function executeAttempt({ cohort, attemptIndex, absoluteIndex }) {
  const participantId = syntheticParticipantId(
    cohort.participantOffset + (attemptIndex % 10) + 1,
  );
  const abandoned = attemptIndex === cohort.attempts - 1;
  const draft = cohort.id === 'BLUE_OCEAN'
    ? await blueOceanDraftOutcome(attemptIndex, absoluteIndex)
    : manualDraftOutcome();
  const completeFlow = !abandoned;
  const requestSubmitted = completeFlow;
  const requestAccepted = requestSubmitted && attemptIndex % 4 !== 0;
  const requestRejected = requestSubmitted && !requestAccepted;
  const simulatedRentalCompleted = requestAccepted && attemptIndex % 6 !== 5;
  const priceRecommendationShown = draft.recommendation != null;
  const recommendationAccepted = priceRecommendationShown && attemptIndex % 3 !== 0;
  const priceEditDeltaMinor = priceRecommendationShown && !recommendationAccepted
    ? (attemptIndex % 2 === 0 ? 100 : -100)
    : 0;
  const ownerDailyPriceMinor = draft.recommendation == null
    ? 1_600
    : draft.recommendation.recommendedDailyMinor + priceEditDeltaMinor;
  const quote = completeFlow ? quoteRental({
    days: 2,
    pricePerDayMinor: ownerDailyPriceMinor,
    autoApplyDiscounts: true,
    discountTiers: [{ days: 2, discountPercent: 10 }],
  }) : null;
  if (completeFlow && (quote == null
      || quote.platformFeeMinor !== platformFeeMinor(quote.rentalSubtotalMinor))) {
    throw new Error('n8_v52_quote_invariant_failed');
  }
  const { draftTimeSeconds, publishReadyTimeSeconds } = timing(
    cohort.id,
    attemptIndex,
    draft.manualFallback,
  );
  const g5ContinuationFailed = cohort.id === 'BLUE_OCEAN' && attemptIndex === 8;
  return {
    participantId,
    completeFlow,
    abandoned,
    draftTimeSeconds,
    publishReadyTimeSeconds,
    editedFieldCount: draft.editedFieldCount,
    categoryCorrect: draft.categoryCorrect,
    brandModelPrecisionBasisPoints: draft.brandModelPrecisionBasisPoints,
    unsupportedClaimCount: draft.unsupportedClaimCount,
    priceRecommendationShown,
    recommendationAccepted,
    priceEditDeltaMinor,
    clarificationCount: draft.clarificationCount,
    manualFallback: draft.manualFallback,
    projectPlanUsed: cohort.features.g4 && completeFlow,
    searchPerformed: completeFlow,
    cartUsed: cohort.features.g2 && completeFlow,
    requestSubmitted,
    requestAccepted,
    requestRejected,
    simulatedRentalCompleted,
    ownerActionCompleted: completeFlow,
    handoverEventCount: requestAccepted ? 2 : 0,
    supportNeeded: completeFlow && attemptIndex % 7 === 0,
    listingPublished: completeFlow,
    g5ContinuationFailed,
    mainListingSurvivedG5Failure: !g5ContinuationFailed || completeFlow,
    quoteSimulationOnly: quote == null || (
      quote.currency === 'EUR'
      && quote.securityDepositMinor === 0
      && quote.totalMinor > 0
    ),
  };
}

function count(attempts, predicate) {
  return attempts.reduce((total, attempt) => total + (predicate(attempt) ? 1 : 0), 0);
}

function aggregateCohort(cohort, attempts) {
  const completed = attempts.filter((attempt) => attempt.completeFlow);
  const evaluatedCategory = completed.filter((attempt) => attempt.categoryCorrect != null);
  const evaluatedBrandModel = completed.filter(
    (attempt) => attempt.brandModelPrecisionBasisPoints != null,
  );
  const priceShown = completed.filter((attempt) => attempt.priceRecommendationShown);
  const distinctOwners = new Set(completed.map((attempt) => attempt.participantId));
  return deepFreeze({
    cohort: cohort.id,
    features: cohort.features,
    attemptedFlowCount: attempts.length,
    completedFlowCount: completed.length,
    completionRateBasisPoints: basisPoints(completed.length, attempts.length),
    abandonedFlowCount: count(attempts, (attempt) => attempt.abandoned),
    abandonmentRateBasisPoints: basisPoints(
      count(attempts, (attempt) => attempt.abandoned),
      attempts.length,
    ),
    meanDraftTimeSeconds: roundedMean(completed.map((attempt) => attempt.draftTimeSeconds)),
    meanPublishReadyTimeSeconds: roundedMean(
      completed.map((attempt) => attempt.publishReadyTimeSeconds),
    ),
    fieldEditRateBasisPoints: basisPoints(
      completed.reduce((sum, attempt) => sum + attempt.editedFieldCount, 0),
      completed.length * fieldCount,
    ),
    categoryAccuracyBasisPoints: basisPoints(
      count(evaluatedCategory, (attempt) => attempt.categoryCorrect),
      evaluatedCategory.length,
    ),
    brandModelPrecisionBasisPoints: roundedMean(
      evaluatedBrandModel.map((attempt) => attempt.brandModelPrecisionBasisPoints),
    ),
    unsupportedClaimRateBasisPoints: basisPoints(
      completed.reduce((sum, attempt) => sum + attempt.unsupportedClaimCount, 0),
      completed.length,
    ),
    priceRecommendationShownCount: priceShown.length,
    priceAcceptanceRateBasisPoints: basisPoints(
      count(priceShown, (attempt) => attempt.recommendationAccepted),
      priceShown.length,
    ),
    meanAbsolutePriceEditDeltaMinor: roundedMean(
      priceShown.map((attempt) => Math.abs(attempt.priceEditDeltaMinor)),
    ),
    clarificationCount: completed.reduce(
      (sum, attempt) => sum + attempt.clarificationCount,
      0,
    ),
    manualFallbackCount: count(completed, (attempt) => attempt.manualFallback),
    projectPlanCount: count(completed, (attempt) => attempt.projectPlanUsed),
    searchCount: count(completed, (attempt) => attempt.searchPerformed),
    cartCount: count(completed, (attempt) => attempt.cartUsed),
    requestCount: count(completed, (attempt) => attempt.requestSubmitted),
    acceptedRequestCount: count(completed, (attempt) => attempt.requestAccepted),
    rejectedRequestCount: count(completed, (attempt) => attempt.requestRejected),
    simulatedRentalCompletionCount: count(
      completed,
      (attempt) => attempt.simulatedRentalCompleted,
    ),
    distinctSyntheticOwnerCount: distinctOwners.size,
    ownerActionCount: count(completed, (attempt) => attempt.ownerActionCompleted),
    handoverEventCount: completed.reduce(
      (sum, attempt) => sum + attempt.handoverEventCount,
      0,
    ),
    supportNeedCount: count(completed, (attempt) => attempt.supportNeeded),
    g5FailureCount: count(completed, (attempt) => attempt.g5ContinuationFailed),
    g5FailurePreservedMainListingCount: count(
      completed,
      (attempt) => attempt.g5ContinuationFailed && attempt.mainListingSurvivedG5Failure,
    ),
  });
}

function comparison(cohorts) {
  const core = cohorts.find((entry) => entry.cohort === 'CORE');
  const growth = cohorts.find((entry) => entry.cohort === 'GROWTH');
  const blue = cohorts.find((entry) => entry.cohort === 'BLUE_OCEAN');
  return deepFreeze({
    growthVsCore: {
      meanDraftTimeDeltaSeconds: growth.meanDraftTimeSeconds - core.meanDraftTimeSeconds,
      meanPublishReadyTimeDeltaSeconds:
        growth.meanPublishReadyTimeSeconds - core.meanPublishReadyTimeSeconds,
      projectPlanCountDelta: growth.projectPlanCount - core.projectPlanCount,
    },
    blueOceanVsGrowth: {
      meanDraftTimeDeltaSeconds: blue.meanDraftTimeSeconds - growth.meanDraftTimeSeconds,
      meanPublishReadyTimeDeltaSeconds:
        blue.meanPublishReadyTimeSeconds - growth.meanPublishReadyTimeSeconds,
      fieldEditRateDeltaBasisPoints:
        blue.fieldEditRateBasisPoints - growth.fieldEditRateBasisPoints,
      manualFallbackCountDelta: blue.manualFallbackCount - growth.manualFallbackCount,
      priceRecommendationShownCountDelta:
        blue.priceRecommendationShownCount - growth.priceRecommendationShownCount,
    },
  });
}

export async function runBlueOceanSyntheticPilotHarness() {
  const attemptsByCohort = new Map(cohortPlan.map((cohort) => [cohort.id, []]));
  let absoluteIndex = 1;
  for (const cohort of cohortPlan) {
    for (let attemptIndex = 0; attemptIndex < cohort.attempts; attemptIndex += 1) {
      attemptsByCohort.get(cohort.id).push(await executeAttempt({
        cohort,
        attemptIndex,
        absoluteIndex,
      }));
      absoluteIndex += 1;
    }
  }
  const attempts = [...attemptsByCohort.values()].flat();
  const cohorts = cohortPlan.map((cohort) => aggregateCohort(
    cohort,
    attemptsByCohort.get(cohort.id),
  ));
  const completedFlowCount = cohorts.reduce((sum, cohort) => sum + cohort.completedFlowCount, 0);
  const distinctParticipants = new Set(attempts.map((attempt) => attempt.participantId));
  const result = {
    harnessVersion: blueOceanSyntheticPilotHarnessVersion,
    resultClassification: blueOceanSyntheticPilotResultClassification,
    executionScope: 'DETERMINISTIC_DOMAIN_SIMULATION_NOT_APP_OR_HUMAN_E2E',
    deterministicSeed: 'sit-blue-ocean-n8-fixed-seed-v1',
    syntheticParticipantCount: distinctParticipants.size,
    attemptedFlowCount: attempts.length,
    completedFlowCount,
    requiredCompletedFlowRange: { minimum: 30, maximum: 50 },
    cohorts,
    comparison: comparison(cohorts),
    invariants: {
      configuredParticipantCount: participantCount,
      allParticipantsUsed: distinctParticipants.size === participantCount,
      completeFlowRangeSatisfied: completedFlowCount >= 30 && completedFlowCount <= 50,
      individualRecordsReturned: false,
      humanResultsClaimed: false,
      planningTargetsClaimedAsObserved: false,
      externalProviderCallPerformed: false,
      externalScannerCallPerformed: false,
      paidCallPerformed: false,
      realPersonDataUsed: false,
      realMoneyUsed: false,
      productionChanged: false,
      storeChanged: false,
      firebaseChanged: false,
      automaticPublicationEnabled: false,
      syntheticLearningApplied: false,
    },
  };
  return deepFreeze({ ...result, replaySha256: digest(result) });
}
