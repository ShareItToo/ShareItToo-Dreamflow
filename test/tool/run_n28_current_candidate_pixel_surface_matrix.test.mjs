import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertCurrentCandidateNoPostCandidateMobileSourceDrift,
  collectCurrentCandidateDriftPaths,
  summarizeCurrentCandidateSurfaceMatrix,
  validateCurrentPrivateAndroidCandidate,
} from '../../tool/run_n28_current_candidate_pixel_surface_matrix.mjs';

const candidate = {
  applicationId: 'com.shareittoo.app',
  bundleId: 'com.shareittoo.app',
  versionName: '1.0.0',
  buildNumber: '2026090306',
  commit: '9d7e2601dc477cf3ae3d469b65448ce2065375e0',
  releaseChannel: 'internal',
  apiBaseUrl: 'https://staging.shareittoo.com/api/v1',
  firebaseConfigured: true,
  privacyScan: 'passed',
  apkSha256: '37d98f999562150e77fea335fcb0bde32aee20d2183509f5484a5e67cd1e3194',
  aabSha256: 'a'.repeat(64),
  signingCertificateSha256: '098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4',
  android: {
    apkSha256: '37d98f999562150e77fea335fcb0bde32aee20d2183509f5484a5e67cd1e3194',
    aabSha256: 'a'.repeat(64),
    signingCertificateSha256: '098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4',
  },
};
const normalizedCandidate = validateCurrentPrivateAndroidCandidate(candidate);
const device = {
  platform: 'android',
  physical: true,
  manufacturer: 'Google',
  model: 'Pixel 7 Pro',
  osVersion: '17',
  apiLevel: 37,
  securityPatch: '2026-08-05',
  containsRawDeviceIdentifier: false,
};

function lane(kind, status, extras = {}) {
  return {
    kind,
    status,
    candidate: {
      applicationId: normalizedCandidate.applicationId,
      buildNumber: normalizedCandidate.buildNumber,
      commit: normalizedCandidate.commit,
    },
    installed: {
      buildNumber: normalizedCandidate.buildNumber,
      delivery: 'direct-apk',
      apkSha256: normalizedCandidate.android.apkSha256,
    },
    ...extras,
  };
}

function validInput() {
  return {
    candidate: normalizedCandidate,
    deviceSummary: device,
    sourceDrift: { changedPathCount: 88, mobileSourceChanged: false },
    capturedAt: '2026-09-03T14:00:00.000Z',
    session: lane(
      'android-authenticated-session-diagnostic',
      'passed-bounded-authenticated-session-diagnostic',
      {
        tests: {
          authenticatedProfileAccess: { status: 'passed' },
          coldStartSessionRestore: { status: 'passed' },
        },
      },
    ),
    navigation: lane(
      'android-current-head-authenticated-main-navigation-diagnostic',
      'passed-bounded-authenticated-main-navigation-diagnostic',
      {
        tests: Object.fromEntries(['Entdecken', 'Mietkorb', 'Buchungen', 'Nachrichten', 'Mein SIT']
          .map((key) => [key, { status: 'passed' }])),
        boundaries: { authenticatedMainNavigationPassed: true },
      },
    ),
    legal: lane(
      'android-current-head-authenticated-legal-route-diagnostic',
      'passed-bounded-authenticated-legal-route-diagnostic',
      {
        tests: Object.fromEntries(['AGB', 'Datenschutz', 'Impressum', 'Widerruf', 'Gebuehren', 'Regeln']
          .map((key) => [key, { status: 'passed' }])),
        boundaries: {
          authenticatedLegalRoutesPassed: true,
          professionalLegalApprovalPassed: false,
        },
      },
    ),
    largeText: lane(
      'android-current-head-authenticated-large-text-main-navigation-diagnostic',
      'passed-bounded-authenticated-large-text-main-navigation-diagnostic',
      {
        tests: Object.fromEntries(['Entdecken', 'Mietkorb', 'Buchungen', 'Nachrichten', 'Mein SIT']
          .map((key) => [key, { status: 'passed' }])),
        configuration: { exactPreviousFontScaleRestored: true },
        boundaries: { authenticatedMainNavigationAtLargeTextPassed: true },
      },
    ),
    touchTargets: lane(
      'android-current-head-main-navigation-touch-target-diagnostic',
      'passed-physical-200-percent-touch-target-geometry',
      {
        configuration: { exactPreviousFontScaleRestored: true },
        touchTargets: {
          allTargetsAtLeast48Dp: true,
          allTargetsWithinDisplay: true,
          allTargetsPairwiseNonOverlapping: true,
        },
      },
    ),
    restart: {
      kind: 'android-current-head-process-restart-diagnostic',
      status: 'passed-bounded-process-restart-diagnostic',
      candidate: {
        applicationId: normalizedCandidate.applicationId,
        buildNumber: normalizedCandidate.buildNumber,
        commit: normalizedCandidate.commit,
      },
      tests: Object.fromEntries([
        'exactInstalledCandidate',
        'processAbsentAfterForceStop',
        'launcherProcessRestarted',
        'installIdentityPreserved',
        'dataContainerIdentityPreserved',
      ].map((key) => [key, { status: 'passed' }])),
    },
  };
}

test('accepts canonical private candidates without a historical build or artifact pin', () => {
  assert.equal(normalizedCandidate.buildNumber, '2026090306');
  const successor = structuredClone(candidate);
  successor.buildNumber = '2026090407';
  successor.commit = '8f66c9a823abbd01119c729d747a43ad4018a542';
  successor.apkSha256 = 'b'.repeat(64);
  successor.aabSha256 = 'c'.repeat(64);
  successor.android.apkSha256 = successor.apkSha256;
  successor.android.aabSha256 = successor.aabSha256;
  assert.equal(
    validateCurrentPrivateAndroidCandidate(successor).buildNumber,
    '2026090407',
  );
  for (const mutate of [
    (value) => { value.buildNumber = '407'; },
    (value) => { value.commit = 'not-a-commit'; },
    (value) => { value.apiBaseUrl = 'https://example.invalid/api'; },
    (value) => { value.releaseChannel = 'production'; },
    (value) => { value.firebaseConfigured = false; },
    (value) => { value.privacyScan = 'failed'; },
    (value) => { value.android.apkSha256 = '0'.repeat(64); },
    (value) => { value.android.signingCertificateSha256 = '0'.repeat(64); },
  ]) {
    const changed = structuredClone(candidate);
    mutate(changed);
    assert.throws(() => validateCurrentPrivateAndroidCandidate(changed));
  }
});

test('rejects any post-candidate Android application-source drift', () => {
  assert.deepEqual(
    assertCurrentCandidateNoPostCandidateMobileSourceDrift(['docs/current_state.md', 'tool/check.mjs']),
    { changedPathCount: 2, mobileSourceChanged: false },
  );
  for (const path of ['lib/main.dart', 'android/app/build.gradle.kts', 'assets/icon.png', 'pubspec.yaml']) {
    assert.throws(() => assertCurrentCandidateNoPostCandidateMobileSourceDrift([path]));
  }
});

test('collects committed, unstaged, staged and untracked drift after proving ancestry', () => {
  const calls = [];
  const outputs = new Map([
    ['diff --name-only aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa..HEAD', 'docs/a.md\ntool/a.mjs\n'],
    ['diff --name-only', 'tool/a.mjs\ntest/tool/a.test.mjs\n'],
    ['diff --cached --name-only', 'docs/staged.md\n'],
    ['ls-files --others --exclude-standard', 'tool/new.mjs\n'],
  ]);
  const paths = collectCurrentCandidateDriftPaths({
    root: '/tmp/repo',
    candidateCommit: 'a'.repeat(40),
    gitRunner(command, args) {
      calls.push([command, ...args]);
      if (args[0] === 'merge-base') return '';
      return outputs.get(args.join(' ')) ?? '';
    },
  });
  assert.deepEqual(paths, [
    'docs/a.md',
    'docs/staged.md',
    'test/tool/a.test.mjs',
    'tool/a.mjs',
    'tool/new.mjs',
  ]);
  assert.deepEqual(calls[0], [
    'git', 'merge-base', '--is-ancestor', 'a'.repeat(40), 'HEAD',
  ]);
});

test('summarizes only a complete sanitized read-only surface matrix', () => {
  const result = summarizeCurrentCandidateSurfaceMatrix(validInput());
  assert.equal(result.status, 'passed-session-navigation-legal-accessibility-restart-core');
  assert.equal(result.tests.mainNavigationDestinationCount, 5);
  assert.equal(result.tests.largeTextDestinationCount, 5);
  assert.equal(result.tests.exactPreviousFontScaleRestored, true);
  assert.equal(result.tests.minimumMainNavigationTouchTargetDp, 48);
  assert.equal(result.tests.processRestartCheckCount, 5);
  assert.equal(result.boundaries.supportSubmitted, false);
  assert.equal(result.boundaries.paymentEndpointCalled, false);
  assert.equal(JSON.stringify(result).includes('/Users/'), false);
});

test('rejects incomplete lanes, failed restoration and private evidence', () => {
  for (const mutate of [
    (value) => { value.navigation.tests = {}; },
    (value) => { value.legal.boundaries.professionalLegalApprovalPassed = true; },
    (value) => { value.largeText.configuration.exactPreviousFontScaleRestored = false; },
    (value) => { value.touchTargets.touchTargets.allTargetsAtLeast48Dp = false; },
    (value) => { value.restart.tests.processAbsentAfterForceStop.status = 'failed'; },
    (value) => { value.session.candidate.buildNumber = '2026090305'; },
    (value) => { value.deviceSummary.model = 'owner@example.invalid'; },
  ]) {
    const changed = validInput();
    mutate(changed);
    assert.throws(() => summarizeCurrentCandidateSurfaceMatrix(changed));
  }
});
