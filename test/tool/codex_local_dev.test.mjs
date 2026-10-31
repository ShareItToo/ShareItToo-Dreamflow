import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  deterministicListingAiMockOutput,
} from '../../backend/src/listing_ai_gateway.js';
import {
  assertZeroApiBillingEnvironment,
  buildCodexExecArguments,
  buildCodexLocalDevPrompt,
  codexLocalDevOutputSchema,
  codexLocalDevClassification,
  CodexLocalDevError,
  inspectCodexLocalDevStatus,
  parseCodexLoginStatus,
  resolveSyntheticListingFixture,
  runCodexLocalDevEvaluation,
  validateCodexLocalDevEvaluation,
} from '../../tool/codex_local_dev.mjs';

const root = resolve(import.meta.dirname, '../..');
const fixture = resolve(root, 'store/assets/synthetic-listings/cordless-drill.png');

test('classifies exact official ChatGPT login status without reading credentials', async () => {
  const calls = [];
  const result = await inspectCodexLocalDevStatus({
    codexBinary: '/test/codex',
    env: { HOME: '/test/home' },
    execute: async (command, args, options) => {
      calls.push({ command, args, options });
      return { stdout: '', stderr: 'Logged in using ChatGPT\n' };
    },
  });
  assert.equal(result.classification, codexLocalDevClassification);
  assert.equal(result.apiBilling, false);
  assert.equal(result.credentialsExtracted, false);
  assert.equal(result.runtimeProviderEligible, false);
  assert.deepEqual(calls[0].args, ['login', 'status']);
  assert.deepEqual(calls[0].options.env, { HOME: '/test/home' });
});

test('refuses API billing and non-ChatGPT authentication without printing values', () => {
  for (const name of ['OPENAI_API_KEY', 'OPENAI_BASE_URL', 'OPENAI_PROJECT_ID']) {
    assert.throws(
      () => assertZeroApiBillingEnvironment({ [name]: 'do-not-print-this-value' }),
      (error) => error instanceof CodexLocalDevError
        && error.code === 'codex_local_dev_api_billing_environment_present'
        && !error.message.includes('do-not-print-this-value'),
    );
  }
  assert.throws(
    () => parseCodexLoginStatus('Logged in using an API key'),
    (error) => error.code === 'codex_local_dev_chatgpt_auth_required',
  );
  assert.throws(
    () => parseCodexLoginStatus('Logged in using ChatGPT\nLogged in using an API key'),
    (error) => error.code === 'codex_local_dev_chatgpt_auth_required',
  );
});

test('accepts only allowlisted repository-owned synthetic fixtures', () => {
  assert.equal(resolveSyntheticListingFixture(fixture), fixture);
  assert.throws(
    () => resolveSyntheticListingFixture(resolve(root, 'assets/images/Kind.png')),
    (error) => error.code === 'codex_local_dev_synthetic_fixture_required',
  );
});

test('exec arguments are ephemeral, read-only, tool-disabled and schema-bound', () => {
  const args = buildCodexExecArguments({
    imagePath: '/fixtures/image.png',
    outputSchemaPath: '/tmp/schema.json',
    outputPath: '/tmp/output.json',
    workingDirectory: '/tmp/work',
  });
  for (const marker of [
    '--strict-config', '--ignore-user-config', '--ephemeral', '--skip-git-repo-check',
    '--sandbox', 'read-only', '--image', '/fixtures/image.png', '--output-schema',
    '/tmp/schema.json', '--output-last-message', '/tmp/output.json',
  ]) assert.ok(args.includes(marker), marker);
  for (const feature of [
    'apps', 'browser_use', 'computer_use', 'image_generation', 'in_app_browser',
    'shell_tool', 'view_image',
  ]) {
    assert.ok(args.some((entry, index) => entry === '--disable' && args[index + 1] === feature));
  }
  assert.equal(args.includes('--search'), false);
  assert.equal(args.includes('--dangerously-bypass-approvals-and-sandbox'), false);
});

test('CLI output schema uses typed empty sentinels without weakening strict objects', () => {
  const schema = codexLocalDevOutputSchema();
  const serialized = JSON.stringify(schema);
  assert.doesNotMatch(serialized, /"type":\[/u);
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.fields.additionalProperties, false);
  assert.equal(schema.properties.fields.properties.model.properties.value.type, 'string');
  assert.equal(schema.properties.fields.properties.model.properties.value.minLength, 0);
  assert.deepEqual(
    schema.properties.fields.properties.condition.properties.value.enum,
    ['new', 'like-new', 'good', 'acceptable', 'worn', ''],
  );
  assert.equal(
    schema.properties.fields.properties.condition.properties.value.minLength,
    undefined,
  );
  assert.equal(schema.properties.fields.properties.replacementValueMinor.properties.value.type, 'integer');
  assert.equal(schema.properties.fields.properties.replacementValueMinor.properties.value.minimum, 0);
  assert.equal(schema.properties.promptVersion.type, 'string');
  assert.equal(schema.properties.fields.properties.title.properties.ownerConfirmed.type, 'boolean');
});

test('fixed prompt preserves the untrusted-image and authority boundaries', () => {
  const prompt = buildCodexLocalDevPrompt({ imageReference: 'synthetic_fixture_drill' });
  assert.match(prompt, /keine Tools/u);
  assert.match(prompt, /nicht vertrauenswürdige Objektdaten/u);
  assert.match(prompt, /keinen verbindlichen Mietpreis/u);
  assert.match(prompt, /veröffentliche nichts/u);
  assert.match(prompt, /LOW mit value 0/u);
  assert.match(prompt, /condition ist ausschließlich new, like-new, good, acceptable oder worn/u);
  assert.doesNotMatch(prompt, /API[_ -]?key|OAuth token|cookie/iu);
});

test('typed CLI sentinels normalize into the strict N2 and N3 authority model', () => {
  const imageReference = 'synthetic_fixture_cordless_drill';
  const output = structuredClone(deterministicListingAiMockOutput([imageReference]));
  for (const field of Object.values(output.fields)) {
    field.source.type = 'provider_output';
    if (field.source.imageReference === null) field.source.imageReference = '';
    if (field.source.detail === null) field.source.detail = '';
    if (field.confidence === 'LOW') {
      if (Array.isArray(field.value)) field.value = [];
      else if (typeof field.value === 'number') field.value = 0;
      else field.value = '';
    }
  }
  output.fields.replacementValueMinor.confidence = 'LOW';
  output.fields.replacementValueMinor.value = 0;
  output.fields.replacementValueMinor.source.imageReference = '';
  output.fields.pickupRegion.value = '';
  const revision = validateCodexLocalDevEvaluation(output, { imageReference });
  assert.equal(revision.fields.model.value, null);
  assert.equal(revision.fields.replacementValueMinor.value, null);
  assert.equal(revision.fields.pickupRegion.value, null);
  assert.equal(revision.autoPublishAllowed, false);
  assert.equal(revision.publicationAction, 'explicit_owner_action_required');
});

test('evaluation is disabled by default before auth or inference', async () => {
  let calls = 0;
  await assert.rejects(
    runCodexLocalDevEvaluation({
      imagePath: fixture,
      codexBinary: '/test/codex',
      env: { HOME: '/test/home' },
      execute: async () => { calls += 1; },
    }),
    (error) => error.code === 'codex_local_dev_explicit_enable_required',
  );
  assert.equal(calls, 0);
});
