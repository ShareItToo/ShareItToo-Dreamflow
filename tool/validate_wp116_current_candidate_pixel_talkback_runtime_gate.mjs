#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath =
  'docs/evidence/release-readiness/wp116-current-candidate-pixel-talkback-runtime-gate-20260911.json';
const handoverPath =
  'docs/operations/WP116_CURRENT_CANDIDATE_PIXEL_TALKBACK_RUNTIME_GATE_2026-09-11.md';
const artifactSourceHead = 'c8e2a49e14f5cae0026fa5f2bc327859fe0ff17b';
const executionHead = '05b9dc0ac053179257a132c3c0c12ee6bda29b0c';

function fail(message) {
  throw new Error(message);
}

function exact(actual, expected, label) {
  if (actual !== expected) fail(`WP116 ${label} is invalid.`);
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
  if (changed !== '') fail('mobile runtime paths changed before the TalkBack probe.');
}

export function validateWp116CurrentCandidatePixelTalkBackRuntimeGate({
  repositoryRoot = root,
  evidence,
  checkGitState = true,
} = {}) {
  const canonicalRoot = realpathSync(resolve(repositoryRoot));
  const value = evidence
    ?? JSON.parse(readFileSync(resolve(canonicalRoot, evidencePath), 'utf8'));

  exact(value?.schemaVersion, 1, 'schema version');
  exact(value?.workPackage, 'WP116_CURRENT_CANDIDATE_PIXEL_TALKBACK_RUNTIME_GATE',
    'work package');
  exact(value?.status,
    'blocked-exact-current-candidate-android-runtime-touch-exploration-unavailable',
    'status');
  exact(value?.repository?.branch, 'codex/master-workflow-20260808', 'branch');
  exact(value?.repository?.artifactSourceHead, artifactSourceHead, 'artifact source');
  exact(value?.repository?.executionHead, executionHead, 'execution head');
  exact(JSON.stringify(value?.repository?.mobileRuntimePathsChangedBetweenArtifactAndExecution),
    '[]', 'mobile runtime drift');

  const candidate = value.candidate;
  exact(candidate?.applicationId, 'com.shareittoo.app', 'application ID');
  exact(candidate?.versionName, '1.0.0', 'version name');
  exact(candidate?.versionCode, '2026091110', 'version code');
  exact(candidate?.sourceCommit, artifactSourceHead, 'candidate source');
  exact(candidate?.releaseChannel, 'internal', 'release channel');
  exact(candidate?.apiBaseUrl, 'https://staging.shareittoo.com/api/v1', 'API URL');
  exact(candidate?.apkSha256,
    '711f058c113bd714abb1e4bcedf05d62a382004e1bf9882f6d85d04b876dd0f7',
    'APK digest');
  exact(candidate?.firebaseConfigured, true, 'Firebase configuration');
  exact(candidate?.paymentMode, 'memory', 'payment mode');
  exact(candidate?.stripeLivemode, false, 'Stripe live mode');
  exact(candidate?.exactInstalledCandidateMatched, true, 'installed candidate');

  exact(value?.device?.physical, true, 'physical device');
  exact(value?.device?.manufacturer, 'Google', 'device manufacturer');
  exact(value?.device?.model, 'Pixel 7 Pro', 'device model');
  exact(value?.device?.containsRawDeviceIdentifier, false, 'device identifier boundary');

  const activation = value.activation;
  exact(activation?.route, 'user-visible-android-accessibility-settings', 'activation route');
  for (const key of [
    'knownDisabledBaselineConfirmed',
    'settingsSurfaceOpened',
    'settingsTogglePresent',
    'systemConfirmationAccepted',
    'talkBackServiceEnabled',
    'talkBackProcessActive',
    'talkBackServiceBound',
  ]) exact(activation?.[key], true, `activation ${key}`);
  for (const key of [
    'runtimeTouchExplorationEnabled',
    'secureTouchExplorationEnabled',
    'secureTouchExplorationGrantPresent',
  ]) exact(activation?.[key], false, `activation ${key}`);
  exact(activation?.runtimeTouchExplorationSignalCount, 1, 'runtime signal count');
  exact(activation?.runtimeTouchExplorationTrueSignalCount, 0, 'runtime true count');

  const tests = value.tests;
  for (const key of [
    'candidateIdentityVerifiedBeforeSettingsMutation',
    'physicalPixelVerified',
    'talkBackPackageAvailable',
    'officialSettingsRouteUsed',
    'serviceActivationObserved',
    'runtimeReadinessFailedClosed',
  ]) exact(tests?.[key], true, `test ${key}`);
  for (const key of [
    'mainNavigationTraversalAttempted',
    'automatedTalkBackMainNavigationPassed',
    'manualTalkBackTraversalPassed',
  ]) exact(tests?.[key], false, `test ${key}`);

  const restoration = value.restoration;
  exact(restoration?.exactPreviousAccessibilityConfigurationRestored, true,
    'exact restoration');
  exact(restoration?.exploreSurfaceRestored, true, 'Explore restoration');
  exact(restoration?.accessibilityEnabledAfterDiagnostic, false,
    'accessibility after diagnostic');
  exact(restoration?.touchExplorationEnabledAfterDiagnostic, false,
    'touch exploration after diagnostic');
  for (const key of [
    'enabledServiceCountAfterDiagnostic',
    'touchExplorationGrantCountAfterDiagnostic',
    'keyboardShortcutTargetCountAfterDiagnostic',
  ]) exact(restoration?.[key], 0, `restoration ${key}`);

  exact(value?.verification?.preProbeLocalTechnicalRegression?.head,
    executionHead, 'local regression head');
  exact(value?.verification?.preProbeLocalTechnicalRegression?.conclusion,
    'success', 'local regression');
  exact(value?.verification?.preProbeGithubRegression?.runId,
    34642104364, 'GitHub Regression run');
  exact(value?.verification?.preProbeGithubRegression?.head,
    executionHead, 'GitHub Regression head');
  exact(value?.verification?.preProbeGithubRegression?.conclusion,
    'success', 'GitHub Regression');
  exact(value?.verification?.preProbeGithubRegression?.cleanCheckoutJob,
    'success', 'clean checkout');
  exact(value?.verification?.preProbeGithubCodeql?.runId,
    34642104387, 'CodeQL run');
  exact(value?.verification?.preProbeGithubCodeql?.head,
    executionHead, 'CodeQL head');
  exact(value?.verification?.preProbeGithubCodeql?.conclusion,
    'success', 'CodeQL');
  exact(value?.verification?.openCodeScanningAlerts, 0, 'code scanning alerts');
  exact(value?.verification?.pullRequest7,
    'draft-open-mergeable-unmerged', 'PR boundary');

  exact(JSON.stringify(value?.blockers), JSON.stringify([
    'android-talkback-runtime-touch-exploration-unavailable',
    'manual-talkback-traversal-not-performed',
  ]), 'blockers');
  for (const [key, result] of Object.entries(value.boundaries ?? {})) {
    exact(result, false, `boundary ${key}`);
  }
  exact(Object.keys(value.sourceInventory ?? {}).length, 2, 'source inventory size');
  for (const [path, expected] of Object.entries(value.sourceInventory ?? {})) {
    exact(digest(canonicalRoot, path), expected, `source inventory ${path}`);
  }

  const serialized = JSON.stringify(value);
  if (/\/(?:Users|home)\/|@[A-Za-z0-9]|\+49[0-9]|BEGIN PRIVATE|\b(?:sk|rk)_(?:test|live)_|\bwhsec_|deviceSerial|androidId|\bimei\b/iu
    .test(serialized)) {
    fail('WP116 evidence contains private or secret-shaped content.');
  }
  const handover = readFileSync(resolve(canonicalRoot, handoverPath), 'utf8');
  for (const statement of [
    'not an automated or manual TalkBack pass',
    'restored all five relevant settings exactly',
    'No timeout increase',
    'Automated and manual TalkBack navigation remain explicitly open',
  ]) {
    if (!handover.includes(statement)) fail('WP116 handover is incomplete.');
  }
  if (checkGitState) assertGitState(canonicalRoot);
  return Object.freeze({
    status: value.status,
    versionCode: candidate.versionCode,
    runtimeTouchExplorationEnabled: false,
    exactRestorationPassed: true,
  });
}

if (process.argv[1]
    && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    process.stdout.write(`${JSON.stringify(
      validateWp116CurrentCandidatePixelTalkBackRuntimeGate(), null, 2,
    )}\n`);
  } catch (error) {
    process.stderr.write(`ERROR: ${error?.message ?? 'WP116 validation failed.'}\n`);
    process.exitCode = 1;
  }
}
