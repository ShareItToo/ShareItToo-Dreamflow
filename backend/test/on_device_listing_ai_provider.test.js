import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';

import { createListingAiGateway } from '../src/listing_ai_gateway.js';
import {
  listingAiOnDeviceModel,
  readListingAiGatewayConfiguration,
} from '../src/listing_ai_gateway_config.js';

const imageReference = 'listing_image_12345678';

function configuration() {
  return readListingAiGatewayConfiguration({
    SIT_LISTING_AI_PROVIDER: 'on_device',
    SIT_LISTING_AI_MODEL: listingAiOnDeviceModel,
    SIT_LISTING_AI_BUDGET_CENTS: '0',
  }, { deploymentEnvironment: 'staging' });
}

function input(overrides = {}) {
  return {
    draftId: 'listing_ai_draft_12345678-1234-4123-8123-123456789abc',
    ownerId: 'owner_12345678',
    generationKey: crypto.createHash('sha256').update('on-device').digest('hex'),
    revision: 1,
    imageReferences: [imageReference],
    untrustedOcr: [{ imageReference, text: 'Bosch GSR18V' }],
    manualInputPresent: true,
    onDeviceObservations: [{
      imageReference,
      modelVersion: listingAiOnDeviceModel,
      labels: [{ text: 'Power drill', confidence: 0.93, index: 42 }],
      ocrText: 'Bosch GSR18V',
    }],
    ...overrides,
  };
}

test('real on-device observations create only an editable zero-cost draft', async () => {
  const events = [];
  const gateway = createListingAiGateway({
    configuration: configuration(),
    audit: (event) => events.push(event),
  });
  const result = await gateway.generate(input());

  assert.equal(result.status, 'draft_ready');
  assert.equal(result.provider, 'on_device');
  assert.equal(result.model, listingAiOnDeviceModel);
  assert.equal(result.paidCallPerformed, false);
  assert.equal(result.estimatedCostCents, 0);
  assert.equal(result.billedCostCents, 0);
  assert.equal(result.autoPublishAllowed, false);
  assert.equal(result.authoritativePriceCreated, false);
  assert.equal(result.revision.generationMode, 'provider');
  assert.equal(result.revision.fields.title.value, 'Bosch GSR18V Bohrmaschine');
  assert.equal(result.revision.fields.category.value, 'cat8');
  assert.equal(result.revision.fields.subcategory.value, 'Bohrmaschinen');
  assert.equal(result.revision.fields.condition.value, null);
  assert.equal(result.revision.fields.replacementValueMinor.value, null);
  assert.equal(result.revision.fields.title.source.type, 'provider_output');
  assert.equal(result.revision.ownerConfirmations.item_identity, false);
  assert.equal(events.length, 1);
  assert.equal(events[0].outcome, 'succeeded');
  assert.doesNotMatch(JSON.stringify(events), /Bosch|GSR18V|Power drill/u);
});

test('unknown images ask for owner input instead of inventing identity or price', async () => {
  const gateway = createListingAiGateway({ configuration: configuration() });
  const result = await gateway.generate(input({
    generationKey: crypto.createHash('sha256').update('unknown').digest('hex'),
    untrustedOcr: [],
    onDeviceObservations: [{
      imageReference,
      modelVersion: listingAiOnDeviceModel,
      labels: [{ text: 'Indoor object', confidence: 0.82, index: 4 }],
      ocrText: '',
    }],
  }));

  assert.equal(result.status, 'draft_ready');
  assert.equal(result.revision.fields.title.value, null);
  assert.equal(result.revision.fields.category.value, null);
  assert.equal(result.revision.fields.subcategory.value, null);
  assert.equal(result.revision.fields.replacementValueMinor.value, null);
  assert.equal(result.revision.clarificationQuestions.length, 3);
  assert.equal(result.revision.clarificationQuestions[0].field, 'category');
});

test('model drift, malformed labels and observations on other providers fail closed', async () => {
  const gateway = createListingAiGateway({ configuration: configuration() });
  for (const observations of [
    [],
    [{
      imageReference,
      modelVersion: 'stale-model',
      labels: [],
      ocrText: '',
    }],
    [{
      imageReference,
      modelVersion: listingAiOnDeviceModel,
      labels: [{ text: 'Drill', confidence: 2, index: 1 }],
      ocrText: '',
    }],
  ]) {
    await assert.rejects(
      gateway.generate(input({
        generationKey: crypto.randomBytes(32).toString('hex'),
        onDeviceObservations: observations,
      })),
      /listing_ai_on_device_(?:observations|observation|label)_invalid/u,
    );
  }

  const mock = createListingAiGateway({
    configuration: readListingAiGatewayConfiguration({
      SIT_LISTING_AI_PROVIDER: 'mock',
      SIT_LISTING_AI_BUDGET_CENTS: '0',
    }),
  });
  await assert.rejects(
    mock.generate(input()),
    /listing_ai_on_device_observations_not_allowed/u,
  );
});

test('on-device provider cannot report nonzero use or cost', async () => {
  const gateway = createListingAiGateway({
    configuration: configuration(),
    providers: {
      on_device: {
        async generate(request) {
          const real = await (await import('../src/on_device_listing_ai_provider.js'))
            .createOnDeviceListingAiProvider().generate(request);
          return {
            output: real.output,
            usage: {
              inputUnits: 1,
              outputUnits: 0,
              estimatedCostCents: 0,
              billedCostCents: 0,
            },
          };
        },
      },
    },
  });
  const result = await gateway.generate(input({
    generationKey: crypto.createHash('sha256').update('cost-drift').digest('hex'),
  }));
  assert.equal(result.status, 'manual_fallback');
  assert.equal(result.reasonCode, 'listing_ai_on_device_cost_violation');
  assert.equal(result.autoPublishAllowed, false);
});
