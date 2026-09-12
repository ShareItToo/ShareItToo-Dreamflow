import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

import { createLocalQaSyntheticImageScreeningOptions } from '../src/local_qa_synthetic_image_screening.js';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const exactConfiguration = Object.freeze({
  deploymentEnvironment: 'test',
  bindHost: '127.0.0.1',
  listingAi: Object.freeze({
    provider: 'mock',
    budgetCents: 0,
    externalProviderExecutionAllowed: false,
    providerPublicationAllowed: false,
  }),
  payments: Object.freeze({ transport: 'memory', livemode: false }),
  publicCompliance: Object.freeze({ approved: false }),
});

test('local QA synthetic screening is disabled by default', () => {
  assert.deepEqual(
    createLocalQaSyntheticImageScreeningOptions({
      env: {},
      configuration: exactConfiguration,
    }),
    {},
  );
});

test('local QA synthetic screening requires every non-live boundary', () => {
  for (const changed of [
    { deploymentEnvironment: 'production' },
    { bindHost: '0.0.0.0' },
    { listingAi: { ...exactConfiguration.listingAi, provider: 'openai' } },
    { listingAi: { ...exactConfiguration.listingAi, budgetCents: 1 } },
    { payments: { transport: 'stripe', livemode: false } },
    { payments: { transport: 'memory', livemode: true } },
    { publicCompliance: { approved: true } },
  ]) {
    assert.throws(
      () => createLocalQaSyntheticImageScreeningOptions({
        env: { SIT_LOCAL_QA_SYNTHETIC_IMAGE_SCREENING: 'true' },
        configuration: { ...exactConfiguration, ...changed },
      }),
      /exact non-live boundary/u,
    );
  }
});

test('arbitrary bytes cannot satisfy the exact synthetic fixture allowlist', async () => {
  const options = createLocalQaSyntheticImageScreeningOptions({
    env: { SIT_LOCAL_QA_SYNTHETIC_IMAGE_SCREENING: 'true' },
    configuration: exactConfiguration,
  });
  const changed = Buffer.from('repository-owned-fixture-name-is-not-enough');
  assert.deepEqual(await options.screenBlueOceanListingImage({
    imageReference: 'listing_image_00000000000000000000000000000000',
    bytes: changed,
    mimeType: 'image/webp',
  }), {
    localOcrText: '',
    visualScanCompleted: false,
    visualSignals: [],
  });
});

test('physical Pixel derivation is pinned to the observed exact digest', async () => {
  const source = await readFile(resolve(
    repositoryRoot,
    'backend/src/local_qa_synthetic_image_screening.js',
  ), 'utf8');
  assert.match(
    source,
    /c8d8d316b3e317609370e4ec9cd6b2b56be9365536661c8b16d01ba5465c2b5/u,
  );
  assert.match(source, /Android image_picker quality=85\/maxWidth=1600/u);
});
