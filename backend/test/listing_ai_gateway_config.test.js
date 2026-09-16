import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  listingAiGatewayVersion,
  listingAiMockModel,
  listingAiOnDeviceModel,
  listingAiOpenAiModel,
  ListingAiGatewayConfigurationError,
  readListingAiGatewayConfiguration,
} from '../src/listing_ai_gateway_config.js';

test('listing AI configuration is disabled and zero-cost by default', () => {
  const result = readListingAiGatewayConfiguration();
  assert.equal(result.gatewayVersion, listingAiGatewayVersion);
  assert.equal(result.provider, 'disabled');
  assert.equal(result.enabled, false);
  assert.equal(result.budgetCents, 0);
  assert.equal(result.externalProviderExecutionAllowed, false);
  assert.equal(result.providerToolsAllowed, false);
  assert.equal(result.providerPublicationAllowed, false);
  assert.equal(result.authoritativeProviderPriceAllowed, false);
  assert.equal(result.automaticRetryAllowed, false);
});

test('mock configuration is deterministic, bounded and never billed', () => {
  const result = readListingAiGatewayConfiguration({
    SIT_LISTING_AI_PROVIDER: 'mock',
    SIT_LISTING_AI_MODEL: listingAiMockModel,
    SIT_LISTING_AI_BUDGET_CENTS: '0',
    SIT_LISTING_AI_TIMEOUT_MS: '2500',
    SIT_LISTING_AI_RATE_WINDOW_MS: '60000',
    SIT_LISTING_AI_RATE_MAX_REQUESTS: '3',
  });
  assert.equal(result.enabled, true);
  assert.equal(result.providerExecutionAllowed, true);
  assert.equal(result.externalProviderExecutionAllowed, false);
  assert.equal(result.model, listingAiMockModel);
  assert.equal(result.budgetCents, 0);
  assert.equal(result.timeoutMs, 2500);
  assert.equal(result.rateLimitMaxRequests, 3);
});

test('on-device configuration is bundled, zero-cost and never externally authorized', () => {
  const result = readListingAiGatewayConfiguration({
    SIT_LISTING_AI_PROVIDER: 'on_device',
    SIT_LISTING_AI_MODEL: listingAiOnDeviceModel,
    SIT_LISTING_AI_BUDGET_CENTS: '0',
  }, { deploymentEnvironment: 'staging' });
  assert.equal(result.enabled, true);
  assert.equal(result.providerExecutionAllowed, true);
  assert.equal(result.externalProviderExecutionAllowed, false);
  assert.equal(result.model, listingAiOnDeviceModel);
  assert.equal(result.budgetCents, 0);
  assert.equal(result.providerPublicationAllowed, false);
  assert.equal(result.authoritativeProviderPriceAllowed, false);
});

test('openai execution requires the pinned model, budget and explicit external gate', () => {
  const held = readListingAiGatewayConfiguration({
    SIT_LISTING_AI_PROVIDER: 'openai',
    SIT_LISTING_AI_MODEL: listingAiOpenAiModel,
    SIT_LISTING_AI_BUDGET_CENTS: '5',
  }, { deploymentEnvironment: 'staging' });
  assert.equal(held.enabled, false);
  assert.equal(held.providerExecutionAllowed, false);
  assert.equal(held.externalProviderExecutionAllowed, false);

  const enabled = readListingAiGatewayConfiguration({
    SIT_LISTING_AI_PROVIDER: 'openai',
    SIT_LISTING_AI_MODEL: listingAiOpenAiModel,
    SIT_LISTING_AI_BUDGET_CENTS: '5',
    SIT_LISTING_AI_EXTERNAL_EXECUTION_APPROVED: '1',
  }, { deploymentEnvironment: 'staging' });
  assert.equal(enabled.enabled, true);
  assert.equal(enabled.providerExecutionAllowed, true);
  assert.equal(enabled.externalProviderExecutionAllowed, true);
  assert.equal(enabled.providerPublicationAllowed, false);
  assert.equal(enabled.authoritativeProviderPriceAllowed, false);
  assert.equal(enabled.secretConfiguredInClient, false);
});

test('production, version drift, invalid bounds and non-paid budgets fail closed', () => {
  for (const [env, options, code] of [
    [{ SIT_LISTING_AI_PROVIDER: 'mock' }, { deploymentEnvironment: 'production' }, /cannot be enabled in production/u],
    [{ SIT_LISTING_AI_PROVIDER: 'other' }, {}, /must be disabled, mock, on_device, or openai/u],
    [{ SIT_LISTING_AI_PROMPT_VERSION: 'stale' }, {}, /PROMPT_VERSION is not supported/u],
    [{ SIT_LISTING_AI_SCHEMA_VERSION: 'stale' }, {}, /SCHEMA_VERSION is not supported/u],
    [{ SIT_LISTING_AI_BUDGET_CENTS: '1' }, {}, /non-paid listing AI providers/u],
    [{ SIT_LISTING_AI_PROVIDER: 'mock', SIT_LISTING_AI_MODEL: 'other' }, {}, /mock listing AI/u],
    [{ SIT_LISTING_AI_PROVIDER: 'on_device', SIT_LISTING_AI_MODEL: 'other' }, {}, /on-device listing AI/u],
    [{ SIT_LISTING_AI_PROVIDER: 'openai' }, {}, /MODEL is required/u],
    [{ SIT_LISTING_AI_PROVIDER: 'openai', SIT_LISTING_AI_MODEL: 'floating-model' }, {}, /must use/u],
    [{ SIT_LISTING_AI_EXTERNAL_EXECUTION_APPROVED: 'yes' }, {}, /must be 0 or 1/u],
    [{ SIT_LISTING_AI_EXTERNAL_EXECUTION_APPROVED: '1' }, {}, /requires the openai provider/u],
    [{
      SIT_LISTING_AI_PROVIDER: 'openai',
      SIT_LISTING_AI_MODEL: listingAiOpenAiModel,
      SIT_LISTING_AI_BUDGET_CENTS: '1',
      SIT_LISTING_AI_EXTERNAL_EXECUTION_APPROVED: '1',
    }, {}, /two-cent safety reservation/u],
    [{
      SIT_LISTING_AI_PROVIDER: 'openai',
      SIT_LISTING_AI_MODEL: listingAiOpenAiModel,
      SIT_LISTING_AI_BUDGET_CENTS: '2',
      SIT_LISTING_AI_EXTERNAL_EXECUTION_APPROVED: '1',
    }, { deploymentEnvironment: 'development' }, /restricted to staging or test/u],
    [{ SIT_LISTING_AI_TIMEOUT_MS: '31' }, {}, /TIMEOUT_MS/u],
  ]) {
    assert.throws(
      () => readListingAiGatewayConfiguration(env, options),
      (error) => error instanceof ListingAiGatewayConfigurationError && code.test(error.code),
    );
  }
});

test('backend config consumes the server-only listing AI configuration', () => {
  const source = readFileSync(new URL('../src/config.js', import.meta.url), 'utf8');
  assert.match(source, /readListingAiGatewayConfiguration\(process\.env/u);
  assert.match(source, /listingAi: listingAiGateway/u);
  assert.match(source, /deploymentEnvironment/u);
});
