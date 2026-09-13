#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = realpathSync(resolve(fileURLToPath(new URL('..', import.meta.url))));
const evidencePath =
  'docs/evidence/release-readiness/wp142-current-goal-external-gate-checkpoint-20260913.json';
const handoverPath =
  'docs/operations/WP142_CURRENT_GOAL_EXTERNAL_GATE_CHECKPOINT_2026-09-13.md';
const candidateSource = '904c2b734160544aaeb1128cac15191a521739e7';
const baselineHead = 'b2ff140b292b4593094c78c658ea39554a11cba7';

const partialIds = new Set([
  'messages-attachments-location-appointments',
  'handover-return-cancel-withdrawal-damage',
  'reviews-and-invoices',
  'cart-projects-and-booking-groups',
]);
const openIds = new Set([
  'facebook-signin',
  'apple-signin',
  'stripe-sandbox-payment-refund-simulated-payout',
  'binding-v52-contract-return-damage',
  'manual-talkback-traversal',
  'oneplus-cross-device-two-role',
  'durable-private-registry-pull',
]);

function fail(message) {
  throw new Error(`WP142 ${message}`);
}

function exact(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(`${label} is invalid.`);
}

function digest(path) {
  return createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex');
}

function assertGitState(repositoryRoot) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', baselineHead, 'HEAD'], {
      cwd: repositoryRoot,
      stdio: 'ignore',
    });
  } catch {
    fail('baseline head is not an ancestor of HEAD.');
  }
  const changed = execFileSync('git', [
    'diff', '--name-only', `${candidateSource}..HEAD`, '--',
    'lib', 'android', 'assets', 'pubspec.yaml', 'pubspec.lock',
  ], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
  if (changed !== '') fail('mobile runtime changed after the exact candidate.');
}

export function validateWp142CurrentGoalExternalGateCheckpoint({
  evidence,
  checkGitState = true,
  repositoryRoot = root,
} = {}) {
  const value = evidence
    ?? JSON.parse(readFileSync(resolve(repositoryRoot, evidencePath), 'utf8'));
  exact(value?.schemaVersion, 1, 'schema version');
  exact(value?.kind, 'sit-wp142-current-goal-external-gate-checkpoint', 'kind');
  exact(
    value?.status,
    'passed-current-candidate-and-staging-readiness-external-owner-gates-only',
    'status',
  );

  exact(value?.repository?.branch, 'codex/master-workflow-20260808', 'branch');
  exact(value?.repository?.baselineHead, baselineHead, 'baseline head');
  exact(value?.repository?.clean, true, 'clean baseline');
  exact(value?.repository?.remoteAhead, 0, 'remote ahead');
  exact(value?.repository?.remoteBehind, 0, 'remote behind');
  exact(value?.repository?.mobileRuntimePathsChangedAfterCandidate, [], 'mobile drift');
  exact(value?.repository?.githubRegression, {
    runId: 34771659634,
    conclusion: 'success',
  }, 'GitHub Regression');
  exact(value?.repository?.githubCodeql, {
    runId: 34771659690,
    conclusion: 'success',
  }, 'GitHub CodeQL');
  exact(value?.repository?.openCodeScanningAlerts, 0, 'open alerts');
  exact(value?.repository?.pullRequest7, 'draft-open-mergeable-unmerged', 'PR state');

  const candidate = value?.candidate;
  exact(candidate?.applicationId, 'com.shareittoo.app', 'application ID');
  exact(candidate?.versionCode, '2026091312', 'version code');
  exact(candidate?.sourceCommit, candidateSource, 'candidate source');
  exact(candidate?.environment, 'staging', 'candidate environment');
  exact(candidate?.paymentMode, 'memory', 'candidate payment mode');
  exact(candidate?.stripeLivemode, false, 'candidate Stripe mode');
  for (const key of [
    'physical',
    'exactInstalledCandidateMatched',
    'installedApkHashMatched',
    'authenticatedExploreSurfacePassed',
  ]) exact(value?.freshPixelReadback?.[key], true, `Pixel ${key}`);
  for (const key of ['accountIdentityRecorded', 'rawDeviceIdentifierRecorded']) {
    exact(value?.freshPixelReadback?.[key], false, `Pixel ${key}`);
  }

  const staging = value?.freshStagingReadback;
  exact(staging?.backendCommit, 'df39a14b7a19afe467842461a28f1e77fec8445e', 'Backend commit');
  for (const key of ['apiHealthy', 'databaseHealthy', 'fcmEnabled', 'smtpEnabled']) {
    exact(staging?.[key], true, `Staging ${key}`);
  }
  exact(staging?.apiRestartCount, 0, 'API restarts');
  exact(staging?.databaseRestartCount, 0, 'database restarts');
  exact(staging?.paymentTransport, 'memory', 'Staging payment transport');
  exact(staging?.stripeLivemode, false, 'Staging Stripe mode');
  exact(staging?.stripeCredentialReferencesDeclared, true, 'Stripe reference presence');
  exact(staging?.stripeProviderIdentityVerified, false, 'Stripe provider identity');
  exact(staging?.externalListingAiEnabled, false, 'external Listing AI');
  exact(staging?.deploymentChanged, false, 'deployment mutation');
  exact(staging?.stagingDataChanged, false, 'Staging data mutation');

  const vault = value?.privateQaVault;
  exact(vault?.activeSourceVaultCount, 0, 'active source vaults');
  exact(vault?.unsafeEntryCountBeforeCorrection, 4, 'pre-correction unsafe entries');
  exact(vault?.unsafeEntryCountAfterCorrection, 0, 'post-correction unsafe entries');
  exact(vault?.freshSourceProvisioningSafe, true, 'fresh source readiness');
  exact(vault?.credentialMaterialRecorded, false, 'vault credential boundary');
  exact(vault?.privatePathRecorded, false, 'vault path boundary');

  if (!Array.isArray(value?.requirements) || value.requirements.length !== 32
      || new Set(value.requirements.map((entry) => entry.id)).size !== 32) {
    fail('requirement inventory is invalid.');
  }
  for (const entry of value.requirements) {
    const expected = partialIds.has(entry.id) ? 'PARTIAL' : openIds.has(entry.id) ? 'OPEN' : 'PASS';
    exact(entry.state, expected, `requirement ${entry.id}`);
  }
  exact(value?.portfolio, { pass: 21, partial: 4, open: 7 }, 'portfolio');
  exact(value?.remainingGates?.length, 7, 'remaining gate count');

  const stripe = value?.stripePreflight;
  exact(stripe?.officialConnection, 'reauthentication-required', 'Stripe connection');
  for (const key of [
    'providerAccountSelected',
    'authenticatedProviderIdentityVerified',
    'professionalLegalApprovalPresent',
    'providerNetworkTrafficPerformed',
    'testMoneyPerformed',
    'realMoneyPerformed',
  ]) exact(stripe?.[key], false, `Stripe ${key}`);
  for (const [key, result] of Object.entries(value?.boundaries ?? {})) {
    exact(result, false, `boundary ${key}`);
  }
  exact(Object.keys(value?.sourceInventory ?? {}).length, 11, 'source inventory size');
  for (const [path, expected] of Object.entries(value.sourceInventory)) {
    exact(digest(path), expected, `source inventory ${path}`);
  }

  const serialized = JSON.stringify(value);
  if (/\/(?:Users|home)\/|@[A-Za-z0-9]|\+49[0-9]|BEGIN PRIVATE|\b(?:sk|rk)_(?:test|live)_|\bwhsec_|deviceSerial|androidId|\bimei\b/iu.test(serialized)) {
    fail('evidence contains private or secret-shaped content.');
  }
  const handover = readFileSync(resolve(repositoryRoot, handoverPath), 'utf8');
  for (const marker of [
    '21 PASS, 4 PARTIAL and 7 OPEN',
    'additional autonomous client or Backend implementation gap',
    'requires reauthentication',
    'no provider request or test-money action was made',
  ]) {
    if (!handover.includes(marker)) fail('handover is incomplete.');
  }
  if (checkGitState) assertGitState(repositoryRoot);
  return Object.freeze({
    status: value.status,
    pass: 21,
    partial: 4,
    open: 7,
    versionCode: candidate.versionCode,
    backendCommit: staging.backendCommit,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    process.stdout.write(`${JSON.stringify(validateWp142CurrentGoalExternalGateCheckpoint())}\n`);
  } catch (error) {
    process.stderr.write(`ERROR: ${error?.message ?? 'WP142 validation failed.'}\n`);
    process.exitCode = 1;
  }
}
