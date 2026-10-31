#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const defaultRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath =
  'docs/evidence/external-gates/current-head-android-touch-target-remediation-2026082302.json';
const expectedCommit = '1b3e86ef1bcfa5a88b1baf965fdad00e9d64f54b';
const expectedBuildNumber = '2026082302';

function fail(message) {
  throw new Error(message);
}

function exact(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function allFalse(value) {
  return value !== null
    && typeof value === 'object'
    && Object.values(value).every((entry) => entry === false);
}

export function validatePf14bCurrentHeadAndroidTouchTarget({
  root = defaultRoot,
  evidence = undefined,
  checkGitCommit = true,
} = {}) {
  const value = evidence ?? JSON.parse(readFileSync(resolve(root, evidencePath), 'utf8'));
  if (value.schemaVersion !== 1
      || value.kind !== 'sit-pf14b-current-head-android-touch-target-remediation-evidence'
      || value.version !== 'PF14B-ANDROID-2026-08-23.1'
      || value.authorizationSource
        !== 'SIT_MAXIMUM_LAUNCH_READINESS_AUTONOMY_V1_FREIGABE'
      || value.observedOn !== '2026-08-23'
      || value.status
        !== 'passed-signed-data-preserving-physical-touch-target-remediation') {
    fail('PF14B current-head Android evidence identity is invalid.');
  }
  if (!exact(value.source, {
    candidateCommit: expectedCommit,
    branch: 'codex/master-workflow-20260808',
    versionName: '1.0.0',
    buildNumber: expectedBuildNumber,
    releaseChannel: 'internal',
    apiBaseUrl: 'https://staging.shareittoo.com/api/v1',
    firebaseConfigured: true,
    googleLoginEnabled: true,
    appleLoginEnabled: false,
    facebookLoginEnabled: false,
    controlledCrashDiagnosticRunId: 'b11-android-2026082302',
  })) {
    fail('PF14B source binding is invalid.');
  }
  if (checkGitCommit) {
    try {
      execFileSync('git', ['cat-file', '-e', `${expectedCommit}^{commit}`], {
        cwd: root,
        stdio: 'ignore',
      });
    } catch {
      fail('PF14B candidate commit is unavailable.');
    }
  }
  if (!exact(value.signedCandidate, {
    applicationId: 'com.shareittoo.app',
    canonicalUploadCertificateVerified: true,
    binaryPrivacyScan: 'passed',
    aabSha256: 'a4267558d21cd0deb04e0d492c76fa90f2b20b67bd93b7e11162aea7d841a1a5',
    apkSha256: 'cae44832e76e7d4c7939ae0c6e14dbc63bbfd0ea481c037aa626036c278e9e1e',
    privacyReportSha256: '76b9e2d44a98bb77e6c03ffca5dbbff0cd43c0e72ff7c3c8d27cfd76f4428fcf',
    privateArchive: {
      available: true,
      fileCount: 4,
      allFilesOwnerOnly: true,
      overwriteAllowed: false,
      externalUploadPerformed: false,
      filesystemPathStored: false,
    },
    capacity: {
      fixedEffectiveCapacityFloorKiB: 5242880,
      beforeFreeKiB: 2625132,
      beforeGeneratedKiB: 3204460,
      afterFreeKiB: 5495736,
      afterGeneratedKiB: 54048,
      passed: true,
    },
  })) {
    fail('PF14B signed candidate or deterministic archive capacity is invalid.');
  }
  if (!exact(value.exactCommitVerification, {
    regressionRun: '32644493652',
    regressionSucceeded: true,
    codeqlRun: '32644493643',
    codeqlSucceeded: true,
    headCommitMatched: true,
    pullRequest: 7,
    pullRequestDraft: true,
    pullRequestOpen: true,
    pullRequestClean: true,
    pullRequestMerged: false,
  })) {
    fail('PF14B exact-commit CI or pull-request evidence is invalid.');
  }
  if (!exact(value.physicalDevice, {
    platform: 'android',
    physical: true,
    manufacturer: 'Google',
    model: 'Pixel 7 Pro',
    osVersion: '17',
    apiLevel: 37,
    securityPatch: '2026-07-05',
    containsRawDeviceIdentifier: false,
  })) {
    fail('PF14B physical-device summary is invalid.');
  }
  if (!exact(value.dataPreservingUpdate, {
    capturedAt: '2026-08-23T14:17:40.874Z',
    installedVersionBefore: '1.0.0+2026082301',
    installedVersionAfter: '1.0.0+2026082302',
    method: 'adb-install-no-streaming-replace',
    strictlyNewerBuildInstalled: true,
    candidateSignatureMatchedInstalledApp: true,
    installedCandidateHashMatches: true,
    firstInstallTimePreserved: true,
    ceDataInodePreserved: true,
    foregroundActivityVerified: true,
    uninstallUsed: false,
    dataResetUsed: false,
    downgradeUsed: false,
  })) {
    fail('PF14B data-preserving direct update is invalid.');
  }
  if (!exact(value.touchTargetDiagnostic, {
    capturedAt: '2026-08-23T14:18:17.060Z',
    previousFontScale: 0.85,
    targetFontScale: 2,
    fontScaleAtLeast200PercentDuringDiagnostic: true,
    restoredFontScale: 0.85,
    exactPreviousFontScaleRestored: true,
    displayWidthPixels: 1440,
    displayHeightPixels: 3120,
    effectiveDensityDpi: 476,
    targetCount: 5,
    minimumWidthDp: 96.81,
    minimumHeightDp: 70.92,
    allTargetsAtLeast48Dp: true,
    allTargetsWithinDisplay: true,
    allTargetsPairwiseNonOverlapping: true,
    allTargetsEnabledClickableAndroidButtons: true,
    rawHierarchyRetained: false,
  })) {
    fail('PF14B physical touch-target geometry or font restoration is invalid.');
  }
  if (!exact(value.technicalDebt, {
    id: 'TD-RR-021',
    status: 'closed',
    firstAttemptFailure: 'private-archive-copy-enospc',
    failedAttemptAcceptedAsEvidence: false,
    manualCleanupAcceptedAsEvidence: false,
    coldGeneratedLifecycleSourceBound: true,
    cleanupOnFailureSourceBound: true,
    archiveBeforeCleanupSourceBound: true,
    sameCommitSignedArchiveSucceeded: true,
    workaroundIsReleasePrerequisite: false,
  })) {
    fail('PF14B release-host Technical Debt is not closed deterministically.');
  }
  if (!exact(value.releaseGate, {
    signedInternalCandidate: true,
    dataPreservingDirectUpdate: true,
    physicalTouchTargetRemediation: true,
    googlePlayInternalDistribution: false,
    manualVisualReview: false,
    manualTalkBackTraversal: false,
    storeSubmissionAllowed: false,
    publicActivationAllowed: false,
    realMoneyAllowed: false,
    stageAReady: false,
    decision: 'hold-no-go',
  })) {
    fail('PF14B release gate must remain non-Store and HOLD / NO-GO.');
  }
  if (!allFalse(value.boundaries)) {
    fail('PF14B external, live and manual-review boundaries must all remain false.');
  }
  const serialized = JSON.stringify(value);
  if (/\/(?:Users|home)\/|deviceSerial|androidId|\bimei\b|signingCertificateSha256|@|password|token|ssid|bssid|ipAddress/iu.test(serialized)) {
    fail('PF14B evidence contains a private path, account, certificate or network identifier.');
  }
  return Object.freeze({
    status: value.status,
    buildNumber: expectedBuildNumber,
    candidateCommit: expectedCommit,
    exactCiPassed: true,
    privateArchiveVerified: true,
    dataPreservingDirectUpdate: true,
    targetCount: 5,
    minimumWidthDp: 96.81,
    minimumHeightDp: 70.92,
    exactPreviousFontScaleRestored: true,
    technicalDebtClosed: true,
    manualVisualReview: false,
    manualTalkBackTraversal: false,
    stageAReady: false,
    decision: 'hold-no-go',
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const ciMetadataOnly = process.argv.includes('--ci-metadata-only');
    const unknown = process.argv.slice(2).filter((value) => value !== '--ci-metadata-only');
    if (unknown.length > 0) fail(`Unknown argument: ${unknown[0]}`);
    if (ciMetadataOnly && process.env.CI !== 'true') {
      fail('PF14B CI metadata-only mode is restricted to CI.');
    }
    const result = validatePf14bCurrentHeadAndroidTouchTarget({
      checkGitCommit: !ciMetadataOnly,
    });
    process.stdout.write(
      `PF14B current-head Android touch-target remediation valid: `
      + `build=${result.buildNumber}, targets=${result.targetCount}, `
      + `minimum=${result.minimumWidthDp}x${result.minimumHeightDp}dp, `
      + `dataPreserved=${result.dataPreservingDirectUpdate}, `
      + `debtClosed=${result.technicalDebtClosed}, `
      + `visualReview=${result.manualVisualReview}, `
      + `talkBack=${result.manualTalkBackTraversal}, `
      + `stageAReady=${result.stageAReady}\n`,
    );
  } catch (error) {
    process.stderr.write(
      `${error?.message ?? 'PF14B current-head Android validation failed.'}\n`,
    );
    process.exitCode = 1;
  }
}
