import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import sharp from 'sharp';

import {
  assertBlueOceanExplicitPublication,
  blueOceanListingDisclosureText,
  blueOceanListingDisclosureVersion,
  reviewBlueOceanListingDraft,
} from '../src/blue_ocean_listing_workflow.js';
import {
  createDeterministicListingAiMockProvider,
  createListingAiGateway,
  deterministicListingAiMockOutput,
} from '../src/listing_ai_gateway.js';
import {
  listingAiMockModel,
  listingAiOpenAiModel,
  readListingAiGatewayConfiguration,
} from '../src/listing_ai_gateway_config.js';
import {
  evaluateListingAiSensitiveContent,
  runListingAiImagePrivacyPipeline,
} from '../src/listing_ai_image_pipeline.js';
import {
  buildRegionalDurationPriceSchedule,
  calculateAuthenticDemandFactor,
  calculateRegionalFallbackAnchor,
  previewRegionalPriceWithV52Fee,
  recommendRegionalPriceV2,
  regionalPriceCategoryRules,
  selectOwnerRegionalDailyPrice,
} from '../src/regional_price_engine_v2.js';

const corpus = JSON.parse(readFileSync(new URL(
  './fixtures/blue_ocean_n7_evaluation_corpus.json',
  import.meta.url,
), 'utf8'));
const asOf = new Date('2026-08-24T00:00:00.000Z');
const imageReferences = ['analysis_image_00000001', 'analysis_image_00000002'];

function generationKey(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function mockConfiguration(overrides = {}) {
  return {
    ...readListingAiGatewayConfiguration({
      SIT_LISTING_AI_PROVIDER: 'mock',
      SIT_LISTING_AI_MODEL: listingAiMockModel,
      SIT_LISTING_AI_BUDGET_CENTS: '0',
    }),
    ...overrides,
  };
}

function gatewayInput(id) {
  return {
    draftId: 'listing_ai_draft_12345678-1234-4123-8123-123456789abc',
    ownerId: 'owner_12345678',
    generationKey: generationKey(id),
    revision: 1,
    imageReferences,
    untrustedOcr: [],
    manualInputPresent: true,
  };
}

async function imageBytes() {
  return sharp({
    create: {
      width: 16,
      height: 16,
      channels: 3,
      background: { r: 40, g: 90, b: 150 },
    },
  }).png().toBuffer();
}

function imageConsent() {
  return {
    explicitlyInitiated: true,
    accepted: true,
    disclosureVersion: blueOceanListingDisclosureVersion,
    disclosureText: blueOceanListingDisclosureText,
  };
}

function observation(index, overrides = {}) {
  const sourceType = overrides.sourceType ?? 'completed_sit_rental';
  const statuses = {
    completed_sit_rental: 'completed',
    accepted_sit_request: 'accepted',
    active_sit_listing: 'active',
    reviewed_external_c2c_asking_price: 'reviewed',
    professional_commercial_reference: 'reviewed',
    synthetic_fixture: 'synthetic',
  };
  return {
    observationId: `n7_observation_${String(index).padStart(8, '0')}`,
    categoryKey: 'power_tools',
    subcategory: 'Bohrmaschinen',
    brandModelFamily: 'Fixture Model Family',
    condition: 'good',
    dailyEquivalentRentMinor: 1_500 + index,
    currency: 'EUR',
    marketActorType: sourceType === 'professional_commercial_reference'
      ? 'commercial'
      : 'private',
    geographyBucket: 'heilbronn_wave0',
    stateCode: 'DE-BW',
    countryCode: 'DE',
    distanceKm: 5,
    capturedAt: '2026-08-23T00:00:00.000Z',
    sourceType,
    status: statuses[sourceType],
    provenanceReference: `n7_provenance_${String(index).padStart(8, '0')}`,
    reviewed: sourceType.includes('external') || sourceType.includes('professional'),
    amountIncludesOnlyRent: true,
    synthetic: sourceType === 'synthetic_fixture',
    ...overrides,
  };
}

function recommendation(overrides = {}) {
  return recommendRegionalPriceV2({
    categoryKey: 'power_tools',
    subcategory: 'Bohrmaschinen',
    brandModelFamily: 'Fixture Model Family',
    condition: 'good',
    replacementValueBand: 'eur_250_500',
    replacementValueBandConfidence: 'HIGH',
    ownerConfirmedReplacementValueBand: false,
    observations: [],
    asOf,
    ...overrides,
  });
}

function editedFields(accessories = ['Ladegeraet', 'Koffer']) {
  return {
    title: 'Synthetischer Akku-Bohrschrauber',
    category: 'cat8',
    subcategory: 'Bohrmaschinen',
    brand: 'Fixture-Marke',
    model: 'Fixture-M18',
    description: 'Personenbezugsfreier Evaluationsentwurf fuer den geschlossenen Pilot.',
    condition: 'good',
    accessories,
    projectTags: ['renovation'],
    useCases: ['bohren'],
    safetyNotes: 'Nur bestimmungsgemaess verwenden.',
    replacementValueMinor: 17_500,
    pickupRegion: 'heilbronn_wave0',
  };
}

function confirmations(finalPublication = true) {
  return Object.fromEntries([
    'ownership', 'item_identity', 'allowed_category', 'functionality',
    'condition', 'accessories', 'owner_price', 'duration_discounts',
    'availability', 'pickup_region', 'final_publication',
  ].map((id) => [id, id === 'final_publication' ? finalPublication : true]));
}

async function generatedRevision(id) {
  const result = await createListingAiGateway({ configuration: mockConfiguration() })
    .generate(gatewayInput(id));
  assert.equal(result.status, 'draft_ready');
  return result.revision;
}

async function reviewedDraft(id, { accessories, finalPublication = true } = {}) {
  const revision = await generatedRevision(`${id}-source`);
  return reviewBlueOceanListingDraft({
    previousRevision: revision,
    generationKey: generationKey(`${id}-review`),
    editedFields: editedFields(accessories),
    answeredClarificationIds: revision.clarificationQuestions.map((entry) => entry.id),
    ownerConfirmations: confirmations(finalPublication),
    pricing: {
      replacementValueBand: 'eur_100_250',
      ownerConfirmedReplacementValueBand: true,
      ownerConfirmedReplacementValueMinor: null,
      ownerDailyPriceMinor: 1_600,
      durationPricingEnabled: true,
    },
    imagePreflightPassed: true,
    consentValid: true,
    generatedAt: asOf,
  });
}

test('N7 corpus identity and declared non-live boundaries are closed', () => {
  assert.equal(corpus.schemaVersion, 1);
  assert.equal(corpus.kind, 'sit-stage-a-blue-ocean-n7-evaluation-corpus');
  assert.equal(corpus.dataClassification, 'synthetic-no-personal-data');
  assert.equal(corpus.listingCases.length, 22);
  assert.equal(corpus.priceCases.length, 24);
  assert.deepEqual(corpus.boundaries, {
    externalProviderCallAllowed: false,
    paidCallAllowed: false,
    realPersonDataAllowed: false,
    syntheticLearningWeight: 0,
    automaticPublicationAllowed: false,
    productionMutationAllowed: false,
  });
  assert.equal(new Set([
    ...corpus.listingCases.map((entry) => entry.id),
    ...corpus.priceCases.map((entry) => entry.id),
  ]).size, 46);
});

test('N7 price matrix executes every category, value band and condition combination', () => {
  let executed = 0;
  for (const categoryKey of corpus.priceMatrix.categories) {
    for (const replacementValueBand of corpus.priceMatrix.replacementValueBands) {
      for (const condition of corpus.priceMatrix.conditions) {
        const result = calculateRegionalFallbackAnchor({
          categoryKey,
          condition,
          replacementValueBand,
          replacementValueBandConfidence: 'HIGH',
          ownerConfirmedReplacementValueBand: replacementValueBand === 'over_1000',
          ownerConfirmedReplacementValueMinor: replacementValueBand === 'over_1000'
            ? 120_000
            : null,
        });
        const rule = regionalPriceCategoryRules[categoryKey];
        assert.ok(result.fallbackAnchorMinor >= rule.minimumMinor);
        assert.ok(result.fallbackAnchorMinor <= rule.maximumMinor);
        assert.equal(result.fallbackAnchorMinor % 100, 0);
        assert.equal(result.roundingRule, corpus.priceMatrix.roundingRule);
        executed += 1;
      }
    }
  }
  assert.equal(executed, corpus.priceMatrix.expectedCombinationCount);
});

for (const entry of corpus.listingCases) {
  test(`N7 listing case: ${entry.id}`, async () => {
    if (entry.runner === 'mock_draft') {
      const result = await createListingAiGateway({ configuration: mockConfiguration() })
        .generate(gatewayInput(entry.id));
      assert.equal(result.status, entry.expected);
      assert.equal(result.autoPublishAllowed, false);
      return;
    }
    if (entry.runner === 'image_count') {
      const bytes = await imageBytes();
      const result = await runListingAiImagePrivacyPipeline({
        images: Array.from({ length: entry.imageCount }, (_, index) => ({
          imageReference: `n7_image_reference_${index + 1}`,
          originalFilename: null,
          bytes,
          localScreening: { localOcrText: '', visualScanCompleted: true, visualSignals: [] },
        })),
        consent: imageConsent(),
      });
      assert.equal(result.images.length, entry.imageCount);
      assert.equal(result.providerCallPerformed, false);
      return;
    }
    if (entry.runner === 'mock_low_model') {
      const output = deterministicListingAiMockOutput(imageReferences);
      assert.equal(output.fields.model.value, null);
      assert.equal(output.fields.model.confidence, 'LOW');
      assert.ok(output.clarificationQuestions.some((question) => question.field === 'model'));
      assert.ok(output.clarificationQuestions.length <= 3);
      return;
    }
    if (entry.runner === 'owner_accessories') {
      const review = await reviewedDraft(entry.id, { accessories: entry.accessories });
      assert.deepEqual(review.revision.fields.accessories.value, entry.accessories);
      assert.equal(review.revision.fields.accessories.ownerConfirmed, true);
      return;
    }
    if (entry.runner === 'price_condition') {
      const worn = calculateRegionalFallbackAnchor({
        categoryKey: 'power_tools',
        condition: entry.condition,
        replacementValueBand: 'eur_250_500',
        replacementValueBandConfidence: 'HIGH',
      });
      const fresh = calculateRegionalFallbackAnchor({
        categoryKey: 'power_tools',
        condition: 'like_new',
        replacementValueBand: 'eur_250_500',
        replacementValueBandConfidence: 'HIGH',
      });
      assert.ok(worn.fallbackAnchorMinor < fresh.fallbackAnchorMinor);
      return;
    }
    if (entry.runner === 'gateway_schema_rejection') {
      const output = structuredClone(deterministicListingAiMockOutput(imageReferences));
      if (entry.mutation === 'prohibited_category') {
        output.fields.category.value = 'cat10';
        output.fields.subcategory.value = 'Drohnen';
      } else {
        output.unexpected = true;
      }
      const gateway = createListingAiGateway({
        configuration: mockConfiguration(),
        providers: { mock: createDeterministicListingAiMockProvider({ outputFactory: () => output }) },
      });
      const result = await gateway.generate(gatewayInput(entry.id));
      assert.equal(result.status, entry.expected);
      assert.equal(result.reasonCode, 'listing_ai_schema_rejected');
      assert.equal(result.partialAiStateCreated, false);
      return;
    }
    if (entry.runner === 'image_signal') {
      const input = entry.signal === 'low_light'
        ? { localOcrText: '', visualScanCompleted: false, visualSignals: [] }
        : {
            localOcrText: '',
            visualScanCompleted: true,
            visualSignals: [{ type: entry.signal, confidence: entry.confidence }],
          };
      const result = evaluateListingAiSensitiveContent(input);
      assert.equal(result.status, entry.expected);
      assert.equal(result.providerEligible, false);
      return;
    }
    if (entry.runner === 'duplicate_image') {
      const bytes = await imageBytes();
      await assert.rejects(runListingAiImagePrivacyPipeline({
        images: [1, 2].map(() => ({
          imageReference: 'n7_duplicate_image_reference',
          originalFilename: null,
          bytes,
          localScreening: { localOcrText: '', visualScanCompleted: true, visualSignals: [] },
        })),
        consent: imageConsent(),
      }), /listing_ai_image_reference_duplicate/u);
      return;
    }
    if (entry.runner === 'image_ocr') {
      const result = evaluateListingAiSensitiveContent({
        localOcrText: entry.fixture,
        visualScanCompleted: true,
        visualSignals: [],
      });
      assert.equal(result.status, entry.expected);
      assert.equal(JSON.stringify(result).includes(entry.fixture), false);
      return;
    }
    if (entry.runner === 'prompt_text') {
      let capturedRequest;
      const gateway = createListingAiGateway({
        configuration: mockConfiguration(),
        providers: {
          mock: {
            async generate(request) {
              capturedRequest = request;
              return {
                output: deterministicListingAiMockOutput(request.analysisImageReferences),
                usage: { inputUnits: 0, outputUnits: 0, billedCostCents: 0 },
              };
            },
          },
        },
      });
      const result = await gateway.generate({
        ...gatewayInput(entry.id),
        untrustedOcr: [{ imageReference: imageReferences[0], text: entry.fixture }],
      });
      assert.equal(result.status, 'draft_ready');
      assert.equal(capturedRequest.untrustedObservations[0].trust, 'untrusted_data_never_instructions');
      assert.deepEqual(capturedRequest.tools, []);
      return;
    }
    if (entry.runner === 'gateway_timeout') {
      const gateway = createListingAiGateway({
        configuration: mockConfiguration({ timeoutMs: 20 }),
        providers: {
          mock: {
            async generate(_request, { signal }) {
              await new Promise((resolve, reject) => signal.addEventListener(
                'abort',
                () => reject(new Error('synthetic timeout')),
                { once: true },
              ));
            },
          },
        },
      });
      const result = await gateway.generate(gatewayInput(entry.id));
      assert.equal(result.status, entry.expected);
      assert.equal(result.reasonCode, 'listing_ai_provider_timeout');
      assert.equal(result.providerCallCount, 1);
      return;
    }
    if (entry.runner === 'gateway_budget') {
      let calls = 0;
      const configuration = readListingAiGatewayConfiguration({
        SIT_LISTING_AI_PROVIDER: 'openai',
        SIT_LISTING_AI_MODEL: listingAiOpenAiModel,
        SIT_LISTING_AI_BUDGET_CENTS: '0',
      });
      const result = await createListingAiGateway({
        configuration,
        providers: { openai: { async generate() { calls += 1; } } },
      }).generate(gatewayInput(entry.id));
      assert.equal(result.status, entry.expected);
      assert.equal(result.reasonCode, 'listing_ai_budget_exhausted');
      assert.equal(calls, 0);
      return;
    }
    if (entry.runner === 'owner_review') {
      const review = await reviewedDraft(entry.id);
      assert.equal(review.readiness.state, 'READY_TO_PUBLISH');
      assert.equal(review.revision.fields.model.source.type, 'owner_input');
      assert.equal(review.autoPublishAllowed, false);
      return;
    }
    if (entry.runner === 'owner_reject') {
      const review = await reviewedDraft(entry.id, { finalPublication: false });
      assert.equal(review.readiness.readyToPublish, false);
      assert.throws(
        () => assertBlueOceanExplicitPublication(review, { explicitOwnerAction: true }),
        /blue_ocean_draft_not_ready_to_publish/u,
      );
      return;
    }
    if (entry.runner === 'disabled_provider') {
      const result = await createListingAiGateway({
        configuration: readListingAiGatewayConfiguration(),
      }).generate(gatewayInput(entry.id));
      assert.equal(result.status, entry.expected);
      assert.equal(result.photosPreserved, true);
      assert.equal(result.manualInputsPreserved, true);
      return;
    }
    if (entry.runner === 'publication_boundary') {
      const review = await reviewedDraft(entry.id);
      assert.throws(
        () => assertBlueOceanExplicitPublication(review, { explicitOwnerAction: false }),
        /blue_ocean_explicit_publication_required/u,
      );
      assert.equal(review.autoPublishAllowed, false);
      return;
    }
    if (entry.runner === 'postgres_g5_failure') {
      const source = readFileSync(new URL('./postgres_foundation.integration.test.js', import.meta.url), 'utf8');
      assert.match(source, /g5_failure_after_main_publication/u);
      assert.match(source, /main_listing_remains_published/u);
      return;
    }
    assert.fail(`Unknown N7 listing runner: ${entry.runner}`);
  });
}

for (const entry of corpus.priceCases) {
  test(`N7 price case: ${entry.id}`, () => {
    if (entry.runner === 'category_bounds') {
      for (const [categoryKey, rule] of Object.entries(regionalPriceCategoryRules)) {
        const low = calculateRegionalFallbackAnchor({
          categoryKey,
          condition: 'visibly_used_but_functional',
          replacementValueBand: 'under_100',
          replacementValueBandConfidence: 'HIGH',
        });
        const high = calculateRegionalFallbackAnchor({
          categoryKey,
          condition: 'like_new',
          replacementValueBand: 'over_1000',
          replacementValueBandConfidence: 'HIGH',
          ownerConfirmedReplacementValueBand: true,
          ownerConfirmedReplacementValueMinor: 100_000_000,
        });
        assert.ok(low.fallbackAnchorMinor >= rule.minimumMinor);
        assert.equal(high.fallbackAnchorMinor, rule.maximumMinor);
      }
      return;
    }
    if (entry.runner === 'rounding') {
      for (const categoryKey of corpus.priceMatrix.categories) {
        const result = calculateRegionalFallbackAnchor({
          categoryKey,
          condition: 'good',
          replacementValueBand: 'eur_100_250',
          replacementValueBandConfidence: 'HIGH',
        });
        assert.equal(result.fallbackAnchorMinor % 100, 0);
      }
      return;
    }
    if (entry.runner === 'regional_evidence') {
      const observations = entry.strength === 'none'
        ? []
        : (entry.strength === 'weak'
            ? [observation(100, {
                sourceType: 'professional_commercial_reference',
                status: 'reviewed',
                reviewed: true,
                marketActorType: 'commercial',
                distanceKm: 90,
              })]
            : Array.from({ length: 10 }, (_, index) => observation(110 + index, {
                distanceKm: index + 1,
                dailyEquivalentRentMinor: 1_400 + (index * 20),
              })));
      const result = recommendation({ observations });
      assert.equal(result.confidence, entry.strength === 'strong' ? 'HIGH' : 'LOW');
      if (entry.strength === 'none') assert.equal(result.fallbackShareBasisPoints, 10_000);
      if (entry.strength === 'weak') assert.ok(result.fallbackShareBasisPoints > 8_000);
      return;
    }
    if (entry.runner === 'geography') {
      const observations = Array.from({ length: 4 }, (_, index) => observation(200 + index, {
        distanceKm: entry.distanceKm + index,
        stateCode: entry.stateCode ?? 'DE-BW',
        geographyBucket: entry.expected === 'germany'
          ? 'germany_reviewed'
          : 'heilbronn_wave0',
      }));
      assert.equal(recommendation({ observations }).geographyScope, entry.expected);
      return;
    }
    if (entry.runner === 'source_mix') {
      const result = recommendation({ observations: [
        observation(300, { dailyEquivalentRentMinor: 1_500 }),
        observation(301, {
          sourceType: 'professional_commercial_reference',
          status: 'reviewed',
          reviewed: true,
          marketActorType: 'commercial',
          dailyEquivalentRentMinor: 1_650,
        }),
        observation(302, { dailyEquivalentRentMinor: 1_600 }),
      ] });
      assert.deepEqual(result.sourceComposition, {
        completed_sit_rental: 2,
        professional_commercial_reference: 1,
      });
      assert.ok(result.regionalWeightedMedianMinor < 1_650);
      return;
    }
    if (entry.runner === 'outlier') {
      const result = recommendation({ observations: [
        ...Array.from({ length: 5 }, (_, index) => observation(400 + index, {
          dailyEquivalentRentMinor: 1_400 + (index * 25),
        })),
        observation(499, { dailyEquivalentRentMinor: 3_500 }),
      ] });
      assert.ok(result.excludedObservations.some((item) => item.reasonCode === 'robust_mad_outlier'));
      return;
    }
    if (entry.runner === 'shrinkage') {
      const result = recommendation({ observations: [observation(500, {
        sourceType: 'professional_commercial_reference',
        status: 'reviewed',
        reviewed: true,
        marketActorType: 'commercial',
        distanceKm: 95,
        dailyEquivalentRentMinor: 3_000,
      })] });
      assert.ok(result.fallbackShareBasisPoints > 8_000);
      assert.ok(result.marketBlendedMinor < 3_000);
      return;
    }
    if (entry.runner === 'demand') {
      const result = calculateAuthenticDemandFactor({
        authenticRequestCount: entry.requests,
        authenticActiveListingCount: entry.listings,
        serverObserved: true,
        synthetic: false,
        observationWindowVersion: 'stage-a-v1',
      });
      assert.equal(result.factorBasisPoints, entry.expectedBasisPoints);
      return;
    }
    if (entry.runner === 'synthetic') {
      const result = recommendation({ observations: [observation(600, {
        sourceType: 'synthetic_fixture',
        status: 'synthetic',
        synthetic: true,
      })] });
      assert.equal(result.includedObservationCount, 0);
      assert.equal(result.syntheticLearningApplied, false);
      return;
    }
    if (entry.runner === 'owner_options') {
      const result = recommendation();
      const values = result.ownerOptions.map((option) => option.dailyPriceMinor);
      assert.equal(result.ownerOptions.length, 3);
      assert.deepEqual([...values].sort((a, b) => a - b), values);
      assert.ok(result.ownerOptions.every((option) => option.editable));
      return;
    }
    if (entry.runner === 'duration') {
      const result = buildRegionalDurationPriceSchedule({ ownerDailyPriceMinor: 1_000 });
      assert.equal(result.tiers.length, 5);
      assert.equal(result.marketDerived, false);
      assert.equal(buildRegionalDurationPriceSchedule({
        ownerDailyPriceMinor: 1_000,
        enabled: false,
      }).tiers.length, 0);
      return;
    }
    if (entry.runner === 'owner_override') {
      const result = selectOwnerRegionalDailyPrice({
        recommendation: recommendation(),
        ownerDailyPriceMinor: 2_100,
        ownerConfirmed: true,
      });
      assert.equal(result.ownerOverrideApplied, true);
      assert.equal(result.ownerSelectedDailyMinor, 2_100);
      return;
    }
    if (entry.runner === 'v52_fee') {
      const result = previewRegionalPriceWithV52Fee({ ownerDailyPriceMinor: 1_000, days: 2 });
      assert.equal(result.ownerRentMinor, 1_800);
      assert.equal(result.sitPlatformContributionMinor, 180);
      assert.equal(result.renterTotalMinor, 1_980);
      assert.equal(result.noRealMoney, true);
      return;
    }
    if (entry.runner === 'stale') {
      const result = recommendation({ observations: [observation(700, {
        capturedAt: '2023-01-01T00:00:00.000Z',
      })] });
      assert.deepEqual(result.excludedObservations, [{
        observationId: 'n7_observation_00000700',
        reasonCode: 'stale_observation',
      }]);
      return;
    }
    if (entry.runner === 'malformed') {
      assert.throws(
        () => recommendation({ observations: [{ malformed: true }] }),
        /regional_price_observation_schema_invalid/u,
      );
      return;
    }
    assert.fail(`Unknown N7 price runner: ${entry.runner}`);
  });
}
