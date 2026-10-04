import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

import { createLocalQaSyntheticImageScreeningOptions } from '../src/local_qa_synthetic_image_screening.js';
import { sanitizeImage } from '../src/media_pipeline.js';

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

test('only an exact repository-owned processed synthetic fixture passes', async () => {
  const fixture = await readFile(resolve(
    repositoryRoot,
    'store/assets/synthetic-listings/cordless-drill.png',
  ));
  const processed = await sanitizeImage(fixture);
  const options = createLocalQaSyntheticImageScreeningOptions({
    env: { SIT_LOCAL_QA_SYNTHETIC_IMAGE_SCREENING: 'true' },
    configuration: exactConfiguration,
  });
  const reference = `listing_image_${processed.sha256.slice(0, 32)}`;
  assert.deepEqual(await options.screenBlueOceanListingImage({
    imageReference: reference,
    bytes: processed.full,
    mimeType: processed.mimeType,
  }), {
    localOcrText: '',
    visualScanCompleted: true,
    visualSignals: [],
  });

  const changed = Buffer.from(processed.full);
  changed[changed.length - 1] ^= 1;
  assert.deepEqual(await options.screenBlueOceanListingImage({
    imageReference: reference,
    bytes: changed,
    mimeType: processed.mimeType,
  }), {
    localOcrText: '',
    visualScanCompleted: false,
    visualSignals: [],
  });
});
