import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ListingAiAssistError,
  createListingAiAssistService,
  normalizeListingAiPriceRequest,
} from '../src/listing_ai_assist.js';

const configuration = Object.freeze({
  provider: 'on_device',
  model: 'on-device-rules-v1',
});

const input = Object.freeze({
  title: 'Bohrmaschine',
  description: 'Akku und Koffer',
  category: 'Werkzeuge',
  condition: 'good',
  location: 'Leipzig',
  strategy: 'quick',
});

test('normalizes the typed owner price shape and rejects JSON-in-string/surplus fields', () => {
  assert.equal(normalizeListingAiPriceRequest(input).title, 'Bohrmaschine');
  assert.throws(
    () => normalizeListingAiPriceRequest(JSON.stringify(input)),
    (error) => error instanceof ListingAiAssistError
      && error.status === 400
      && error.code === 'listing_ai_assist_price_input_shape',
  );
  assert.throws(
    () => normalizeListingAiPriceRequest({ ...input, operation: 'price' }),
    /listing_ai_assist_price_input_shape/u,
  );
});

test('owner service requires identity and returns truthful bounded rules', async () => {
  const service = createListingAiAssistService({ configuration });
  await assert.rejects(
    () => service.price(input),
    (error) => error instanceof ListingAiAssistError
      && error.status === 401
      && error.code === 'authentication_required',
  );
  const result = await service.price(input, { ownerId: 'owner-a' });
  assert.equal(result.operation, 'price');
  assert.equal(result.source, 'server_rules');
  assert.equal(result.providerExecuted, false);
  assert.ok(result.dailyPriceMin <= result.dailyPriceMax);
});
