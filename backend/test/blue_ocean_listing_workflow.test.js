import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';

import sharp from 'sharp';

import {
  assertBlueOceanExplicitPublication,
  blueOceanListingDisclosureText,
  blueOceanListingDisclosureVersion,
  blueOceanOnDeviceDisclosureText,
  blueOceanOnDeviceDisclosureVersion,
  blueOceanRegionalPriceRuleByCatalogKey,
  blueOceanListingWorkflowVersion,
  BlueOceanListingWorkflowError,
  createBlueOceanListingWorkflow,
  reviewBlueOceanListingDraft,
} from '../src/blue_ocean_listing_workflow.js';
import { privatePilotAllowedCatalogKeys } from '../src/private_pilot_domain.js';
import { regionalPriceCategoryRules } from '../src/regional_price_engine_v2.js';
import {
  listingAiMockModel,
  listingAiOnDeviceModel,
  listingAiOpenAiModel,
  readListingAiGatewayConfiguration,
} from '../src/listing_ai_gateway_config.js';
import {
  createListingAiGateway,
  deterministicListingAiMockOutput,
} from '../src/listing_ai_gateway.js';
import { createOpenAiListingAiProvider } from '../src/openai_listing_ai_provider.js';

const ownerId = 'owner_12345678';
const draftId = 'listing_ai_draft_12345678-1234-4123-8123-123456789abc';

function key(suffix) {
  return crypto.createHash('sha256').update(suffix).digest('hex');
}

function config() {
  return readListingAiGatewayConfiguration({
    SIT_LISTING_AI_PROVIDER: 'mock',
    SIT_LISTING_AI_MODEL: listingAiMockModel,
    SIT_LISTING_AI_BUDGET_CENTS: '0',
  });
}

async function fixtureImage() {
  return sharp({
    create: {
      width: 8,
      height: 8,
      channels: 3,
      background: { r: 30, g: 90, b: 180 },
    },
  }).png().toBuffer();
}

function consent() {
  return {
    explicitlyInitiated: true,
    accepted: true,
    disclosureVersion: blueOceanListingDisclosureVersion,
    disclosureText: blueOceanListingDisclosureText,
  };
}

function onDeviceConsent() {
  return {
    explicitlyInitiated: true,
    accepted: true,
    disclosureVersion: blueOceanOnDeviceDisclosureVersion,
    disclosureText: blueOceanOnDeviceDisclosureText,
  };
}

function editedFields() {
  return {
    title: 'Akku-Bohrschrauber',
    category: 'cat8',
    subcategory: 'Bohrmaschinen',
    brand: 'Mock-Marke',
    model: 'M-18',
    description: 'Voll funktionsfähiger Bohrschrauber mit Ladegerät und Koffer.',
    condition: 'good',
    accessories: ['Ladegerät', 'Koffer'],
    projectTags: ['renovation'],
    useCases: ['bohren'],
    safetyNotes: 'Nur bestimmungsgemäß und mit Schutzbrille verwenden.',
    replacementValueMinor: 17_500,
    pickupRegion: 'heilbronn_wave0',
  };
}

function confirmations({ finalPublication = false } = {}) {
  return {
    ownership: true,
    item_identity: true,
    allowed_category: true,
    functionality: true,
    condition: true,
    accessories: true,
    owner_price: true,
    duration_discounts: true,
    availability: true,
    pickup_region: true,
    final_publication: finalPublication,
  };
}

function pricing(ownerDailyPriceMinor = null) {
  return {
    replacementValueBand: 'eur_100_250',
    ownerConfirmedReplacementValueBand: true,
    ownerConfirmedReplacementValueMinor: null,
    ownerDailyPriceMinor,
    durationPricingEnabled: true,
  };
}

test('regional price rules bind exact catalog pairs rather than broad categories', () => {
  for (const [catalogKey, rule] of Object.entries(
    blueOceanRegionalPriceRuleByCatalogKey,
  )) {
    assert.ok(privatePilotAllowedCatalogKeys.includes(catalogKey));
    assert.ok(rule in regionalPriceCategoryRules);
  }
  assert.equal(
    blueOceanRegionalPriceRuleByCatalogKey['cat8\u001fBohrmaschinen'],
    'power_tools',
  );
  assert.equal(
    blueOceanRegionalPriceRuleByCatalogKey['cat8\u001fHandwerkzeuge'],
    'ladders_hand_tools',
  );
  assert.equal(
    blueOceanRegionalPriceRuleByCatalogKey['cat3\u001fKameras'],
    undefined,
  );
  assert.equal(
    blueOceanRegionalPriceRuleByCatalogKey['cat20\u001fPräsentation'],
    undefined,
  );
});

test('trusted local preflight composes N4, mock N3 and an editable non-published draft', async () => {
  const workflow = createBlueOceanListingWorkflow({
    configuration: config(),
    screenImage: async () => ({
      localOcrText: '',
      visualScanCompleted: true,
      visualSignals: [],
    }),
  });
  const bytes = await fixtureImage();
  const result = await workflow.analyze({
    draftId,
    ownerId,
    generationKey: key('analyze'),
    images: [{
      imageReference: 'listing_image_12345678',
      mimeType: 'image/png',
      bytes,
    }],
    consent: consent(),
  });
  assert.equal(result.workflowVersion, blueOceanListingWorkflowVersion);
  assert.equal(result.status, 'draft_ready');
  assert.equal(result.revision.fields.title.value, 'Akku-Bohrschrauber');
  assert.equal(result.revision.fields.model.value, null);
  assert.equal(result.revision.fields.model.confidence, 'LOW');
  assert.equal(result.revision.clarificationQuestions.length, 2);
  assert.equal(result.imageReview.realImageSafetyReviewCompleted, true);
  assert.equal(result.imageReview.temporaryDerivativeBytesPurged, true);
  assert.equal(result.billedCostCents, 0);
  assert.equal(result.autoPublishAllowed, false);
});

test('on-device image labels and OCR are privacy-screened and create a review-only draft', async () => {
  const configuration = readListingAiGatewayConfiguration({
    SIT_LISTING_AI_PROVIDER: 'on_device',
    SIT_LISTING_AI_MODEL: listingAiOnDeviceModel,
    SIT_LISTING_AI_BUDGET_CENTS: '0',
  }, { deploymentEnvironment: 'staging' });
  const workflow = createBlueOceanListingWorkflow({ configuration });
  const bytes = await fixtureImage();
  const result = await workflow.analyze({
    draftId,
    ownerId,
    generationKey: key('on-device-analyze'),
    images: [{
      imageReference: 'listing_image_12345678',
      mimeType: 'image/png',
      bytes,
    }],
    consent: onDeviceConsent(),
    onDeviceAnalysis: [{
      modelVersion: listingAiOnDeviceModel,
      labels: [{ text: 'Power drill', confidence: 0.93, index: 42 }],
      ocrText: 'Bosch GSR18V',
    }],
  });

  assert.equal(result.status, 'draft_ready');
  assert.equal(result.disclosureVersion, blueOceanOnDeviceDisclosureVersion);
  assert.equal(result.paidCallPerformed, false);
  assert.equal(result.billedCostCents, 0);
  assert.equal(result.autoPublishAllowed, false);
  assert.equal(result.revision.fields.title.value, 'Bosch GSR18V Bohrmaschine');
  assert.equal(result.revision.fields.category.value, 'cat8');
  assert.equal(result.revision.fields.replacementValueMinor.value, null);
});

test('on-device sensitive labels and observation/model drift fail closed', async () => {
  const configuration = readListingAiGatewayConfiguration({
    SIT_LISTING_AI_PROVIDER: 'on_device',
    SIT_LISTING_AI_MODEL: listingAiOnDeviceModel,
    SIT_LISTING_AI_BUDGET_CENTS: '0',
  }, { deploymentEnvironment: 'staging' });
  const workflow = createBlueOceanListingWorkflow({ configuration });
  const bytes = await fixtureImage();
  const base = {
    draftId,
    ownerId,
    images: [{
      imageReference: 'listing_image_12345678',
      mimeType: 'image/png',
      bytes,
    }],
    consent: onDeviceConsent(),
  };
  const blocked = await workflow.analyze({
    ...base,
    generationKey: key('on-device-sensitive'),
    onDeviceAnalysis: [{
      modelVersion: listingAiOnDeviceModel,
      labels: [{ text: 'Credit card', confidence: 0.91, index: 77 }],
      ocrText: '',
    }],
  });
  assert.equal(blocked.status, 'manual_fallback');
  assert.equal(blocked.reasonCode, 'blue_ocean_sensitive_image_blocked');
  assert.equal(blocked.autoPublishAllowed, false);

  await assert.rejects(
    workflow.analyze({
      ...base,
      generationKey: key('on-device-stale'),
      onDeviceAnalysis: [{
        modelVersion: 'stale-model',
        labels: [],
        ocrText: '',
      }],
    }),
    (error) => error instanceof BlueOceanListingWorkflowError
      && error.code === 'blue_ocean_on_device_analysis_invalid',
  );
});

test('default incomplete local screening fails closed and preserves the manual editor', async () => {
  const workflow = createBlueOceanListingWorkflow({ configuration: config() });
  const result = await workflow.analyze({
    draftId,
    ownerId,
    generationKey: key('incomplete-screen'),
    images: [{
      imageReference: 'listing_image_12345678',
      mimeType: 'image/png',
      bytes: await fixtureImage(),
    }],
    consent: consent(),
  });
  assert.equal(result.status, 'manual_fallback');
  assert.equal(result.reasonCode, 'blue_ocean_image_review_required');
  assert.equal(result.openManualEditor, true);
  assert.equal(result.photosPreserved, true);
  assert.equal(result.manualInputsPreserved, true);
  assert.equal(result.paidCallPerformed, false);
  assert.equal(result.autoPublishAllowed, false);
});

test('openai composition screens stripped derivatives and reports estimated not billed cost', async () => {
  const configuration = readListingAiGatewayConfiguration({
    SIT_LISTING_AI_PROVIDER: 'openai',
    SIT_LISTING_AI_MODEL: listingAiOpenAiModel,
    SIT_LISTING_AI_BUDGET_CENTS: '5',
    SIT_LISTING_AI_EXTERNAL_EXECUTION_APPROVED: '1',
  }, { deploymentEnvironment: 'staging' });
  let generatedBytes = null;
  const gateway = createListingAiGateway({
    configuration,
    providers: {
      openai: {
        async generate(request, { analysisImages }) {
          generatedBytes = analysisImages[0].bytes;
          const output = structuredClone(
            deterministicListingAiMockOutput(request.analysisImageReferences),
          );
          for (const field of Object.values(output.fields)) field.source.type = 'provider_output';
          return {
            output,
            usage: {
              inputUnits: 100,
              outputUnits: 100,
              estimatedCostCents: 1,
              billedCostCents: null,
            },
          };
        },
      },
    },
  });
  let screenedBytes = null;
  const workflow = createBlueOceanListingWorkflow({
    configuration,
    gateway,
    screenDerivative: async (derivative) => {
      screenedBytes = derivative.bytes;
      return {
        visualScanCompleted: true,
        visualSignals: [],
        usage: {
          inputUnits: 25,
          outputUnits: 10,
          estimatedCostCents: 1,
          billedCostCents: null,
        },
      };
    },
  });
  const result = await workflow.analyze({
    draftId,
    ownerId,
    generationKey: key('openai-compose'),
    images: [{
      imageReference: 'listing_image_12345678',
      mimeType: 'image/png',
      bytes: await fixtureImage(),
    }],
    consent: consent(),
  });
  assert.equal(result.status, 'draft_ready');
  assert.equal(result.providerCallCount, 2);
  assert.equal(result.paidCallPerformed, true);
  assert.equal(result.estimatedCostCents, 2);
  assert.equal(result.billedCostCents, null);
  assert.strictEqual(screenedBytes, generatedBytes);
  assert.ok(generatedBytes.every((byte) => byte === 0));
});

test('actual adapter rejects non-completed screening and generation without creating an AI draft', async (t) => {
  for (const failedPhase of ['screening', 'generation']) {
    await t.test(failedPhase, async () => {
      const configuration = readListingAiGatewayConfiguration({
        SIT_LISTING_AI_PROVIDER: 'openai',
        SIT_LISTING_AI_MODEL: listingAiOpenAiModel,
        SIT_LISTING_AI_BUDGET_CENTS: '5',
        SIT_LISTING_AI_EXTERNAL_EXECUTION_APPROVED: '1',
      }, { deploymentEnvironment: 'staging' });
      let calls = 0;
      let generatedRequest;
      const provider = createOpenAiListingAiProvider({
        configuration,
        apiKey: `sk-test-${'x'.repeat(32)}`,
        fetchImpl: async () => {
          calls += 1;
          const phase = calls === 1 ? 'screening' : 'generation';
          const output = phase === 'screening'
            ? { visualScanCompleted: true, visualSignals: [] }
            : structuredClone(deterministicListingAiMockOutput(generatedRequest.analysisImageReferences));
          if (output.fields) {
            for (const field of Object.values(output.fields)) field.source.type = 'provider_output';
          }
          return {
            ok: true,
            status: 200,
            json: async () => ({
              status: phase === failedPhase ? 'failed' : 'completed',
              output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(output) }] }],
              usage: { input_tokens: 100, output_tokens: 50 },
            }),
          };
        },
      });
      const gateway = createListingAiGateway({
        configuration,
        providers: {
          openai: {
            generate(request, options) {
              generatedRequest = request;
              return provider.generate(request, options);
            },
          },
        },
      });
      const workflow = createBlueOceanListingWorkflow({
        configuration, gateway, screenDerivative: provider.screenDerivative,
      });
      const bytes = await fixtureImage();
      const original = Buffer.from(bytes);
      const result = await workflow.analyze({
        draftId,
        ownerId,
        generationKey: key(`non-completed-${failedPhase}`),
        images: [{ imageReference: 'listing_image_12345678', mimeType: 'image/png', bytes }],
        consent: consent(),
      });
      assert.equal(calls, failedPhase === 'screening' ? 1 : 2);
      assert.equal(result.providerCallCount, calls);
      assert.equal(result.status, 'manual_fallback');
      assert.equal(result.openManualEditor, true);
      assert.equal(result.photosPreserved, true);
      assert.equal(result.manualInputsPreserved, true);
      assert.equal(result.autoPublishAllowed, false);
      assert.equal('revision' in result, false);
      assert.equal(result.billedCostCents, null);
      assert.deepEqual(bytes, original);
    });
  }
});

test('openai screening timeout returns a truthful paid manual fallback', async () => {
  const configuration = readListingAiGatewayConfiguration({
    SIT_LISTING_AI_PROVIDER: 'openai',
    SIT_LISTING_AI_MODEL: listingAiOpenAiModel,
    SIT_LISTING_AI_BUDGET_CENTS: '5',
    SIT_LISTING_AI_EXTERNAL_EXECUTION_APPROVED: '1',
    SIT_LISTING_AI_TIMEOUT_MS: '250',
  }, { deploymentEnvironment: 'staging' });
  let signal = null;
  const workflow = createBlueOceanListingWorkflow({
    configuration,
    screenDerivative: async (_derivative, options) => {
      signal = options.signal;
      return new Promise(() => {});
    },
  });
  const result = await workflow.analyze({
    draftId,
    ownerId,
    generationKey: key('openai-screen-timeout'),
    images: [{
      imageReference: 'listing_image_12345678',
      mimeType: 'image/png',
      bytes: await fixtureImage(),
    }],
    consent: consent(),
  });
  assert.equal(signal.aborted, true);
  assert.equal(result.status, 'manual_fallback');
  assert.equal(result.reasonCode, 'listing_ai_image_visual_screen_timeout');
  assert.equal(result.providerCallCount, 1);
  assert.equal(result.paidCallPerformed, true);
  assert.equal(result.estimatedCostCents, null);
  assert.equal(result.billedCostCents, null);
});

test('openai multi-image screening failure reports all attempted paid calls', async () => {
  const configuration = readListingAiGatewayConfiguration({
    SIT_LISTING_AI_PROVIDER: 'openai',
    SIT_LISTING_AI_MODEL: listingAiOpenAiModel,
    SIT_LISTING_AI_BUDGET_CENTS: '5',
    SIT_LISTING_AI_EXTERNAL_EXECUTION_APPROVED: '1',
  }, { deploymentEnvironment: 'staging' });
  let calls = 0;
  const workflow = createBlueOceanListingWorkflow({
    configuration,
    screenDerivative: async () => {
      calls += 1;
      if (calls === 2) throw new Error('private provider detail');
      return {
        visualScanCompleted: true,
        visualSignals: [],
        usage: {
          inputUnits: 25,
          outputUnits: 10,
          estimatedCostCents: 1,
          billedCostCents: null,
        },
      };
    },
  });
  const result = await workflow.analyze({
    draftId,
    ownerId,
    generationKey: key('openai-multi-screen-failure'),
    images: [
      {
        imageReference: 'listing_image_1_12345678',
        mimeType: 'image/png',
        bytes: await fixtureImage(),
      },
      {
        imageReference: 'listing_image_2_12345678',
        mimeType: 'image/png',
        bytes: await fixtureImage(),
      },
    ],
    consent: consent(),
  });
  assert.equal(result.status, 'manual_fallback');
  assert.equal(result.reasonCode, 'listing_ai_image_visual_screen_failed');
  assert.equal(result.providerCallCount, 2);
  assert.equal(result.paidCallPerformed, true);
  assert.equal(result.estimatedCostCents, null);
  assert.equal(result.billedCostCents, null);
});

test('owner review composes deterministic N5 price, duration and V5.2 preview', async () => {
  const workflow = createBlueOceanListingWorkflow({
    configuration: config(),
    screenImage: async () => ({
      localOcrText: '',
      visualScanCompleted: true,
      visualSignals: [],
    }),
  });
  const generated = await workflow.analyze({
    draftId,
    ownerId,
    generationKey: key('review-source'),
    images: [{
      imageReference: 'listing_image_12345678',
      mimeType: 'image/png',
      bytes: await fixtureImage(),
    }],
    consent: consent(),
  });
  const review = reviewBlueOceanListingDraft({
    previousRevision: generated.revision,
    generationKey: key('review-1'),
    editedFields: editedFields(),
    answeredClarificationIds: generated.revision.clarificationQuestions.map((entry) => entry.id),
    ownerConfirmations: confirmations(),
    pricing: pricing(),
    previewDays: [1, 7],
    imagePreflightPassed: true,
    consentValid: true,
    generatedAt: new Date('2026-08-24T08:00:00.000Z'),
  });
  assert.equal(review.recommendation.engineAuthority, 'SIT_REGIONAL_PRICE_ENGINE_V2');
  assert.equal(review.recommendation.includedObservationCount, 0);
  assert.equal(review.recommendation.syntheticLearningApplied, false);
  assert.equal(review.selection.ownerSelectedDailyMinor, review.recommendation.recommendedDailyMinor);
  assert.equal(review.durationSchedule.tiers.length, 5);
  assert.deepEqual(review.quotePreviews.map((entry) => entry.days), [1, 7]);
  assert.equal(review.quotePreviews[1].simulation, true);
  assert.equal(review.quotePreviews[1].noRealMoney, true);
  assert.equal(review.readiness.previewReady, true);
  assert.equal(review.readiness.readyToPublish, false);
  assert.equal(review.readiness.state, 'NEEDS_REVIEW');
  assert.deepEqual(review.readiness.missingConfirmations, ['final_publication']);
});

test('catalog entries without an exact price rule stay usable without a fabricated recommendation', async (t) => {
  const workflow = createBlueOceanListingWorkflow({
    configuration: config(),
    screenImage: async () => ({
      localOcrText: '',
      visualScanCompleted: true,
      visualSignals: [],
    }),
  });
  const generated = await workflow.analyze({
    draftId,
    ownerId,
    generationKey: key('manual-price-source'),
    images: [{
      imageReference: 'listing_image_12345678',
      mimeType: 'image/png',
      bytes: await fixtureImage(),
    }],
    consent: consent(),
  });

  for (const catalog of [
    { category: 'cat3', subcategory: 'Kameras', title: 'Systemkamera' },
    { category: 'cat20', subcategory: 'Präsentation', title: 'Heimprojektor' },
  ]) {
    await t.test(`${catalog.category}/${catalog.subcategory}`, () => {
      const fields = {
        ...editedFields(),
        title: catalog.title,
        category: catalog.category,
        subcategory: catalog.subcategory,
      };
      const pendingConfirmations = confirmations({ finalPublication: true });
      pendingConfirmations.owner_price = false;
      const pending = reviewBlueOceanListingDraft({
        previousRevision: generated.revision,
        generationKey: key(`manual-price-pending-${catalog.category}`),
        editedFields: fields,
        answeredClarificationIds: generated.revision.clarificationQuestions
          .map((entry) => entry.id),
        ownerConfirmations: pendingConfirmations,
        pricing: pricing(),
        imagePreflightPassed: true,
        consentValid: true,
      });
      assert.equal(pending.priceMode, 'owner_manual_no_recommendation');
      assert.equal(pending.recommendation, null);
      assert.equal(pending.selection.recommendationAvailable, false);
      assert.equal(pending.selection.ownerSelectedDailyMinor, null);
      assert.equal(pending.selection.publicationPriceReady, false);
      assert.equal(pending.durationSchedule, null);
      assert.deepEqual(pending.quotePreviews, []);
      assert.equal(pending.readiness.state, 'NEEDS_REVIEW');
      assert.equal(pending.readiness.ownerPriceConfirmed, false);

      const confirmed = reviewBlueOceanListingDraft({
        previousRevision: generated.revision,
        generationKey: key(`manual-price-confirmed-${catalog.category}`),
        editedFields: fields,
        answeredClarificationIds: generated.revision.clarificationQuestions
          .map((entry) => entry.id),
        ownerConfirmations: confirmations({ finalPublication: true }),
        pricing: pricing(1_600),
        imagePreflightPassed: true,
        consentValid: true,
      });
      assert.equal(confirmed.priceMode, 'owner_manual_no_recommendation');
      assert.equal(confirmed.recommendation, null);
      assert.equal(confirmed.selection.recommendationAvailable, false);
      assert.equal(confirmed.selection.ownerSelectedDailyMinor, 1_600);
      assert.equal(confirmed.selection.publicationPriceReady, true);
      assert.equal(confirmed.quotePreviews.length, 2);
      assert.ok(confirmed.quotePreviews.every(
        (entry) => entry.simulation === true && entry.noRealMoney === true,
      ));
      assert.equal(confirmed.readiness.state, 'READY_TO_PUBLISH');
      assert.equal(
        assertBlueOceanExplicitPublication(confirmed, { explicitOwnerAction: true })
          .ownerDailyPriceMinor,
        1_600,
      );
    });
  }
});

test('every allowed pilot catalog pair has an explicit safe price path', async () => {
  const workflow = createBlueOceanListingWorkflow({
    configuration: config(),
    screenImage: async () => ({
      localOcrText: '',
      visualScanCompleted: true,
      visualSignals: [],
    }),
  });
  const generated = await workflow.analyze({
    draftId,
    ownerId,
    generationKey: key('catalog-matrix-source'),
    images: [{
      imageReference: 'listing_image_12345678',
      mimeType: 'image/png',
      bytes: await fixtureImage(),
    }],
    consent: consent(),
  });

  for (const catalogKey of privatePilotAllowedCatalogKeys) {
    const [category, subcategory] = catalogKey.split('\u001f');
    const review = reviewBlueOceanListingDraft({
      previousRevision: generated.revision,
      generationKey: key(`catalog-matrix-${catalogKey}`),
      editedFields: {
        ...editedFields(),
        category,
        subcategory,
      },
      answeredClarificationIds: generated.revision.clarificationQuestions
        .map((entry) => entry.id),
      ownerConfirmations: confirmations({ finalPublication: true }),
      pricing: pricing(1_600),
      imagePreflightPassed: true,
      consentValid: true,
    });
    const expectedRule = blueOceanRegionalPriceRuleByCatalogKey[catalogKey];
    assert.equal(
      review.priceMode,
      expectedRule == null
        ? 'owner_manual_no_recommendation'
        : 'regional_recommendation',
      catalogKey,
    );
    assert.equal(review.recommendation == null, expectedRule == null, catalogKey);
    if (expectedRule != null) {
      assert.equal(
        review.recommendation.categoryMinimumMinor,
        regionalPriceCategoryRules[expectedRule].minimumMinor,
        catalogKey,
      );
      assert.equal(
        review.recommendation.categoryMaximumMinor,
        regionalPriceCategoryRules[expectedRule].maximumMinor,
        catalogKey,
      );
    }
    assert.equal(review.selection.ownerSelectedDailyMinor, 1_600, catalogKey);
    assert.equal(review.readiness.state, 'READY_TO_PUBLISH', catalogKey);
    assert.equal(
      assertBlueOceanExplicitPublication(review, { explicitOwnerAction: true })
        .ownerDailyPriceMinor,
      1_600,
      catalogKey,
    );
  }
});

test('manual price fallback cannot admit a catalog pair outside the private pilot', async () => {
  const workflow = createBlueOceanListingWorkflow({
    configuration: config(),
    screenImage: async () => ({
      localOcrText: '',
      visualScanCompleted: true,
      visualSignals: [],
    }),
  });
  const generated = await workflow.analyze({
    draftId,
    ownerId,
    generationKey: key('catalog-boundary-source'),
    images: [{
      imageReference: 'listing_image_12345678',
      mimeType: 'image/png',
      bytes: await fixtureImage(),
    }],
    consent: consent(),
  });

  assert.throws(
    () => reviewBlueOceanListingDraft({
      previousRevision: generated.revision,
      generationKey: key('catalog-boundary-review'),
      editedFields: {
        ...editedFields(),
        category: 'cat999',
        subcategory: 'Nicht erlaubt',
      },
      answeredClarificationIds: generated.revision.clarificationQuestions
        .map((entry) => entry.id),
      ownerConfirmations: confirmations({ finalPublication: true }),
      pricing: pricing(1_600),
      imagePreflightPassed: true,
      consentValid: true,
    }),
    (error) => error instanceof BlueOceanListingWorkflowError
      && error.status === 409
      && error.code === 'blue_ocean_catalog_pair_outside_private_pilot',
  );
});

test('READY_TO_PUBLISH still requires the separate exact owner publication action', async () => {
  const workflow = createBlueOceanListingWorkflow({
    configuration: config(),
    screenImage: async () => ({
      localOcrText: '',
      visualScanCompleted: true,
      visualSignals: [],
    }),
  });
  const generated = await workflow.analyze({
    draftId,
    ownerId,
    generationKey: key('publish-source'),
    images: [{
      imageReference: 'listing_image_12345678',
      mimeType: 'image/png',
      bytes: await fixtureImage(),
    }],
    consent: consent(),
  });
  const review = reviewBlueOceanListingDraft({
    previousRevision: generated.revision,
    generationKey: key('publish-review'),
    editedFields: editedFields(),
    answeredClarificationIds: generated.revision.clarificationQuestions.map((entry) => entry.id),
    ownerConfirmations: confirmations({ finalPublication: true }),
    pricing: pricing(1_600),
    imagePreflightPassed: true,
    consentValid: true,
  });
  assert.equal(review.readiness.state, 'READY_TO_PUBLISH');
  assert.throws(
    () => assertBlueOceanExplicitPublication(review, { explicitOwnerAction: false }),
    (error) => error instanceof BlueOceanListingWorkflowError
      && error.code === 'blue_ocean_explicit_publication_required',
  );
  const authorization = assertBlueOceanExplicitPublication(review, {
    explicitOwnerAction: true,
  });
  assert.equal(authorization.authorized, true);
  assert.equal(authorization.ownerDailyPriceMinor, 1_600);
  assert.equal(authorization.publicationAction, 'explicit_owner_action_verified');
  assert.equal(authorization.autoPublishAllowed, false);
});

test('functionality, unanswered questions, price, image and consent remain hard blockers', async () => {
  const workflow = createBlueOceanListingWorkflow({
    configuration: config(),
    screenImage: async () => ({ localOcrText: '', visualScanCompleted: true, visualSignals: [] }),
  });
  const generated = await workflow.analyze({
    draftId,
    ownerId,
    generationKey: key('blocked-source'),
    images: [{ imageReference: 'listing_image_12345678', mimeType: 'image/png', bytes: await fixtureImage() }],
    consent: consent(),
  });
  const blockedConfirmations = confirmations({ finalPublication: true });
  blockedConfirmations.functionality = false;
  blockedConfirmations.owner_price = false;
  const review = reviewBlueOceanListingDraft({
    previousRevision: generated.revision,
    generationKey: key('blocked-review'),
    editedFields: editedFields(),
    answeredClarificationIds: [],
    ownerConfirmations: blockedConfirmations,
    pricing: pricing(),
    imagePreflightPassed: false,
    consentValid: false,
  });
  assert.equal(review.readiness.readyToPublish, false);
  assert.equal(review.readiness.functionalityConfirmed, false);
  assert.equal(review.readiness.ownerPriceConfirmed, false);
  assert.equal(review.readiness.imagePreflightPassed, false);
  assert.equal(review.readiness.consentValid, false);
  assert.equal(review.readiness.unansweredClarifications.length, 2);
});
