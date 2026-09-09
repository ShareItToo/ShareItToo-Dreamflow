#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const expectedSources = Object.freeze({
  'backend/src/openai_listing_ai_provider.js': '95287eaf41efadf048e0b48bfb4c45c2b2d70552f67abed4f7f8a3f1f738e426',
  'backend/src/app.js': '3a30a389612dddf4b5d636d9da2eaa35451596e7dac3add80c5f0a192badce55',
  'backend/compose.staging.listing-ai.yml': '65a3f228a2e7e66fe518470369f554439dae8d078b11b0649a83acabb53c1be1',
  'backend/ops/validate_openai_staging_secret.mjs': 'c71dc3986145dee854fa87274afb28c3b154e8bec85662536196161e0705409a',
  'backend/ops/deploy_release.sh': '7b0958cba5d2169da3283e214630ddd55bba882eefb726aa6895b917b94ee477',
  '.github/workflows/regression.yml': 'a7a67ea69180a854dc0fa98d82aee24f676613520e45e66b1e145e8e0a172b2a',
  'tool/validate_support_launch_content.mjs': '9d6ed4cc88c0f7945bbf9441baa7934472b2e41b81718fcc75cae9a10eca9c10',
});

function fail(message) {
  throw new Error(message);
}

function same(actual, expected, label) {
  if (actual !== expected) fail(`${label} is not the reviewed N17 value.`);
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function isCommit(value) {
  return typeof value === 'string' && /^[0-9a-f]{40}$/u.test(value);
}

export function validateN17StagingListingAiActivationReadiness(evidence, {
  repositoryRoot = fileURLToPath(new URL('../', import.meta.url)),
} = {}) {
  same(evidence?.schemaVersion, 1, 'schemaVersion');
  same(evidence?.kind, 'sit-n17-staging-listing-ai-activation-readiness', 'kind');
  same(evidence?.status, 'prepared-provider-owner-gate-pending', 'status');
  same(evidence?.observedAt, '2026-09-03', 'observation date');
  same(evidence?.preparedFromCommit, '96f688569e9e04da50aa8402550910f8b428b4e3', 'prepared-from commit');
  if (evidence?.implementationCommit !== null && !isCommit(evidence.implementationCommit)) {
    fail('implementationCommit must be null or an exact commit.');
  }

  for (const [key, expected] of Object.entries({
    environment: 'staging',
    provider: 'mock',
    budgetCents: 0,
    externalProviderExecutionAllowed: false,
    externalProviderCallMade: false,
    deploymentChanged: false,
  })) same(evidence?.currentRuntime?.[key], expected, `current runtime ${key}`);

  for (const [key, expected] of Object.entries({
    enabledByDefault: false,
    allowedEnvironment: 'staging',
    requiredPilotId: 'heilbronn_wave0',
    exactCommitConfirmationRequired: true,
    reviewedModel: 'gpt-4o-mini-2024-07-18',
    budgetMinimumCents: 2,
    budgetMaximumCents: 500,
    externalExecutionConfirmationRequired: true,
    healthReadbackRequired: true,
    rollbackForcesMockProvider: true,
    rollbackForcesZeroBudget: true,
    automaticPublicationAllowed: false,
  })) same(evidence?.activation?.[key], expected, `activation ${key}`);

  for (const [key, expected] of Object.entries({
    repositoryCredentialAllowed: false,
    directEnvironmentCredentialAllowedByOverlay: false,
    absolutePathRequired: true,
    regularFileRequired: true,
    symbolicLinkAllowed: false,
    readOnlyMount: true,
    createHostPath: false,
    ownerOnlyMode: '0600',
    runtimeGroupMode: '0640',
    runtimeGroupId: 65532,
    credentialPrinted: false,
    credentialCommitted: false,
    codexLocalDevCredentialReused: false,
  })) same(evidence?.credentialBoundary?.[key], expected, `credential boundary ${key}`);

  same(evidence?.ownerReview?.structuredDraftRequired, true, 'structured draft requirement');
  same(evidence?.ownerReview?.ownerApprovalRequiredBeforePublish, true, 'owner publish approval');
  same(evidence?.ownerReview?.clearFieldEditingAllowed, true, 'clear-field editing');
  same(evidence?.ownerReview?.automaticPublication, false, 'automatic publication');

  for (const [key, expected] of Object.entries({
    checkedAt: '2026-09-03',
    modelSnapshotListed: true,
    imageInputSupported: true,
    structuredOutputsSupported: true,
    deprecationEntryObserved: false,
    modelDocumentation: 'https://developers.openai.com/api/docs/models/gpt-4o-mini',
    structuredOutputsDocumentation: 'https://developers.openai.com/api/docs/guides/structured-outputs',
    visionDocumentation: 'https://developers.openai.com/api/docs/guides/images-vision',
    deprecationsDocumentation: 'https://developers.openai.com/api/docs/deprecations',
  })) same(evidence?.officialProviderReview?.[key], expected, `provider review ${key}`);

  same(
    JSON.stringify(Object.keys(evidence?.sourceBindings ?? {}).sort()),
    JSON.stringify(Object.keys(expectedSources).sort()),
    'source-binding inventory',
  );
  for (const [path, expected] of Object.entries(expectedSources)) {
    same(evidence?.sourceBindings?.[path], expected, `recorded source hash ${path}`);
    same(sha256(resolve(repositoryRoot, path)), expected, `working source hash ${path}`);
  }

  same(evidence?.verification?.focusedBackendTests, 'passed', 'focused Backend tests');
  same(evidence?.verification?.backendTestsPassed, 783, 'Backend test pass count');
  same(evidence?.verification?.backendTestsSkipped, 2, 'Backend test skip count');
  same(evidence?.verification?.backendCheck, 'passed', 'Backend check');
  if (!['pending-clean-checkout-github-regression', 'passed-by-github-regression'].includes(
    evidence?.verification?.composeConfigValidation,
  )) fail('Compose config validation status is invalid.');
  if (!['pending', 'passed'].includes(evidence?.verification?.fullLocalRegression)) {
    fail('Full local regression status is invalid.');
  }

  for (const [statusKey, runKey, label] of [
    ['githubRegression', 'githubRegressionRun', 'GitHub Regression'],
    ['githubCodeql', 'githubCodeqlRun', 'GitHub CodeQL'],
  ]) {
    const status = evidence?.verification?.[statusKey];
    if (!['pending', 'passed'].includes(status)) fail(`${label} status is invalid.`);
    const run = evidence?.verification?.[runKey];
    if (status === 'pending' && run !== null) fail(`${label} pending state cannot claim a run.`);
    if (status === 'passed' && (!Number.isInteger(run) || run <= 0)) {
      fail(`${label} pass requires an exact run id.`);
    }
  }
  if (!['pending', 'passed-by-github-regression'].includes(
    evidence?.verification?.cleanCheckoutReproducibility,
  )) fail('Clean-checkout reproducibility status is invalid.');
  const scanningAlerts = evidence?.verification?.openCodeScanningAlerts;
  if (evidence?.verification?.githubCodeql === 'passed') {
    same(scanningAlerts, 0, 'open code-scanning alerts');
  } else {
    same(scanningAlerts, null, 'pending code-scanning alerts');
  }
  same(evidence?.verification?.prNumber, 7, 'PR number');
  same(evidence?.verification?.prDraft, true, 'PR Draft state');
  same(evidence?.verification?.prMerged, false, 'PR merge state');

  same(evidence?.remainingOwnerActions?.providerCredential, 'pending-action-time-owner-approval', 'provider credential action');
  same(evidence?.remainingOwnerActions?.providerAccountOrBilling, 'pending-action-time-owner-approval', 'provider account action');
  same(evidence?.remainingOwnerActions?.firstRealStagingImageEvaluation, 'pending-after-provider-activation', 'first real evaluation');

  for (const [key, value] of Object.entries(evidence?.boundaries ?? {})) {
    if (value !== false) fail(`Boundary ${key} must remain false.`);
  }
  if (Object.keys(evidence?.boundaries ?? {}).length !== 22) {
    fail('Boundary inventory is incomplete.');
  }
  if (/sk-(?:(?:proj|svcacct)-)?[A-Za-z0-9_-]{16}/u.test(JSON.stringify(evidence))) {
    fail('Evidence must not contain a provider credential.');
  }
  return evidence;
}

function run() {
  const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
  const evidencePath = resolve(
    repositoryRoot,
    'docs/evidence/release-readiness/n17-staging-listing-ai-activation-readiness-20260903.json',
  );
  validateN17StagingListingAiActivationReadiness(
    JSON.parse(readFileSync(evidencePath, 'utf8')),
    { repositoryRoot },
  );
  process.stdout.write('N17 Staging listing-AI activation readiness evidence: PASS\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    run();
  } catch (error) {
    process.stderr.write(`ERROR: ${error?.message ?? 'N17 evidence validation failed.'}\n`);
    process.exitCode = 1;
  }
}
