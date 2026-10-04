import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { chmod, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  buildListingAiProviderRequest,
  deterministicListingAiMockOutput,
  ListingAiGatewayError,
  listingAiProviderResponseSchema,
} from '../src/listing_ai_gateway.js';
import {
  listingAiOpenAiModel,
  readListingAiGatewayConfiguration,
} from '../src/listing_ai_gateway_config.js';
import {
  createOpenAiListingAiProvider,
  readOpenAiListingAiApiKey,
} from '../src/openai_listing_ai_provider.js';

const secretFixture = `sk-test-${'x'.repeat(32)}`;
const imageReference = 'analysis_image_00000001';

function configuration(budgetCents = 5) {
  return readListingAiGatewayConfiguration({
    SIT_LISTING_AI_PROVIDER: 'openai',
    SIT_LISTING_AI_MODEL: listingAiOpenAiModel,
    SIT_LISTING_AI_BUDGET_CENTS: String(budgetCents),
    SIT_LISTING_AI_EXTERNAL_EXECUTION_APPROVED: '1',
  }, { deploymentEnvironment: 'staging' });
}

function derivative() {
  return {
    imageReference,
    mimeType: 'image/webp',
    bytes: Buffer.from('safe-stripped-webp-fixture'),
  };
}

function apiResponse(output, usage = { input_tokens: 100, output_tokens: 50 }) {
  return {
    ok: true,
    status: 200,
    async json() {
      return {
        status: 'completed',
        output: [{
          type: 'message',
          content: [{ type: 'output_text', text: JSON.stringify(output) }],
        }],
        usage,
      };
    },
  };
}

function providerOutput() {
  const output = structuredClone(deterministicListingAiMockOutput([imageReference]));
  for (const field of Object.values(output.fields)) field.source.type = 'provider_output';
  return output;
}

function request() {
  return buildListingAiProviderRequest({
    draftId: 'listing_ai_draft_12345678-1234-4123-8123-123456789abc',
    ownerId: 'owner_12345678',
    generationKey: crypto.createHash('sha256').update('openai-test').digest('hex'),
    revision: 1,
    imageReferences: [imageReference],
    untrustedOcr: [],
    manualInputPresent: true,
  }, configuration());
}

test('OpenAI listing-AI credential loader supports an exact private file without fallback leakage', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'sit-openai-provider-secret-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const secretPath = join(directory, 'openai-api-key');
  const linkPath = join(directory, 'openai-api-key-link');
  await writeFile(secretPath, `${secretFixture}\n`, { mode: 0o600 });
  await chmod(secretPath, 0o600);

  assert.equal(
    readOpenAiListingAiApiKey({ OPENAI_API_KEY_FILE: secretPath }),
    secretFixture,
  );
  assert.throws(
    () => readOpenAiListingAiApiKey({
      OPENAI_API_KEY: secretFixture,
      OPENAI_API_KEY_FILE: secretPath,
    }),
    (error) => error instanceof ListingAiGatewayError
      && error.code === 'listing_ai_provider_credentials_conflicting',
  );

  await symlink(secretPath, linkPath);
  assert.throws(
    () => readOpenAiListingAiApiKey({ OPENAI_API_KEY_FILE: linkPath }),
    (error) => error instanceof ListingAiGatewayError
      && error.code === 'listing_ai_provider_credentials_unavailable',
  );
  assert.throws(
    () => readOpenAiListingAiApiKey({ OPENAI_API_KEY_FILE: 'relative-secret' }),
    (error) => error instanceof ListingAiGatewayError
      && error.code === 'listing_ai_provider_credentials_unavailable',
  );
});

test('openai adapter sends stripped data URLs with strict schemas and no tools or storage', async () => {
  const calls = [];
  const outputs = [
    { visualScanCompleted: true, visualSignals: [] },
    providerOutput(),
  ];
  const provider = createOpenAiListingAiProvider({
    configuration: configuration(),
    apiKey: secretFixture,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return apiResponse(outputs.shift());
    },
  });
  const image = derivative();
  const screening = await provider.screenDerivative(image);
  const result = await provider.generate(request(), { analysisImages: [image] });

  assert.equal(screening.visualScanCompleted, true);
  assert.deepEqual(screening.visualSignals, []);
  assert.equal(result.output.fields.title.source.type, 'provider_output');
  assert.equal(result.usage.estimatedCostCents, 1);
  assert.equal(result.usage.billedCostCents, null);
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.equal(call.url, 'https://api.openai.com/v1/responses');
    const body = JSON.parse(call.options.body);
    assert.equal(body.model, listingAiOpenAiModel);
    assert.equal(body.store, false);
    assert.equal(body.text.format.type, 'json_schema');
    assert.equal(body.text.format.strict, true);
    assert.equal('tools' in body, false);
    assert.match(call.options.body, /data:image\/webp;base64,/u);
    assert.equal(call.options.body.includes(secretFixture), false);
  }
});

test('openai adapter fails closed on credentials, HTTP errors and process budget exhaustion', async () => {
  assert.throws(
    () => createOpenAiListingAiProvider({
      configuration: configuration(),
      apiKey: 'short',
    }),
    (error) => error instanceof ListingAiGatewayError
      && error.code === 'listing_ai_provider_credentials_unavailable',
  );

  const failed = createOpenAiListingAiProvider({
    configuration: configuration(),
    apiKey: secretFixture,
    fetchImpl: async () => ({ ok: false, status: 500 }),
  });
  await assert.rejects(
    failed.screenDerivative(derivative()),
    (error) => error instanceof ListingAiGatewayError
      && error.code === 'listing_ai_provider_http_failed',
  );

  let calls = 0;
  const bounded = createOpenAiListingAiProvider({
    configuration: configuration(2),
    apiKey: secretFixture,
    fetchImpl: async () => {
      calls += 1;
      return apiResponse({ visualScanCompleted: true, visualSignals: [] });
    },
  });
  await bounded.screenDerivative(derivative());
  await assert.rejects(
    bounded.screenDerivative(derivative()),
    (error) => error instanceof ListingAiGatewayError
      && error.code === 'listing_ai_budget_exhausted'
      && error.details.providerCallCount === 0,
  );
  assert.equal(calls, 1);
});

test('openai adapter reduces refusal and malformed responses to typed safe errors', async () => {
  const refusal = createOpenAiListingAiProvider({
    configuration: configuration(),
    apiKey: secretFixture,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      async json() {
        return {
          status: 'completed',
          output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'private detail' }] }],
          usage: { input_tokens: 10, output_tokens: 1 },
        };
      },
    }),
  });
  await assert.rejects(
    refusal.screenDerivative(derivative()),
    (error) => error instanceof ListingAiGatewayError
      && error.code === 'listing_ai_provider_refused'
      && !error.message.includes('private detail'),
  );
});

test('openai adapter accepts only completed response envelopes, even with valid draft text', async (t) => {
  for (const status of ['failed', 'cancelled', 'queued', 'in_progress', 'incomplete', undefined, 'unknown']) {
    await t.test(String(status), async () => {
      const provider = createOpenAiListingAiProvider({
        configuration: configuration(),
        apiKey: secretFixture,
        fetchImpl: async () => {
          const response = apiResponse(providerOutput());
          const body = await response.json();
          body.status = status;
          return { ...response, json: async () => body };
        },
      });
      await assert.rejects(
        provider.generate(request(), { analysisImages: [derivative()] }),
        (error) => error instanceof ListingAiGatewayError
          && error.code === (status === 'incomplete'
            ? 'listing_ai_provider_incomplete'
            : 'listing_ai_provider_not_completed')
          && error.details.providerCallCount === 1,
      );
    });
  }
});

test('openai adapter never lets convenience output text override an explicit refusal', async () => {
  const provider = createOpenAiListingAiProvider({
    configuration: configuration(),
    apiKey: secretFixture,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'completed',
        output_text: JSON.stringify({ visualScanCompleted: true, visualSignals: [] }),
        output: [{
          type: 'message',
          content: [{ type: 'refusal', refusal: 'private refusal detail' }],
        }],
        usage: { input_tokens: 10, output_tokens: 1 },
      }),
    }),
  });
  await assert.rejects(
    provider.screenDerivative(derivative()),
    (error) => error instanceof ListingAiGatewayError
      && error.code === 'listing_ai_provider_refused'
      && error.details.providerCallCount === 1
      && !error.message.includes('private refusal detail'),
  );
});

test('openai adapter explicitly types every schema constant without changing domain constraints', async () => {
  const sentFormats = [];
  const domainBefore = JSON.stringify(listingAiProviderResponseSchema);
  const provider = createOpenAiListingAiProvider({
    configuration: configuration(),
    apiKey: secretFixture,
    fetchImpl: async (_url, options) => {
      sentFormats.push(JSON.parse(options.body).text.format);
      return apiResponse(sentFormats.length === 1
        ? { visualScanCompleted: true, visualSignals: [] }
        : providerOutput());
    },
  });
  await provider.screenDerivative(derivative());
  await provider.generate(request(), { analysisImages: [derivative()] });

  const assertTypedConstants = (value) => {
    if (!value || typeof value !== 'object') return;
    if (Object.hasOwn(value, 'const')) assert.equal(value.type, typeof value.const);
    for (const child of Object.values(value)) assertTypedConstants(child);
  };
  for (const format of sentFormats) assertTypedConstants(format.schema);
  assert.equal(JSON.stringify(listingAiProviderResponseSchema), domainBefore);
  const draftSchema = sentFormats[1].schema;
  assert.equal(draftSchema.properties.promptVersion.const,
    listingAiProviderResponseSchema.schema.properties.promptVersion.const);
  assert.equal(draftSchema.properties.schemaVersion.const,
    listingAiProviderResponseSchema.schema.properties.schemaVersion.const);
  for (const field of Object.values(draftSchema.properties.fields.properties)) {
    assert.deepEqual(field.properties.source.properties.type, {
      type: 'string', const: 'provider_output',
    });
    assert.deepEqual(field.properties.ownerConfirmed, { type: 'boolean', const: false });
  }
});
