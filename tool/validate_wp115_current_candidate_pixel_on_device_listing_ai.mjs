#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath =
  'docs/evidence/release-readiness/wp115-current-candidate-pixel-on-device-listing-ai-20260911.json';
const handoverPath =
  'docs/operations/WP115_CURRENT_CANDIDATE_PIXEL_ON_DEVICE_LISTING_AI_REPLAY_2026-09-11.md';
const rolloverPath = 'store/google-play/rollover-candidate-2026091110.json';
const artifactSourceHead = 'c8e2a49e14f5cae0026fa5f2bc327859fe0ff17b';
const executionHead = '4ae7837a22abdb5fc8a27d9a7f3df4b73a7d365e';

function fail(message) {
  throw new Error(message);
}

function exact(actual, expected, label) {
  if (actual !== expected) fail(`WP115 ${label} is invalid.`);
}

function digest(repositoryRoot, path) {
  return createHash('sha256')
    .update(readFileSync(resolve(repositoryRoot, path)))
    .digest('hex');
}

function assertGitState(repositoryRoot) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', executionHead, 'HEAD'], {
      cwd: repositoryRoot,
      stdio: 'ignore',
    });
  } catch {
    fail('execution head is not an ancestor of HEAD.');
  }
  const changed = execFileSync('git', [
    'diff', '--name-only', `${artifactSourceHead}..${executionHead}`, '--',
    'lib', 'android', 'assets', 'pubspec.yaml', 'pubspec.lock',
  ], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
  if (changed !== '') fail('mobile runtime paths changed before the physical replay.');
}

export function validateWp115CurrentCandidatePixelOnDeviceListingAi({
  repositoryRoot = root,
  evidence,
  rollover,
  checkGitState = true,
} = {}) {
  const canonicalRoot = realpathSync(resolve(repositoryRoot));
  const value = evidence
    ?? JSON.parse(readFileSync(resolve(canonicalRoot, evidencePath), 'utf8'));
  const current = rollover
    ?? JSON.parse(readFileSync(resolve(canonicalRoot, rolloverPath), 'utf8'));

  exact(value?.schemaVersion, 1, 'schema version');
  exact(value?.workPackage, 'WP115_CURRENT_CANDIDATE_PIXEL_ON_DEVICE_LISTING_AI_REPLAY',
    'work package');
  exact(value?.status,
    'passed-exact-current-candidate-physical-pixel-on-device-listing-ai', 'status');
  exact(value?.repository?.branch, 'codex/master-workflow-20260808', 'branch');
  exact(value?.repository?.artifactSourceHead, artifactSourceHead, 'artifact source');
  exact(value?.repository?.executionHead, executionHead, 'execution head');
  exact(value?.repository?.runnerSourceCommit,
    'd25b34d743c04ee5a060c1d31c3c5127416ccd03', 'runner source');
  exact(JSON.stringify(value?.repository?.appRuntimePathsChangedBetweenArtifactAndExecution),
    '[]', 'mobile runtime drift');

  const candidate = value.candidate;
  exact(candidate?.applicationId, 'com.shareittoo.app', 'application ID');
  exact(candidate?.versionName, '1.0.0', 'version name');
  exact(candidate?.versionCode, '2026091110', 'version code');
  exact(candidate?.sourceCommit, artifactSourceHead, 'candidate source');
  exact(candidate?.apkSha256,
    '711f058c113bd714abb1e4bcedf05d62a382004e1bf9882f6d85d04b876dd0f7',
    'APK digest');
  exact(candidate?.signingCertificateSha256,
    '098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4',
    'signing certificate');
  exact(candidate?.signatureVerified, true, 'signature');

  exact(value?.staging?.sourceHead,
    'df39a14b7a19afe467842461a28f1e77fec8445e', 'Staging source');
  exact(value?.staging?.containerHealthy, true, 'Staging container');
  exact(value?.staging?.containerRestartCount, 0, 'Staging restart count');
  exact(value?.staging?.databaseHealthy, true, 'Staging database');
  exact(value?.staging?.mailHealthy, true, 'Staging mail');

  exact(value?.device?.physical, true, 'physical device');
  exact(value?.device?.model, 'Pixel 7 Pro', 'device model');
  exact(value?.device?.exactSignedCandidateInstalled, true, 'installed candidate');
  exact(value?.device?.containsRawDeviceIdentifier, false, 'device identifier boundary');
  exact(value?.fixture?.kind, 'repository-controlled-synthetic-cordless-drill-image',
    'fixture kind');
  exact(value?.fixture?.sha256,
    '85458cb5bc4777c587bfb8994ff0f960c8549f5423df9cc33b4c90fc65ffd420',
    'fixture digest');
  for (const key of ['uniqueNewestPhotoPickerItem']) {
    exact(value.fixture[key], true, `fixture ${key}`);
  }
  exact(value.fixture?.personalMediaRead, false, 'personal media boundary');
  exact(value.fixture?.retainedOnDevice, false, 'fixture retention');
  for (const [key, result] of Object.entries(value.tests ?? {})) {
    exact(result, true, `test ${key}`);
  }
  if (Object.keys(value.tests ?? {}).length !== 28) fail('WP115 test inventory is incomplete.');

  exact(value?.runtime?.provider, 'on_device', 'runtime provider');
  exact(value?.runtime?.model,
    'mlkit-image-labeling-17.0.9+text-recognition-16.0.1+sit-rules-v1',
    'runtime model');
  exact(value?.runtime?.externalProviderExecutionAllowed, false, 'external provider hold');
  exact(value?.runtime?.estimatedCostCents, 0, 'estimated cost');
  exact(value?.runtime?.billedCostCents, 0, 'billed cost');
  exact(value?.runtime?.automaticPublicationAllowed, false, 'automatic publication hold');
  exact(value?.runtime?.paymentTransport, 'memory', 'payment transport');
  exact(value?.runtime?.stripeLivemode, false, 'Stripe live mode');
  for (const [key, result] of Object.entries(value.cleanup ?? {})) {
    exact(result, true, `cleanup ${key}`);
  }

  exact(value?.verification?.preReplayLocalTechnicalRegression?.head,
    executionHead, 'local regression head');
  exact(value?.verification?.preReplayLocalTechnicalRegression?.conclusion,
    'success', 'local regression');
  exact(value?.verification?.preReplayGithubRegression?.runId,
    34638823164, 'GitHub Regression run');
  exact(value?.verification?.preReplayGithubRegression?.head,
    executionHead, 'GitHub Regression head');
  exact(value?.verification?.preReplayGithubRegression?.conclusion,
    'success', 'GitHub Regression result');
  exact(value?.verification?.preReplayGithubRegression?.cleanCheckoutJob,
    'success', 'clean checkout');
  exact(value?.verification?.preReplayGithubCodeql?.runId, 34638823139, 'CodeQL run');
  exact(value?.verification?.preReplayGithubCodeql?.head, executionHead, 'CodeQL head');
  exact(value?.verification?.preReplayGithubCodeql?.conclusion, 'success', 'CodeQL');
  exact(value?.verification?.openCodeScanningAlerts, 0, 'code scanning alerts');
  exact(value?.verification?.pullRequest7,
    'draft-open-mergeable-unmerged', 'PR boundary');

  for (const [key, result] of Object.entries(value.boundaries ?? {})) {
    exact(result, false, `boundary ${key}`);
  }
  const remaining = [
    'professional-v52-legal-snapshots-and-owner-approval',
    'binding-booking-pickup-return-damage-needs-review-review-replay',
    'official-stripe-sandbox-payment-refund-and-simulated-payout',
    'separate-oneplus-exact-candidate-two-device-replay',
  ];
  exact(JSON.stringify([...(value.remaining ?? [])].sort()),
    JSON.stringify([...remaining].sort()), 'remaining inventory');

  for (const [path, expected] of Object.entries(value.sourceInventory ?? {})) {
    exact(digest(canonicalRoot, path), expected, `source inventory ${path}`);
  }
  exact(Object.keys(value.sourceInventory ?? {}).length, 3, 'source inventory size');
  exact(current?.candidate?.versionCode, candidate.versionCode, 'rollover version');
  exact(current?.artifact?.apkSha256, candidate.apkSha256, 'rollover APK');
  exact(current?.deviceVerification?.onDeviceListingAiPhysicalInference,
    'passed-physical-pixel-current-candidate', 'rollover physical inference');
  exact(current?.evidenceRef, evidencePath, 'rollover evidence reference');
  exact(current?.handoverRef, handoverPath, 'rollover handover reference');

  const serialized = JSON.stringify(value);
  if (/\/(?:Users|home)\/|@[A-Za-z0-9]|\+49[0-9]|BEGIN PRIVATE|\b(?:sk|rk)_(?:test|live)_|\bwhsec_|deviceSerial|androidId|\bimei\b/iu
    .test(serialized)) {
    fail('WP115 evidence contains private or secret-shaped content.');
  }
  const handover = readFileSync(resolve(canonicalRoot, handoverPath), 'utf8');
  for (const statement of [
    'all owner confirmations false',
    'and no publication receipt',
    'No personal gallery item was read or recorded.',
    'WP115 closes the exact-current-candidate Listing-AI replay',
  ]) {
    if (!handover.includes(statement)) fail('WP115 handover is incomplete.');
  }
  if (checkGitState) assertGitState(canonicalRoot);
  return Object.freeze({
    status: value.status,
    versionCode: candidate.versionCode,
    physicalInferencePassed: true,
    cleanupPassed: true,
  });
}

if (process.argv[1]
    && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    process.stdout.write(`${JSON.stringify(
      validateWp115CurrentCandidatePixelOnDeviceListingAi(), null, 2,
    )}\n`);
  } catch (error) {
    process.stderr.write(`ERROR: ${error?.message ?? 'WP115 validation failed.'}\n`);
    process.exitCode = 1;
  }
}
