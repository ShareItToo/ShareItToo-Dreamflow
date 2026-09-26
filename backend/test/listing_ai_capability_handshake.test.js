import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';

import {
  listingAiCapability,
  listingAiImageLimit,
  listingAiOpenAiModel,
  readListingAiGatewayConfiguration,
} from '../src/listing_ai_gateway_config.js';
import { listingAiAttemptHashes } from '../src/listing_ai_attempt_workflow.js';

function configFor(provider) {
  const env = {
    SIT_LISTING_AI_PROVIDER: provider,
    SIT_LISTING_AI_BUDGET_CENTS: provider === 'openai' ? '5' : '0',
  };
  if (provider === 'openai') {
    env.SIT_LISTING_AI_MODEL = listingAiOpenAiModel;
    env.SIT_LISTING_AI_EXTERNAL_EXECUTION_APPROVED = '1';
  }
  return readListingAiGatewayConfiguration(env, { deploymentEnvironment: 'staging' });
}

test('capability handshake exposes exact provider mode disclosure and private cache contract', () => {
  const onDevice = listingAiCapability(configFor('on_device'));
  assert.equal(onDevice.available, true);
  assert.equal(onDevice.provider, 'on_device');
  assert.equal(onDevice.mode, 'on_device');
  assert.equal(onDevice.imageLimit, listingAiImageLimit);
  assert.equal(
    onDevice.disclosureHash,
    crypto.createHash('sha256').update(onDevice.disclosureText, 'utf8').digest('hex'),
  );

  const openAi = listingAiCapability(configFor('openai'));
  assert.equal(openAi.mode, 'external');
  assert.match(openAi.disclosureText, /OpenAI Responses API/u);
  assert.match(openAi.disclosureText, /store:false/u);
  assert.match(openAi.disclosureText, /strukturiertes Ergebnis/u);
  assert.doesNotMatch(openAi.disclosureText, /ZDR|Zero Data Retention ohne Einschränkung/u);

  const disabled = listingAiCapability(readListingAiGatewayConfiguration());
  assert.equal(disabled.available, false);
  assert.equal(disabled.mode, 'disabled');
  assert.match(disabled.disclosureText, /deaktiviert/u);
});

test('capability handshake participates in the reservation request hash', () => {
  const base = {
    draftId: 'listing_ai_draft_00000000-0000-4000-8000-000000000001',
    ownerId: 'user_12345678',
    generationKey: 'a'.repeat(64),
    model: listingAiOpenAiModel,
    consent: { accepted: true, disclosureVersion: 'v1' },
    images: [{ imageReference: 'image_12345678', sha256: 'b'.repeat(64), byteSize: 12 }],
    maxCostCents: 2,
  };
  const first = listingAiAttemptHashes({
    ...base,
    capabilityHandshake: { configRevision: 'N3-1', disclosureHash: 'c'.repeat(64) },
  });
  const stale = listingAiAttemptHashes({
    ...base,
    capabilityHandshake: { configRevision: 'N3-2', disclosureHash: 'd'.repeat(64) },
  });
  assert.notEqual(first.requestSha256, stale.requestSha256);
  assert.notEqual(first.payloadSha256, stale.payloadSha256);
});

test('effective configuration changes produce a new config revision', () => {
  const defaultConfig = listingAiCapability(configFor('on_device'));
  const slower = readListingAiGatewayConfiguration({
    SIT_LISTING_AI_PROVIDER: 'on_device',
    SIT_LISTING_AI_TIMEOUT_MS: '12000',
  }, { deploymentEnvironment: 'staging' });
  const changed = listingAiCapability(slower);
  assert.notEqual(defaultConfig.configRevision, changed.configRevision);
});
