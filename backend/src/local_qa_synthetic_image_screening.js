import crypto from 'node:crypto';

const enableVariable = 'SIT_LOCAL_QA_SYNTHETIC_IMAGE_SCREENING';
const allowedSyntheticImageDigests = new Set([
  '223bbfac6a11aaa18d380dea1c20fc78820524be0894db718507ab674acf62c6',
  '022d0bc8c95056439403ed2f3e0357725e1052d8057c9077b8cc141b86573096',
  '92fd204488687763e2561cfc2570cdb594ad3125c668eb91b92442fd0318a9a4',
  '2ae98f25d1feea2ee5990869d920c400cb3ce071a49f3a4b62a33b3d784c0e56',
  // cordless-drill.png after Android image_picker quality=85/maxWidth=1600
  // and the backend's metadata-stripping WebP pipeline on the R3 Pixel route.
  'c8d8d316b3e317609370e4ec9cd6b2b56be9365536661c8b16d01ba5465c2b5a',
]);

function incompleteScreening() {
  return Object.freeze({
    localOcrText: '',
    visualScanCompleted: false,
    visualSignals: Object.freeze([]),
  });
}

function completeSyntheticScreening() {
  return Object.freeze({
    localOcrText: '',
    visualScanCompleted: true,
    visualSignals: Object.freeze([]),
  });
}

function assertLocalQaBoundary(configuration) {
  if (configuration?.deploymentEnvironment !== 'test'
      || configuration?.bindHost !== '127.0.0.1'
      || configuration?.listingAi?.provider !== 'mock'
      || configuration?.listingAi?.budgetCents !== 0
      || configuration?.listingAi?.externalProviderExecutionAllowed !== false
      || configuration?.listingAi?.providerPublicationAllowed !== false
      || configuration?.payments?.transport !== 'memory'
      || configuration?.payments?.livemode !== false
      || configuration?.publicCompliance?.approved !== false) {
    throw new Error('local QA synthetic image screening requires the exact non-live boundary');
  }
}

export function createLocalQaSyntheticImageScreeningOptions({
  env = process.env,
  configuration,
} = {}) {
  const mode = String(env[enableVariable] ?? 'false').trim().toLowerCase();
  if (!['false', 'true'].includes(mode)) {
    throw new Error(`${enableVariable} must be true or false`);
  }
  if (mode === 'false') return Object.freeze({});
  assertLocalQaBoundary(configuration);

  return Object.freeze({
    screenBlueOceanListingImage: async ({ imageReference, bytes, mimeType }) => {
      if (!Buffer.isBuffer(bytes) || mimeType !== 'image/webp') {
        return incompleteScreening();
      }
      const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
      const expectedReference = `listing_image_${sha256.slice(0, 32)}`;
      if (imageReference !== expectedReference
          || !allowedSyntheticImageDigests.has(sha256)) {
        return incompleteScreening();
      }
      return completeSyntheticScreening();
    },
  });
}
