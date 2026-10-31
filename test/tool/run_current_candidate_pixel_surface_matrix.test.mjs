import assert from 'node:assert/strict';
import test from 'node:test';

import {
  runCurrentCandidateCompletePixelSurfaceMatrix,
  summarizeCurrentCandidateCompletePixelSurfaceMatrix,
} from '../../tool/run_current_candidate_pixel_surface_matrix.mjs';

const identity = Object.freeze({
  applicationId: 'com.shareittoo.app',
  versionName: '1.0.0',
  buildNumber: '2026090407',
  commit: '8f66c9a823abbd01119c729d747a43ad4018a542',
  apkSha256: 'd'.repeat(64),
});

function validInput() {
  return {
    capturedAt: '2026-09-05T00:00:00.000Z',
    core: {
      kind: 'sit-n28-current-candidate-pixel-surface-matrix-diagnostic',
      status: 'passed-session-navigation-legal-accessibility-restart-core',
      candidate: { ...identity },
      device: { platform: 'android', physical: true, containsRawDeviceIdentifier: false },
      tests: {
        authenticatedColdStartSession: 'passed',
        mainNavigationDestinationCount: 5,
        legalDocumentCount: 7,
        largeTextDestinationCount: 5,
        exactPreviousFontScaleRestored: true,
        minimumMainNavigationTouchTargetDp: 48,
        processRestartCheckCount: 5,
      },
      boundaries: {
        readOnlySurfaceMatrix: true,
        paymentEndpointCalled: false,
        productionChanged: false,
        onePlusContacted: false,
      },
    },
    theme: {
      kind: 'sit-n28-current-candidate-pixel-theme-background-diagnostic',
      status: 'captures-created-visual-review-pending',
      candidate: { ...identity },
      tests: {
        systemDarkModeApplied: true,
        systemLightModeApplied: true,
        backgroundOptionsReachable: ['Dark 1', 'Dark 2', 'Light 1', 'Light 2'],
        visualReview: 'pending-private-captures',
        darkCaptureSha256: 'a'.repeat(64),
        lightCaptureSha256: 'b'.repeat(64),
        backgroundCaptureSha256: 'c'.repeat(64),
      },
      boundaries: {
        privateCapturesAssumedSensitive: true,
        privateCapturesCommitted: false,
        privateCapturesDistributionAllowed: false,
        backgroundPreferenceMutated: false,
        paymentEndpointCalled: false,
        productionChanged: false,
        onePlusContacted: false,
      },
    },
    account: {
      kind: 'sit-n28-current-candidate-pixel-account-support-surface-diagnostic',
      status: 'passed-account-support-read-only-provider-holds-confirmed',
      candidate: { ...identity },
      tests: {
        accountSurfaceCount: 9,
        helpCenterReachable: true,
        supportEntryReachableWithoutSubmission: true,
        paymentProviderHoldVisible: true,
        payoutProviderHoldVisible: true,
      },
      boundaries: {
        readOnly: true,
        paymentEndpointCalled: false,
        productionChanged: false,
        onePlusContacted: false,
      },
    },
  };
}

test('summarizes one exact candidate across all read-only Pixel lanes', () => {
  const result = summarizeCurrentCandidateCompletePixelSurfaceMatrix(validInput());
  assert.equal(result.candidate.buildNumber, '2026090407');
  assert.equal(result.tests.accountSurfaceCount, 9);
  assert.equal(result.tests.privateVisualReview, 'pending');
  assert.equal(result.boundaries.privateCapturesCommitted, false);
  assert.equal(result.boundaries.paymentEndpointCalled, false);
});

test('rejects candidate drift, unsafe boundaries and private output', () => {
  for (const mutate of [
    (value) => { value.theme.candidate.buildNumber = '2026090406'; },
    (value) => { value.account.boundaries.readOnly = false; },
    (value) => { value.theme.boundaries.backgroundPreferenceMutated = true; },
    (value) => { value.core.boundaries.paymentEndpointCalled = true; },
    (value) => { value.core.device.note = 'owner@example.invalid'; },
  ]) {
    const changed = validInput();
    mutate(changed);
    assert.throws(() => summarizeCurrentCandidateCompletePixelSurfaceMatrix(changed));
  }
});

test('runs core, theme and account lanes sequentially with one exact binding', async () => {
  const input = validInput();
  const calls = [];
  const common = {
    root: '/repo',
    candidateDirectory: '/private/candidate',
    privateArtifactDirectory: '/private/captures',
    adbPath: '/sdk/adb',
    capturedAt: input.capturedAt,
  };
  const result = await runCurrentCandidateCompletePixelSurfaceMatrix({
    ...common,
    coreRunner: async (args) => {
      calls.push(['core', args]);
      return input.core;
    },
    themeRunner: async (args) => {
      calls.push(['theme', args]);
      return input.theme;
    },
    accountRunner: async (args) => {
      calls.push(['account', args]);
      return input.account;
    },
  });
  assert.equal(result.status, 'passed-read-only-surface-matrix-private-visual-review-pending');
  assert.deepEqual(calls.map(([label]) => label), ['core', 'theme', 'account']);
  assert.equal(calls[0][1].privateArtifactDirectory, undefined);
  assert.equal(calls[1][1].privateArtifactDirectory, '/private/captures');
  assert.equal(calls[2][1].privateArtifactDirectory, undefined);
});
