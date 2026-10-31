#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath =
  'docs/evidence/release-readiness/wp128-current-candidate-pixel-visual-permission-20260912.json';
const candidateHead = '1546812f625b4e8f1e700bf976410097cd45ac2f';
const wp127BaseHead = '66df6b1f3501f3920192c6e73609d441070f65b0';
const wp128ClosureHead = '41362146a2aa7bcbc39040608d1c7043a2ea9a94';
const runtimeRoots = [
  'lib', 'android', 'assets', 'pubspec.yaml', 'pubspec.lock', 'backend/src', 'backend/sql',
];
const sourcePaths = [
  'tool/diagnose_current_head_android_main_navigation.mjs',
  'tool/diagnose_current_candidate_android_permission_lifecycle.mjs',
  'test/tool/diagnose_current_head_android_main_navigation.test.mjs',
  'test/tool/diagnose_current_candidate_android_permission_lifecycle.test.mjs',
];

function fail(message) {
  throw new Error(message);
}

function exact(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`WP128 ${label} is invalid.`);
  }
}

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

function rejectPrivateShape(value, path = []) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => rejectPrivateShape(entry, [...path, index]));
    return;
  }
  if (value === null || typeof value !== 'object') return;
  for (const [key, entry] of Object.entries(value)) {
    if (/^(?:password|secret|token|email|phone|accountid|credential|personname|deviceid|serial)$/iu.test(key)) {
      fail(`WP128 evidence contains a private field at ${[...path, key].join('.')}.`);
    }
    rejectPrivateShape(entry, [...path, key]);
  }
}

function assertAncestor(repositoryRoot, head) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', head, 'HEAD'], {
      cwd: repositoryRoot,
      stdio: 'ignore',
    });
  } catch {
    fail(`WP128 head is not an ancestor of HEAD: ${head}`);
  }
}

function validateSourceInventory(repositoryRoot, inventory) {
  if (!Array.isArray(inventory) || inventory.length !== sourcePaths.length) {
    fail('WP128 source inventory is invalid.');
  }
  const seen = new Set();
  for (const [index, item] of inventory.entries()) {
    if (typeof item?.path !== 'string' || seen.has(item.path)
        || item.path !== sourcePaths[index]
        || !/^[a-f0-9]{64}$/u.test(item?.sha256 ?? '')) {
      fail('WP128 source inventory is invalid.');
    }
    seen.add(item.path);
    let source;
    try {
      source = execFileSync('git', ['show', `${wp128ClosureHead}:${item.path}`], {
        cwd: repositoryRoot,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
    } catch {
      fail(`WP128 historical source is unavailable: ${item.path}.`);
    }
    const actual = digest(source);
    exact(actual, item.sha256, `source digest ${item.path}`);
  }
}

export function validateWp128CurrentCandidatePixelVisualPermission({
  repositoryRoot = root,
  evidence,
  checkGitState = true,
} = {}) {
  const value = evidence ?? JSON.parse(readFileSync(resolve(repositoryRoot, evidencePath), 'utf8'));
  rejectPrivateShape(value);
  if (/(?:\/(?:Users|home)\/|@[A-Za-z0-9]|\+49[0-9]|BEGIN PRIVATE|\b(?:sk|rk)_(?:test|live)_|\bwhsec_|deviceSerial|androidId|\bimei\b)/iu.test(JSON.stringify(value))) {
    fail('WP128 evidence contains private or secret-shaped content.');
  }
  exact([value.schemaVersion, value.kind, value.status, value.capturedOn, value.workPackage], [
    1,
    'sit-wp128-current-candidate-pixel-visual-permission',
    'partial-visual-text-complete-permission-settlement-open',
    '2026-09-12',
    'WP128',
  ], 'identity');
  exact(value.repository, {
    branch: 'codex/master-workflow-20260808',
    wp127BaseHead,
    candidateSourceHead: candidateHead,
    applicationRuntimePathsChangedAfterCandidateSource: [],
  }, 'repository binding');
  exact(value.candidate, {
    applicationId: 'com.shareittoo.app',
    versionName: '1.0.0',
    versionCode: '2026091201',
    releaseChannel: 'internal',
    environment: 'staging',
    delivery: 'direct-apk',
    apkSha256: 'a8bfda4c1a0e7302b2528db8edfbe1318e88322023f65588da032220a24badd4',
    uploadCertificateSha256: '098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4',
    physicalPixelPackageMatched: true,
  }, 'candidate binding');
  exact(value.largeTextAndRestart, {
    fontScaleBefore: 0.85,
    fontScaleDuring: 2,
    fontScaleAfter: 0.85,
    exactFontScaleRestored: true,
    destinations: ['Entdecken', 'Mietkorb', 'Buchungen', 'Nachrichten', 'Mein SIT'],
    allDestinationsReachableAt200Percent: true,
    boundedColdStartsRequested: 3,
    boundedColdStartsPassed: 3,
    manualTalkBackTraversalPassed: false,
  }, 'large-text and restart proof');
  exact(value.visualTheme?.systemModes, {
    dark: {
      authenticatedMainNavigationVisible: true,
      privateCaptureSha256: 'e1857654cb15a64281cacd9dfa1a3854d21c6c90c3724a8be2031ab934272260',
      exactOriginalModeRestored: true,
    },
    light: {
      authenticatedMainNavigationVisible: true,
      privateCaptureSha256: 'fc40ab569f0643179b39babe7efafda7782e9ae046902bd4a17fcc9fe802aea6',
      exactOriginalModeRestored: true,
    },
  }, 'system modes');
  exact(value.visualTheme?.backgroundChoices, {
    system: 'f8dc9650ced0987e03a50366e5ba26e81d5667b525913d45ead50d0caa50f9e8',
    'dark-1': 'c08a3878d84340c3af6245baf984906351e27c713072e757f37540e895292302',
    'dark-2': '5301a07a286cfd907e965371a9bb95364b31b1607ce9c4b9961b73a467b044de',
    'light-1': 'aa773ea1fdd153c3463a79b8a23fb3bdb7d27aed242cb0cb8ec5393686921ec5',
    'light-2': '153bdfea0b3c1588dd0c9bea7044ea73ca3b21de29eb3ce1d58b38390cc80520',
  }, 'background choices');
  if (value.visualTheme.originalBackgroundChoice !== 'dark-1'
      || value.visualTheme.selectedSemanticsAuthoritative !== true
      || value.visualTheme.eachChoiceRestoredBeforeNextPhase !== true
      || value.visualTheme.normalExploreRestored !== true
      || value.visualTheme.privateCapturesVisuallyInspected !== true
      || value.visualTheme.ownerManualVisualSignoffClaimed !== false
      || value.visualTheme.privateCapturesCommitted !== false) {
    fail('WP128 visual-theme contract is invalid.');
  }
  exact(value.permissionLifecycle?.groups, {
    camera: 'deny-allow-authenticated-restarts-passed',
    location: 'deny-allow-authenticated-restarts-passed',
    notifications: 'deny-allow-authenticated-restarts-passed',
  }, 'permission group matrix');
  exact(value.permissionLifecycle, {
    declaredPermissionCount: 14,
    activeRuntimePermissionCount: 4,
    groups: {
      camera: 'deny-allow-authenticated-restarts-passed',
      location: 'deny-allow-authenticated-restarts-passed',
      notifications: 'deny-allow-authenticated-restarts-passed',
    },
    readOnlyAndroidPermissionSettingsPassed: true,
    exactPermissionStateRestored: true,
    ownerOnlyJournalMode: '0600',
    recoveryRequired: false,
    finalLifecycleAccepted: false,
    lastAcceptedCheckpoint: 'restored-before-platform-settlement',
    observedTerminationReason: 'permissions-revoked',
    observedDelayedTerminationCount: 3,
    applicationCrashClaimed: false,
    packageManagerHandlerBarrierAdded: true,
    broadcastBarrierConfirmedDuringLifecycle: false,
    elapsedTimeOrRetryWorkaroundAdded: false,
    furtherPhysicalReplayPerformed: false,
    remaining: 'Establish a deterministic Android permission-controller settlement signal before one future exact-candidate final-restart proof.',
  }, 'permission-lifecycle boundary');
  exact(value.diagnosticCorrection, {
    explicitShareItTooActivityLaunchRequired: true,
    foregroundOwnerUsesCurrentAndroidWindowInventory: true,
    packageManagerHandlerCompletionRequired: true,
    broadcastBarrierRequired: true,
    runtimeOrProductBehaviorChanged: false,
    rootCauseClass: 'android-permission-revocation-callbacks-outlive-the-synchronous-restore-commands',
  }, 'diagnostic correction');
  exact(value.portfolioEffect, {
    promotedRequirement: 'themes-backgrounds-large-text-and-restart',
    retainedPartialRequirement: 'android-permission-lifecycle',
    passCount: 13,
    partialCount: 11,
    openCount: 8,
    totalCount: 32,
    releaseDecision: 'hold-not-production-ready',
  }, 'portfolio effect');
  exact(value.verification, {
    focusedTestsPassed: 32,
    fullLocalRegression: 'success',
    fullLocalRegressionBeforeFreeKiB: 5514620,
    fullLocalRegressionAfterFreeKiB: 1885416,
    fullLocalRegressionGeneratedGrowthKiB: 3623860,
    webWasmLoopbackAndroidBuildPassed: true,
    exactHeadGithubRegressionRequired: true,
    exactHeadCodeqlRequired: true,
  }, 'verification');
  exact(value.boundaries, {
    applicationRuntimeChanged: false,
    backendChanged: false,
    accountMutated: false,
    listingMutated: false,
    bookingMutated: false,
    messageSent: false,
    paymentEndpointCalled: false,
    productionChanged: false,
    googlePlayChanged: false,
    firebaseProjectChanged: false,
    onePlusContacted: false,
    pullRequestMerged: false,
    privateCaptureCommitted: false,
    credentialRead: false,
    accountIdentityRecorded: false,
    rawDeviceIdentifierRecorded: false,
  }, 'authorization boundary');
  validateSourceInventory(repositoryRoot, value.sourceInventory);
  if (checkGitState) {
    assertAncestor(repositoryRoot, candidateHead);
    assertAncestor(repositoryRoot, wp127BaseHead);
    assertAncestor(repositoryRoot, wp128ClosureHead);
    const drift = execFileSync('git', [
      'diff', '--name-only', candidateHead, wp128ClosureHead, '--', ...runtimeRoots,
    ], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (drift !== '') fail('WP128 application runtime drifted before its closure.');
  }
  return Object.freeze({
    status: value.status,
    versionCode: value.candidate.versionCode,
    visualRequirement: 'PASS',
    permissionRequirement: 'PARTIAL',
    passCount: value.portfolioEffect.passCount,
    partialCount: value.portfolioEffect.partialCount,
    openCount: value.portfolioEffect.openCount,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = validateWp128CurrentCandidatePixelVisualPermission();
    process.stdout.write(
      `WP128 Pixel evidence valid: candidate=${result.versionCode}, visual=${result.visualRequirement}, permission=${result.permissionRequirement}\n`,
    );
  } catch (error) {
    process.stderr.write(`${error?.message ?? 'WP128 validation failed.'}\n`);
    process.exitCode = 1;
  }
}
