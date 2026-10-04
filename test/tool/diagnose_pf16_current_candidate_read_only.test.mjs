import assert from 'node:assert/strict';
import test from 'node:test';

import {
  runPf16CurrentCandidateReadOnlyRegression,
} from '../../tool/diagnose_pf16_current_candidate_read_only.mjs';

const candidate = Object.freeze({
  applicationId: 'com.shareittoo.app',
  bundleId: 'com.shareittoo.app',
  versionName: '1.0.0',
  buildNumber: '2026082302',
  commit: '1b3e86ef1bcfa5a88b1baf965fdad00e9d64f54b',
  releaseChannel: 'internal',
  apiBaseUrl: 'https://staging.shareittoo.com/api/v1',
  firebaseConfigured: true,
  paymentMode: 'memory',
  stripeLivemode: false,
  android: Object.freeze({ apkSha256: 'a'.repeat(64) }),
});
const archive = Object.freeze({ apkSha256: candidate.android.apkSha256 });
const device = Object.freeze({ serial: 'private-device-id' });
const deviceSummary = Object.freeze({
  platform: 'android',
  physical: true,
  manufacturer: 'Google',
  model: 'Pixel 7 Pro',
  osVersion: '17',
  apiLevel: 37,
  securityPatch: '2026-07-05',
  containsRawDeviceIdentifier: false,
});
const capturedAt = '2026-08-23T15:00:00.000Z';
const navigationLabels = ['Entdecken', 'Mietkorb', 'Buchungen', 'Nachrichten', 'Mein SIT'];
const legalLabels = [
  'Impressum',
  'Datenschutz',
  'AGB',
  'Community‑Regeln',
  'Gebühren & Zahlungsbedingungen',
  'Stornierungsbedingungen',
  'Haftungsausschluss',
];

function candidateRecord({ restart = false } = {}) {
  return {
    applicationId: candidate.applicationId,
    bundleId: candidate.bundleId,
    versionName: candidate.versionName,
    buildNumber: candidate.buildNumber,
    commit: candidate.commit,
    releaseChannel: candidate.releaseChannel,
    apiBaseUrl: candidate.apiBaseUrl,
    firebaseConfigured: candidate.firebaseConfigured,
    paymentMode: candidate.paymentMode,
    stripeLivemode: candidate.stripeLivemode,
    ...(restart ? { apkSha256: candidate.android.apkSha256 } : {}),
  };
}

function installed() {
  return {
    packageIdentityVerified: true,
    versionName: candidate.versionName,
    buildNumber: candidate.buildNumber,
    delivery: 'direct-apk',
    apkSha256: candidate.android.apkSha256,
  };
}

function tests(labels) {
  return Object.fromEntries(labels.map((label) => [label, { status: 'passed' }]));
}

function diagnostics({ mutate = () => {} } = {}) {
  const results = {
    restart: {
      status: 'passed-bounded-process-restart-diagnostic',
      candidate: candidateRecord({ restart: true }),
      device: deviceSummary,
      boundaries: {},
    },
    session: {
      status: 'passed-bounded-authenticated-session-diagnostic',
      candidate: candidateRecord(),
      installed: installed(),
      device: deviceSummary,
      tests: tests(['authenticatedProfileAccess', 'coldStartSessionRestore']),
      boundaries: { directDiagnosticOnly: true },
    },
    offline: {
      status: 'passed-bounded-authenticated-session-diagnostic',
      candidate: candidateRecord(),
      installed: installed(),
      device: deviceSummary,
      tests: tests(['authenticatedProfileAccess', 'coldStartSessionRestore']),
      network: {
        condition: 'offline',
        onlinePrecondition: 'passed',
        wifiDisabled: true,
        mobileDataDisabled: true,
        connectivityGate: 'passed-no-connectivity',
        networkRestored: 'passed-online',
      },
      boundaries: { directDiagnosticOnly: true },
    },
    navigation: {
      status: 'passed-bounded-authenticated-main-navigation-diagnostic',
      candidate: candidateRecord(),
      installed: installed(),
      device: deviceSummary,
      tests: tests(navigationLabels),
      boundaries: {
        directDiagnosticOnly: true,
        authenticatedMainNavigationPassed: true,
      },
    },
    legal: {
      status: 'passed-bounded-authenticated-legal-route-diagnostic',
      candidate: candidateRecord(),
      installed: installed(),
      device: deviceSummary,
      tests: tests(legalLabels),
      boundaries: {
        directDiagnosticOnly: true,
        authenticatedLegalRoutesPassed: true,
      },
    },
    largeText: {
      status: 'passed-bounded-authenticated-large-text-main-navigation-diagnostic',
      candidate: candidateRecord(),
      installed: installed(),
      device: deviceSummary,
      configuration: {
        previousFontScale: 0.85,
        targetFontScale: 2,
        fontScaleAtLeast200PercentDuringDiagnostic: true,
        restoredFontScale: 0.85,
        exactPreviousFontScaleRestored: true,
      },
      tests: tests(navigationLabels),
      boundaries: {
        directDiagnosticOnly: true,
        authenticatedMainNavigationAtLargeTextPassed: true,
      },
    },
  };
  mutate(results);
  const calls = [];
  return {
    calls,
    restartDiagnostic: async (options) => {
      calls.push(['restart', options.networkCondition ?? null]);
      return results.restart;
    },
    authenticatedSessionDiagnostic: async (options) => {
      const label = options.networkCondition === 'offline' ? 'offline' : 'session';
      calls.push([label, options.networkCondition ?? null]);
      return results[label];
    },
    mainNavigationDiagnostic: async (options) => {
      calls.push(['navigation', options.networkCondition ?? null]);
      return results.navigation;
    },
    legalRoutesDiagnostic: async (options) => {
      calls.push(['legal', options.networkCondition ?? null]);
      return results.legal;
    },
    largeTextDiagnostic: async (options) => {
      calls.push(['large-text', options.networkCondition ?? null]);
      return results.largeText;
    },
  };
}

async function run(fakes) {
  return runPf16CurrentCandidateReadOnlyRegression({
    candidate,
    archive,
    device,
    deviceSummary,
    capturedAt,
    ...fakes,
  });
}

test('aggregates the exact candidate read-only physical regression', async () => {
  const fakes = diagnostics();
  const result = await run(fakes);
  assert.equal(result.status, 'passed-current-candidate-read-only-physical-regression');
  assert.equal(result.candidate.buildNumber, candidate.buildNumber);
  assert.equal(result.checks.mainNavigation.destinationCount, 5);
  assert.equal(result.checks.legalRoutes.documentCount, 7);
  assert.equal(result.checks.largeTextMainNavigation.restoredFontScale, 0.85);
  assert.equal(result.releaseGate.manualVisualReview, false);
  assert.equal(result.releaseGate.manualTalkBackTraversal, false);
  assert.equal(Object.values(result.boundaries).every((value) => value === false), true);
  assert.deepEqual(fakes.calls, [
    ['restart', null],
    ['session', null],
    ['offline', 'offline'],
    ['navigation', null],
    ['legal', null],
    ['large-text', null],
  ]);
});

test('rejects candidate drift in any child diagnostic', async () => {
  const fakes = diagnostics({
    mutate: (results) => {
      results.legal.candidate.buildNumber = '2026082301';
    },
  });
  await assert.rejects(run(fakes), /legal result is not bound/u);
});

test('rejects Store, mutation and manual-review overclaims', async () => {
  for (const [section, key] of [
    ['session', 'storeInstallationGateSatisfied'],
    ['navigation', 'cartMutationPerformed'],
    ['legal', 'platformWithdrawalOpened'],
    ['largeText', 'manualTalkBackTraversalPassed'],
  ]) {
    const fakes = diagnostics({
      mutate: (results) => {
        results[section].boundaries[key] = true;
      },
    });
    await assert.rejects(run(fakes), /boundaries are invalid or overstated/u);
  }
});

test('rejects incomplete offline restoration and font restoration', async () => {
  const network = diagnostics({
    mutate: (results) => {
      results.offline.network.networkRestored = 'pending';
    },
  });
  await assert.rejects(run(network), /offline transport restoration/u);

  const font = diagnostics({
    mutate: (results) => {
      results.largeText.configuration.exactPreviousFontScaleRestored = false;
    },
  });
  await assert.rejects(run(font), /large-text navigation or setting restoration/u);
});
