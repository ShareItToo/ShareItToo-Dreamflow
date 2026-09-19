#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath = 'docs/evidence/release-readiness/wp81-source-to-staging-parity-preflight-20260910.json';
const candidateHead = 'e1c182ea496f013989863155c13bfda649255a7e';
const stagingHead = 'baf9267c8bff7533230f3234c1f543649df6e4aa';
const preflightHead = '4cab7d4ddb4546296e35350c564e37f755199669';
const runtimePaths = ['backend/src', 'backend/sql', 'lib', 'android', 'ios', 'pubspec.yaml', 'assets'];
const currentSourceRuntimePaths = [
  'assets/legal/de/legal_manifest_v53.json',
  'assets/legal/de/operator_readiness_draft_20260909.json',
  'assets/legal/de/v53/part_a_platform_terms.html',
  'assets/legal/de/v53/part_b_private_rental_terms.html',
  'assets/legal/de/v53/part_c_cancellation_refund.html',
  'assets/legal/de/v53/part_d_handover_return_damage.html',
  'assets/legal/de/v53/part_e_payment_payout.html',
  'assets/legal/de/v53/part_f_community_safety.html',
  'assets/legal/de/v53/part_g_reporting_moderation_review.html',
  'assets/legal/de/v53/part_h_privacy.html',
  'assets/legal/de/v53/part_i_imprint_withdrawal_shorttexts.html',
  'backend/src/operational_readiness_gate.js',
  'lib/config/draft_operator_config.dart',
  'lib/screens/legal_imprint_screen.dart',
  'lib/screens/legal_privacy_screen.dart',
  'lib/screens/legal_terms_screen.dart',
];

function fail(message) {
  throw new Error(message);
}

function exact(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function git(repositoryRoot, args) {
  return execFileSync('git', args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function assertAncestor(repositoryRoot, ancestor, descendant) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', ancestor, descendant], {
      cwd: repositoryRoot,
      stdio: ['ignore', 'ignore', 'ignore'],
    });
  } catch {
    fail(`WP81 commit ancestry is invalid: ${ancestor} -> ${descendant}`);
  }
}

function inspectPrivateShape(value, trail = []) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => inspectPrivateShape(entry, [...trail, index]));
    return;
  }
  if (value === null || typeof value !== 'object') return;
  for (const [key, entry] of Object.entries(value)) {
    if (/^(?:password|secret|tokenvalue|emailaddress|phonenumber|accountid|credentialvalue|personname|deviceid|serial|ssid|bssid|ipaddress)$/iu.test(key)) {
      fail(`WP81 private field is forbidden: ${[...trail, key].join('.')}`);
    }
    inspectPrivateShape(entry, [...trail, key]);
  }
}

function changedRuntimePaths(repositoryRoot, from, to) {
  const output = git(repositoryRoot, [
    'diff', '--name-only', `${from}..${to}`, '--', ...runtimePaths,
  ]);
  return output === '' ? [] : output.split('\n');
}

function sourceTree(repositoryRoot, revision, path) {
  return git(repositoryRoot, ['rev-parse', `${revision}:${path}`]);
}

function validateGitBinding(repositoryRoot) {
  assertAncestor(repositoryRoot, candidateHead, stagingHead);
  assertAncestor(repositoryRoot, stagingHead, preflightHead);
  assertAncestor(repositoryRoot, preflightHead, 'HEAD');

  if (!exact(changedRuntimePaths(repositoryRoot, candidateHead, stagingHead), [])) {
    fail('WP81 candidate-to-Staging runtime drift is not empty.');
  }
  if (!exact(changedRuntimePaths(repositoryRoot, stagingHead, preflightHead), currentSourceRuntimePaths)) {
    fail('WP81 current-source runtime delta has drifted.');
  }
  for (const path of ['backend', 'lib']) {
    if (sourceTree(repositoryRoot, candidateHead, path) !== sourceTree(repositoryRoot, stagingHead, path)) {
      fail(`WP81 candidate and Staging ${path} trees differ.`);
    }
  }

  const deployment = readFileSync(resolve(repositoryRoot, 'backend/ops/deploy_release.sh'), 'utf8');
  const compose = readFileSync(resolve(repositoryRoot, 'backend/compose.staging.yml'), 'utf8');
  for (const marker of [
    'Image revision label does not match $task_commit.',
    'up -d --no-build --wait --wait-timeout 180',
    'Deployment health endpoint does not expose the requested commit.',
    'previous image restored and verified.',
  ]) {
    if (!deployment.includes(marker)) fail(`WP81 deployment guard is missing: ${marker}`);
  }
  for (const marker of ['name: shareittoo_staging_postgres_data', 'name: shareittoo_staging_uploads']) {
    if (!compose.includes(marker)) fail(`WP81 Staging volume identity is missing: ${marker}`);
  }
}

export function validateWp81SourceToStagingParityPreflight({
  repositoryRoot = root,
  evidence,
  checkGit = true,
} = {}) {
  const value = evidence ?? JSON.parse(readFileSync(resolve(repositoryRoot, evidencePath), 'utf8'));
  inspectPrivateShape(value);

  if (value.schemaVersion !== 1
      || value.kind !== 'sit-wp81-source-to-staging-parity-preflight'
      || value.status !== 'complete-read-only-deployment-blocked'
      || value.workPackage !== 'WP81') {
    fail('WP81 evidence identity is invalid.');
  }
  if (!exact(value.repository, {
    branch: 'codex/master-workflow-20260808',
    candidateSourceHead: candidateHead,
    stagingRuntimeHead: stagingHead,
    preflightHead,
    candidateToStagingRuntimePaths: [],
    currentSourceRuntimePaths,
  })) fail('WP81 repository binding is invalid.');
  if (!exact(value.runtimeTreeBinding, {
    candidateBackendTree: 'cbcbe352819eae2a2f524b15fefba91239df3e06',
    stagingBackendTree: 'cbcbe352819eae2a2f524b15fefba91239df3e06',
    candidateFlutterTree: '49f6551aa69625bb5fed166df8dfd98cfa0b1fb8',
    stagingFlutterTree: '49f6551aa69625bb5fed166df8dfd98cfa0b1fb8',
    candidateAndStagingRuntimeEqual: true,
    currentSourceMayNotBeClaimedAsInstalledCandidate: true,
  })) fail('WP81 runtime-tree binding is invalid.');
  if (!exact(value.verification, {
    focusedWp81Tests: 'passed-6',
    completeToolInventory: 'passed-2560',
    fullTechnicalRegression: 'passed',
    webWasmLoopback: 'passed',
    androidDebugBuildAndMinSdk24: 'passed',
    r11AndroidSecuritySurface: 'passed',
  })) fail('WP81 verification is invalid.');
  if (!exact(value.githubVerification, {
    sourceHead: '60f62ce4a44bd20d9e4c2136109c7b921a660932',
    regressionRun: 34415756777,
    regression: 'passed-all-required-jobs',
    codeqlRun: 34415756339,
    codeql: 'passed',
    cleanCheckoutReproducibility: 'passed',
    apiImagePublication: 'skipped',
    openPullRequestMergeCodeScanningAlerts: 0,
    pullRequest7: 'draft-open-clean-unmerged',
  })) fail('WP81 GitHub verification is invalid.');
  if (!exact(value.deploymentSafety, {
    immutableCommitLabeledImageRequired: true,
    noBuildRuntimeRolloutRequired: true,
    healthCommitReadbackRequired: true,
    automaticRollbackVerificationRequired: true,
    namedStagingDataVolumesRequired: true,
    persistentAuthoritativeRemoteSourceProven: false,
    remoteSourceBlocker: 'WP77_PUBLIC_LEGAL_RUNTIME_TARGET_AND_SOURCE_MISMATCH',
    deploymentAuthorized: false,
  })) fail('WP81 deployment boundary is invalid.');
  if (!exact(value.externalGate, {
    name: 'STAGING_SUCCESSOR_SOURCE_AND_RUNTIME_BINDING',
    state: 'closed',
    reason: 'The WP77 persistent authoritative remote source and safe recreate proof remain absent.',
    nextSafeAction: 'Establish the exact persistent remote source and recreate proof read-only before any successor deployment.',
  })) fail('WP81 external gate is invalid.');
  if (value.boundaries === null || typeof value.boundaries !== 'object'
      || Object.values(value.boundaries).some((entry) => entry !== false)) {
    fail('WP81 cannot claim an external or runtime mutation.');
  }
  const serialized = JSON.stringify(value);
  if (/@[A-Za-z0-9]|\+49[0-9]|BEGIN PRIVATE|\b(?:sk|rk)_(?:test|live)_|\bwhsec_|deviceSerial|androidId|\bimei\b/iu.test(serialized)) {
    fail('WP81 evidence contains private or secret-shaped content.');
  }
  if (checkGit) validateGitBinding(repositoryRoot);
  return {
    candidateToStaging: 'exact-runtime-trees',
    currentSource: 'successor-build-required',
    deployment: 'blocked-by-wp77',
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    process.stdout.write(`${JSON.stringify(validateWp81SourceToStagingParityPreflight())}\n`);
  } catch (error) {
    process.stderr.write(`WP81 source-to-Staging parity preflight failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
