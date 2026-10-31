#!/usr/bin/env node

import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  diagnoseN28CurrentCandidateAndroidAccountSupportSurfaces,
} from './diagnose_n28_current_candidate_android_account_support_surfaces.mjs';
import {
  diagnoseN28CurrentCandidateAndroidThemeBackgrounds,
} from './diagnose_n28_current_candidate_android_theme_backgrounds.mjs';
import {
  runCurrentCandidatePixelSurfaceMatrix,
} from './run_n28_current_candidate_pixel_surface_matrix.mjs';

function fail(message) {
  throw new Error(message);
}

function same(actual, expected, label) {
  if (actual !== expected) fail(`${label} does not match the complete candidate matrix.`);
}

function candidateIdentity(evidence, label) {
  const candidate = evidence?.candidate;
  if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) {
    fail(`${label} candidate identity is missing.`);
  }
  for (const [key, pattern] of [
    ['applicationId', /^com\.shareittoo\.app$/u],
    ['versionName', /^\d+\.\d+\.\d+$/u],
    ['buildNumber', /^\d{10}$/u],
    ['commit', /^[a-f0-9]{40}$/u],
    ['apkSha256', /^[a-f0-9]{64}$/u],
  ]) {
    if (typeof candidate[key] !== 'string' || !pattern.test(candidate[key])) {
      fail(`${label} candidate ${key} is invalid.`);
    }
  }
  return candidate;
}

export function summarizeCurrentCandidateCompletePixelSurfaceMatrix({
  core,
  theme,
  account,
  capturedAt,
}) {
  same(
    core?.kind,
    'sit-n28-current-candidate-pixel-surface-matrix-diagnostic',
    'core kind',
  );
  same(
    core?.status,
    'passed-session-navigation-legal-accessibility-restart-core',
    'core status',
  );
  same(
    theme?.kind,
    'sit-n28-current-candidate-pixel-theme-background-diagnostic',
    'theme kind',
  );
  same(theme?.status, 'captures-created-visual-review-pending', 'theme status');
  same(
    account?.kind,
    'sit-n28-current-candidate-pixel-account-support-surface-diagnostic',
    'account kind',
  );
  same(
    account?.status,
    'passed-account-support-read-only-provider-holds-confirmed',
    'account status',
  );
  const coreCandidate = candidateIdentity(core, 'core');
  for (const [label, evidence] of [['theme', theme], ['account', account]]) {
    const candidate = candidateIdentity(evidence, label);
    for (const key of ['applicationId', 'versionName', 'buildNumber', 'commit', 'apkSha256']) {
      same(candidate[key], coreCandidate[key], `${label} candidate ${key}`);
    }
  }
  same(core?.boundaries?.readOnlySurfaceMatrix, true, 'core read-only boundary');
  same(theme?.tests?.visualReview, 'pending-private-captures', 'private visual review');
  same(theme?.boundaries?.privateCapturesAssumedSensitive, true, 'capture sensitivity');
  same(theme?.boundaries?.privateCapturesCommitted, false, 'capture Git boundary');
  same(theme?.boundaries?.privateCapturesDistributionAllowed, false, 'capture distribution');
  same(theme?.boundaries?.backgroundPreferenceMutated, false, 'background mutation');
  same(account?.boundaries?.readOnly, true, 'account read-only boundary');
  for (const [label, value] of [
    ['core payment', core?.boundaries?.paymentEndpointCalled],
    ['theme payment', theme?.boundaries?.paymentEndpointCalled],
    ['account payment', account?.boundaries?.paymentEndpointCalled],
    ['core production', core?.boundaries?.productionChanged],
    ['theme production', theme?.boundaries?.productionChanged],
    ['account production', account?.boundaries?.productionChanged],
    ['core OnePlus', core?.boundaries?.onePlusContacted],
    ['theme OnePlus', theme?.boundaries?.onePlusContacted],
    ['account OnePlus', account?.boundaries?.onePlusContacted],
  ]) {
    same(value, false, label);
  }

  const result = {
    schemaVersion: 1,
    kind: 'android-current-private-candidate-complete-pixel-surface-matrix',
    status: 'passed-read-only-surface-matrix-private-visual-review-pending',
    capturedAt,
    candidate: {
      applicationId: coreCandidate.applicationId,
      versionName: coreCandidate.versionName,
      buildNumber: coreCandidate.buildNumber,
      commit: coreCandidate.commit,
      apkSha256: coreCandidate.apkSha256,
    },
    device: core.device,
    tests: {
      authenticatedColdStartSession: core.tests.authenticatedColdStartSession,
      mainNavigationDestinationCount: core.tests.mainNavigationDestinationCount,
      legalDocumentCount: core.tests.legalDocumentCount,
      largeTextDestinationCount: core.tests.largeTextDestinationCount,
      exactPreviousFontScaleRestored: core.tests.exactPreviousFontScaleRestored,
      minimumMainNavigationTouchTargetDp: core.tests.minimumMainNavigationTouchTargetDp,
      processRestartCheckCount: core.tests.processRestartCheckCount,
      systemDarkModeApplied: theme.tests.systemDarkModeApplied,
      systemLightModeApplied: theme.tests.systemLightModeApplied,
      backgroundOptionsReachable: theme.tests.backgroundOptionsReachable,
      accountSurfaceCount: account.tests.accountSurfaceCount,
      helpCenterReachable: account.tests.helpCenterReachable,
      supportEntryReachableWithoutSubmission:
        account.tests.supportEntryReachableWithoutSubmission,
      paymentProviderHoldVisible: account.tests.paymentProviderHoldVisible,
      payoutProviderHoldVisible: account.tests.payoutProviderHoldVisible,
      privateVisualReview: 'pending',
      privateCaptureSha256: {
        dark: theme.tests.darkCaptureSha256,
        light: theme.tests.lightCaptureSha256,
        backgrounds: theme.tests.backgroundCaptureSha256,
      },
    },
    boundaries: {
      readOnly: true,
      privateCapturesAssumedSensitive: true,
      privateCapturesCommitted: false,
      privateCapturesDistributionAllowed: false,
      supportSubmitted: false,
      messageSent: false,
      bookingCreated: false,
      listingMutated: false,
      accountMutated: false,
      backgroundPreferenceMutated: false,
      paymentEndpointCalled: false,
      productionChanged: false,
      googlePlayChanged: false,
      onePlusContacted: false,
      professionalLegalApprovalClaimed: false,
      accountIdentityRecorded: false,
      containsPersonalAccountData: false,
      containsCredential: false,
      containsRawDeviceIdentifier: false,
      containsPrivateFilesystemPath: false,
    },
  };
  const serialized = JSON.stringify(result);
  if (/(?:[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|\/Users\/|\+49[0-9]|BEGIN PRIVATE|\b(?:sk|rk)_(?:test|live)_|\bwhsec_)/iu.test(serialized)) {
    fail('Complete candidate surface evidence contains private or credential-shaped material.');
  }
  return result;
}

export async function runCurrentCandidateCompletePixelSurfaceMatrix({
  root,
  candidateDirectory,
  privateArtifactDirectory,
  adbPath = 'adb',
  capturedAt = new Date().toISOString(),
  coreRunner = runCurrentCandidatePixelSurfaceMatrix,
  themeRunner = diagnoseN28CurrentCandidateAndroidThemeBackgrounds,
  accountRunner = diagnoseN28CurrentCandidateAndroidAccountSupportSurfaces,
}) {
  const common = { root, candidateDirectory, adbPath, capturedAt };
  const core = await coreRunner(common);
  const theme = await themeRunner({ ...common, privateArtifactDirectory });
  const account = await accountRunner(common);
  return summarizeCurrentCandidateCompletePixelSurfaceMatrix({
    core,
    theme,
    account,
    capturedAt,
  });
}

function parseArguments(values) {
  let candidateDirectory = null;
  let privateArtifactDirectory = null;
  let adbPath = 'adb';
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === '--candidate-dir') {
      candidateDirectory = values[index + 1] ?? fail('--candidate-dir requires a path.');
      index += 1;
    } else if (values[index] === '--private-artifact-dir') {
      privateArtifactDirectory = values[index + 1]
        ?? fail('--private-artifact-dir requires a path.');
      index += 1;
    } else if (values[index] === '--adb') {
      adbPath = values[index + 1] ?? fail('--adb requires a path.');
      index += 1;
    } else {
      fail(`Unknown argument: ${values[index]}`);
    }
  }
  if (candidateDirectory === null) fail('--candidate-dir is required.');
  if (privateArtifactDirectory === null) {
    fail('--private-artifact-dir is required for sensitive screenshots.');
  }
  return {
    candidateDirectory: resolve(candidateDirectory),
    privateArtifactDirectory: resolve(privateArtifactDirectory),
    adbPath,
  };
}

async function run() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const result = await runCurrentCandidateCompletePixelSurfaceMatrix({
    root,
    ...parseArguments(process.argv.slice(2)),
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  run().catch((error) => {
    process.stderr.write(`ERROR: ${error?.message ?? 'Current candidate Pixel surface matrix failed.'}\n`);
    process.exitCode = 1;
  });
}
