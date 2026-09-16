#!/usr/bin/env node

import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { readRepositoryFile } from './read_repository_file.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath = 'docs/evidence/blue-ocean/n4-image-privacy-pipeline-20260823.json';

function fail(message) {
  throw new Error(message);
}

function exact(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function allFalse(value) {
  return value && typeof value === 'object'
    && Object.values(value).every((entry) => entry === false);
}

function source(repositoryRoot, path) {
  return readRepositoryFile(repositoryRoot, path, { label: `N4 source ${path}` });
}

function requireMarkers(content, path, markers) {
  for (const marker of markers) {
    if (!content.includes(marker)) fail(`N4 marker missing in ${path}: ${marker}`);
  }
}

export function validateBlueOceanN4ImagePrivacyPipeline({
  repositoryRoot = root,
  evidence,
} = {}) {
  const value = evidence ?? JSON.parse(source(repositoryRoot, evidencePath));
  if (value.schemaVersion !== 1
      || value.kind !== 'sit-stage-a-blue-ocean-n4-image-privacy-pipeline'
      || ![
        'implemented-targeted-tests-passed-full-regression-pending',
        'implemented-full-regression-passed-ci-pending',
        'verified-ready-for-n5',
      ].includes(value.status)
      || value.implementationBaseHead !== '5e44890d81aa7a546c806195f13776e0253517be') {
    fail('N4 evidence identity is invalid.');
  }
  if (!exact(value.pipeline, {
    version: 'N4-2026-08-23.1',
    minimumImageCount: 1,
    maximumImageCount: 4,
    maximumInputBytes: 8 * 1024 * 1024,
    maximumInputPixels: 40_000_000,
    maximumSourceDimension: 12_000,
    maximumAnalysisDimension: 1280,
    analysisMimeType: 'image/webp',
    analysisWebpQuality: 80,
    maximumCleanupTimeoutMs: 10_000,
    safeNamePattern: 'analysis-<opaque-uuid>.webp',
    memoryOnly: true,
    automaticRetryAllowed: false,
  })) {
    fail('N4 derivative pipeline contract is invalid.');
  }
  if (!exact(value.sensitiveContentPreflight, {
    visualSignalTypes: [
      'face',
      'document',
      'address',
      'financial_data',
      'credentials',
      'unrelated_sensitive_material',
    ],
    highConfidenceAction: 'block-replace',
    uncertainAction: 'review-crop-or-replace',
    incompleteVisualScanProviderEligible: false,
    maximumLocalOcrCharacters: 2000,
    rawOcrRetained: false,
    externalScannerUsed: false,
    trustedLocalAdapterRequiredBeforeRoute: true,
  })) {
    fail('N4 sensitive-content preflight contract is invalid.');
  }
  if (!exact(value.privacyAndLifecycle, {
    orientationNormalized: true,
    exifGpsIccIptcXmpRetained: false,
    originalFilenameRetained: false,
    originalBufferModified: false,
    derivativeBytesLogged: false,
    consumerOutputLogged: false,
    cleanupOnSuccess: true,
    cleanupOnBlock: true,
    cleanupOnFailure: true,
    cleanupOnTimeout: true,
    derivativeTerminalState: 'purged',
    normalListingImageRetentionChanged: false,
  })) {
    fail('N4 privacy or lifecycle boundary is invalid.');
  }
  if (!exact(value.consent, {
    version: 'listing-ai-image-disclosure-v1',
    text: 'SIT analysiert deine ausgewählten Bilder mit einem externen KI-Dienst, um einen bearbeitbaren Anzeigenentwurf zu erstellen. Es wird nichts automatisch veröffentlicht.',
    explicitInitiationRequired: true,
    acceptanceRequired: true,
    automaticPublicationAllowed: false,
  })) {
    fail('N4 disclosure and consent contract is invalid.');
  }

  const fullRegressionPassed = value.status !== 'implemented-targeted-tests-passed-full-regression-pending';
  const githubPassed = value.status === 'verified-ready-for-n5';
  const exactGitHubVerification = value.exactGitHubVerification;
  if (githubPassed) {
    if (!exact(exactGitHubVerification, {
      headSha: '129177003447084c1b24bc9ad36d9289a2803535',
      regressionRunId: 32668969157,
      regressionConclusion: 'success',
      codeqlRunId: 32668969147,
      codeqlConclusion: 'success',
    })) {
      fail('N4 exact GitHub verification is invalid.');
    }
  } else if (exactGitHubVerification !== undefined) {
    fail('N4 cannot bind exact GitHub verification before CI is complete.');
  }
  if (!exact(value.targetedVerification, {
    pipelineSyntax: 'passed',
    pipelineTests: 'passed-10',
    artifactValidatorTests: githubPassed ? 'passed-7' : 'passed-6',
    artifactValidator: 'passed',
    backendSuite: fullRegressionPassed ? 'passed-639-one-documented-skip' : 'pending',
    postgres16MigrationIntegration: fullRegressionPassed ? 'passed' : 'pending',
    fullTechnicalRegression: fullRegressionPassed ? 'passed-candidate-rollover-mode' : 'pending',
    githubRegression: githubPassed ? 'passed' : 'pending',
    githubCodeql: githubPassed ? 'passed' : 'pending',
  })) {
    fail('N4 verification record is invalid for its status.');
  }
  if (value.nextPackage !== 'N5' || !allFalse(value.boundaries)) {
    fail('N4 next package or mutation boundary is invalid.');
  }

  const pipelinePath = 'backend/src/listing_ai_image_pipeline.js';
  const pipeline = source(repositoryRoot, pipelinePath);
  requireMarkers(pipeline, pipelinePath, [
    "listingAiImagePipelineVersion = 'N4-2026-08-23.1'",
    "listingAiImageDisclosureVersion = 'listing-ai-image-disclosure-v1'",
    'SIT analysiert deine ausgewählten Bilder mit einem externen KI-Dienst',
    'maximumImageCount = 4',
    'analysisMaximumDimension = 1280',
    'analysisWebpQuality = 80',
    ".webp({ quality: analysisWebpQuality, effort: 4 })",
    'outputMetadata.exif || outputMetadata.gps || outputMetadata.icc',
    "reviewReasonCodes.push('local_visual_screen_incomplete')",
    "userAction: blocked",
    "? 'replace_image'",
    ": (reviewRequired ? 'crop_or_replace_image' : 'none')",
    'derivative.bytes.fill(0)',
    "transition(derivative, 'purged', now)",
    'controller.abort()',
    'providerCallPerformed: derivatives.some((entry) => entry.screeningUsage)',
    'completeDerivativeScreening(screenDerivative, derivative, timeoutMs)',
    "derivative.screening.status === 'blocked'",
    "'listing_ai_image_visual_screen_timeout'",
  ]);
  if (/\bfetch\s*\(|OPENAI_API_KEY|process\.env|originalFilename\s*:/iu.test(pipeline)) {
    fail('N4 pipeline contains a provider/config call or retains an original filename.');
  }
  const app = source(repositoryRoot, 'backend/src/app.js');
  if (/listing_ai_image_pipeline|listing-ai\/images|listing_ai\/images/iu.test(app)) {
    fail('N4 must not expose an application image-analysis route.');
  }
  const regression = source(repositoryRoot, 'scripts/technical_regression_check.sh');
  requireMarkers(regression, 'scripts/technical_regression_check.sh', [
    'node --check tool/validate_blue_ocean_n4_image_privacy_pipeline.mjs',
    'node --test test/tool/validate_blue_ocean_n4_image_privacy_pipeline.test.mjs',
    'node tool/validate_blue_ocean_n4_image_privacy_pipeline.mjs',
  ]);

  const serialized = JSON.stringify(value);
  if (/\/(?:Users|home)\/|password\s*[:=]|secret\s*[:=]|api[_-]?key\s*[:=]|@/iu.test(serialized)) {
    fail('N4 evidence contains private or secret-shaped content.');
  }
  return Object.freeze({
    status: value.status,
    visualSignalTypeCount: value.sensitiveContentPreflight.visualSignalTypes.length,
    nextPackage: value.nextPackage,
  });
}

const isDirectRun = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isDirectRun) {
  try {
    if (process.argv.length > 2) fail(`Unknown argument: ${process.argv[2]}`);
    const result = validateBlueOceanN4ImagePrivacyPipeline();
    process.stdout.write(
      `Blue Ocean N4 image privacy valid: signals=${result.visualSignalTypeCount}, `
      + `status=${result.status}, next=${result.nextPackage}\n`,
    );
  } catch (error) {
    process.stderr.write(`${error?.message ?? 'Blue Ocean N4 validation failed.'}\n`);
    process.exitCode = 1;
  }
}
