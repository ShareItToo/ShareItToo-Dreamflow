#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { validateExternalGateExecutionBoard } from './validate_external_gate_execution_board.mjs';
import { validateExternalGateSetup } from './validate_external_gate_setup.mjs';
import { validatePf21CurrentCandidateTalkBackSettingsPreflight } from './validate_pf21_current_candidate_talkback_settings_preflight.mjs';
import { validateSupportTestMatrixTraceability } from './validate_support_test_matrix_traceability.mjs';
import { validateWalidExternalGateActionPack } from './validate_walid_external_gate_action_pack.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath =
  'docs/evidence/external-gates/final-non-live-launch-readiness-checkpoint-20260823.json';
const packageHead = 'b77933939adcf5825c00d680ab00759a5969bf59';
const supportMatrixSha256 =
  '83cc25371f24b3486230f3ac4e2b7e9c26c49a48bd5aca22a5449636c9ffc6d3';

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

function inspectPrivateShape(value, trail = []) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => inspectPrivateShape(entry, [...trail, index]));
    return;
  }
  if (value === null || typeof value !== 'object') return;
  for (const [key, entry] of Object.entries(value)) {
    if (/^(?:password|secret|token|email|accountid|credential|personname|deviceid|serial|ssid|bssid|ipaddress)$/iu.test(key)) {
      fail(`PF22 private field is forbidden: ${[...trail, key].join('.')}`);
    }
    inspectPrivateShape(entry, [...trail, key]);
  }
}

function assertPackageHeadIsAncestor(repositoryRoot) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', packageHead, 'HEAD'], {
      cwd: repositoryRoot,
      stdio: ['ignore', 'ignore', 'ignore'],
    });
  } catch {
    fail('PF22 package head is not available as an ancestor of the current checkout.');
  }
}

export function validatePf22FinalNonLiveLaunchReadinessCheckpoint({
  repositoryRoot = root,
  evidence,
  checkGitCommit = true,
} = {}) {
  const value = evidence ?? JSON.parse(readFileSync(resolve(repositoryRoot, evidencePath), 'utf8'));
  inspectPrivateShape(value);

  const setup = validateExternalGateSetup();
  const board = validateExternalGateExecutionBoard();
  const support = validateSupportTestMatrixTraceability();
  const actionPack = validateWalidExternalGateActionPack();
  const pf21 = validatePf21CurrentCandidateTalkBackSettingsPreflight({
    repositoryRoot,
    checkGitCommit,
  });

  if (value.schemaVersion !== 1
      || value.kind !== 'sit-final-non-live-launch-readiness-checkpoint'
      || value.state !== 'autonomous-non-live-lanes-complete-external-evidence-required'
      || value.capturedAt !== '2026-08-23T18:45:49Z') {
    fail('PF22 checkpoint identity is invalid.');
  }
  if (!exact(value.repository, {
    branch: 'codex/master-workflow-20260808',
    packageHead,
    originSynchronizedAtCapture: true,
    workingTreeCleanAtCapture: true,
    pullRequest: {
      number: 7,
      state: 'OPEN',
      draft: true,
      mergeable: 'MERGEABLE',
      mergeStateStatus: 'CLEAN',
      merged: false,
    },
    exactCi: {
      regressionRunId: 32658613478,
      regressionConclusion: 'success',
      codeqlRunId: 32658613486,
      codeqlConclusion: 'success',
      headSha: packageHead,
    },
    credentialReadiness: {
      authenticated: true,
      secureKeyring: true,
      gitProtocol: 'https',
      gitCredentialHelperConfigured: true,
      containsToken: false,
      containsAccountIdentity: false,
    },
  })) {
    fail('PF22 repository, PR, CI or credential state is invalid.');
  }
  if (checkGitCommit) assertPackageHeadIsAncestor(repositoryRoot);

  if (!exact(value.driveSource, {
    codexFolderId: '1YOBStKRnK1jOxWiCQz17MlGj7F3yNKWc',
    latestCommand: '00_NEXT_COMMAND_G3A_APPROVED_V2.4.txt',
    latestCommandModifiedAt: '2026-08-20T19:14:03.994Z',
    newerCommandPresent: false,
    supportPacketFolderId: '1LtPEL2Lgo2TFnrA6iKxPOlAP8m-sF6fx',
    supportPacketItemCount: 17,
    supportMatrixFileId: '1CcCqdsEVveiqoKJqZlA_iHKfZhttU5Le',
    supportMatrixModifiedAt: '2026-08-20T22:29:02.738Z',
    supportMatrixSha256,
    repositoryHashMatchesDrive: true,
    scenarioCount: 167,
  })) {
    fail('PF22 Drive or Support source binding is invalid.');
  }

  if (!exact(value.technicalReadiness, {
    requiredGateCount: setup.requiredGateCount,
    technicallyPreparedGateCount: setup.technicallyPreparedGateCount,
    externallyReadyGateCount: setup.externallyReadyGateCount,
    supportTechnicalCoverageCount: support.technicalCoverageCount,
    supportExternalEvidenceRequiredCount: support.externalEvidenceRequiredCount,
    supportExternalEvidencePresentCount: support.externalEvidencePresentCount,
    technicalDebtExitContractCount: 21,
    technicalDebtOpenCount: 0,
    safeIndependentLaneCount: 0,
    releaseDecision: 'hold-no-go',
  })) {
    fail('PF22 aggregate technical-readiness state is invalid.');
  }
  if (actionPack.nextActionBlock !== 'A1'
      || board.externallyReadyGateCount !== 0
      || board.issuedReleaseTokenCount !== 0) {
    fail('PF22 requires the fail-closed aggregate action-pack baseline.');
  }

  if (!exact(value.regression, {
    localFullGatePassed: true,
    localMode: 'ci-metadata-candidate-rollover',
    backendAndPostgresPassed: true,
    flutterPassedTestCount: 387,
    flutterDocumentedSkipCount: 1,
    webAndWasmBuildPassed: true,
    loopbackSmokePassed: true,
    androidDirectGradleTaskCount: 448,
    androidBuildPassed: true,
    androidBinaryMinSdk: 24,
    capacityGuardPassed: true,
    temporaryWorkaroundUsedAsAcceptanceEvidence: false,
  })) {
    fail('PF22 deterministic regression state is invalid.');
  }
  if (!exact(value.securityAndDependencies, {
    backendProductionAuditKnownVulnerabilityCount: 0,
    backendFullAuditKnownVulnerabilityCount: 0,
    codeqlPassed: true,
    knownOpenHighCriticalFindingCount: 0,
    unassessedHighCriticalFindingCount: 0,
    broadDependencyUpgradePerformed: false,
    deterministicCompatibilityContractsRetained: true,
  })) {
    fail('PF22 Security or dependency state is invalid.');
  }

  if (!exact(value.currentAndroidCandidate, {
    deviceReachable: true,
    physical: true,
    manufacturer: 'Google',
    model: 'Pixel 7 Pro',
    osVersion: '17',
    versionName: '1.0.0',
    buildNumber: pf21.buildNumber,
    candidateCommit: pf21.candidateCommit,
    delivery: 'direct-apk',
    privateArchiveVerified: true,
    exactInstalledApkVerified: pf21.exactInstalledApkVerified,
    firebaseConfigured: true,
    androidSigningCanonical: true,
    accessibilityEnabledAfterDiagnostics: false,
    touchExplorationEnabledAfterDiagnostics: false,
    manualTalkBackTraversalPassed: pf21.manualTalkBackTraversalPassed,
    containsRawDeviceIdentifier: false,
  })) {
    fail('PF22 current Android candidate is invalid or overstated.');
  }
  if (!exact(value.platformReadiness, {
    androidBoundedInternalCandidateReady: true,
    webBuildReady: true,
    firebaseAndroidConfigValid: true,
    firebaseIosConfigValid: true,
    firebaseAnalyticsEnabled: false,
    firebaseOwnerConsoleControlsAccepted: false,
    iosFullXcodePresent: false,
    iosCocoaPodsPresent: false,
    iosDeferredForStageA: true,
    googlePlayPrivateDistributionPassed: false,
    paymentMode: 'memory',
    realMoneyEnabled: false,
  })) {
    fail('PF22 platform boundary is invalid or overstated.');
  }

  if (!exact(value.remainingExternalGates, {
    stageABlockerIds: [
      'legal_and_operator_approval',
      'operations_roles_and_absence',
      'firebase_owner_terms_and_controls',
      'privacy_retention_and_legal_hold',
      'store_submission_and_closed_testing',
      'pilot_region_roster_and_scope',
      'explicit_activation_decision',
    ],
    stageADeferredIds: [
      'ios_apple_signing_and_device',
      'support_evidence_scanner_and_upload_policy',
    ],
    stageBOnlyIds: ['psp_contract_and_sandbox_e2e'],
    stageCOnlyIds: ['economics_and_cost_inputs'],
    issuedReleaseTokenCount: 0,
  })
      || board.stageABlockerCount !== value.remainingExternalGates.stageABlockerIds.length
      || board.stageADeferredCount !== value.remainingExternalGates.stageADeferredIds.length
      || board.stageBOnlyBlockerCount !== value.remainingExternalGates.stageBOnlyIds.length
      || board.stageCOnlyBlockerCount !== value.remainingExternalGates.stageCOnlyIds.length) {
    fail('PF22 remaining external-gate classification is invalid.');
  }
  if (!exact(value.nextExternalGate, {
    id: 'legal_and_operator_approval',
    actionBlock: 'A1',
    acceptedAnswerTokens: ['PF3_A1_QUOTE_REQUEST_PACK_GO', 'PF3_A1_HOLD'],
    walidPresenceRequired: true,
    costApprovalRequiredBeforeAnyQuotedCost: true,
    automaticExternalContinuationAllowed: false,
  })) {
    fail('PF22 next external gate must remain the bounded A1 decision.');
  }

  const debt = readFileSync(
    resolve(repositoryRoot, 'docs/operations/TECHNICAL_DEBT_RELEASE_READINESS.md'),
    'utf8',
  );
  if (!debt.includes('closed, 21/21 deterministic exit contracts retained')
      || (debt.match(/\| `TD-RR-\d{3}` \| \*\*CLOSED/gu) ?? []).length !== 21) {
    fail('PF22 technical-debt closure source has drifted.');
  }
  if (!allFalse(value.boundaries)) {
    fail('PF22 cannot claim an external mutation, release or merge.');
  }
  const serialized = JSON.stringify(value);
  if (/\/(?:Users|home)\/|@|password\s*[:=]|secret\s*[:=]|deviceSerial|androidId|\bimei\b|ssid\s*[:=]|bssid\s*[:=]|ipAddress/iu.test(serialized)) {
    fail('PF22 evidence contains private or secret-shaped content.');
  }

  return Object.freeze({
    status: value.state,
    packageHead,
    technicallyPreparedGateCount: setup.technicallyPreparedGateCount,
    externallyReadyGateCount: setup.externallyReadyGateCount,
    supportTechnicalCoverageCount: support.technicalCoverageCount,
    supportExternalEvidenceRequiredCount: support.externalEvidenceRequiredCount,
    currentAndroidBuildNumber: pf21.buildNumber,
    safeIndependentLaneCount: value.technicalReadiness.safeIndependentLaneCount,
    nextActionBlock: value.nextExternalGate.actionBlock,
    releaseDecision: value.technicalReadiness.releaseDecision,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const ciMetadataOnly = process.argv.includes('--ci-metadata-only');
    const unknown = process.argv.slice(2).filter((value) => value !== '--ci-metadata-only');
    if (unknown.length > 0) fail(`Unknown argument: ${unknown[0]}`);
    if (ciMetadataOnly && process.env.CI !== 'true') {
      fail('PF22 CI metadata-only mode is restricted to CI.');
    }
    const result = validatePf22FinalNonLiveLaunchReadinessCheckpoint({
      checkGitCommit: !ciMetadataOnly,
    });
    process.stdout.write(
      `PF22 final non-live checkpoint valid: prepared=${result.technicallyPreparedGateCount}, `
      + `externalReady=${result.externallyReadyGateCount}, support=${result.supportTechnicalCoverageCount}, `
      + `externalSupport=${result.supportExternalEvidenceRequiredCount}, `
      + `candidate=${result.currentAndroidBuildNumber}, safeLanes=${result.safeIndependentLaneCount}, `
      + `next=${result.nextActionBlock}, decision=${result.releaseDecision}\n`,
    );
  } catch (error) {
    process.stderr.write(`${error?.message ?? 'PF22 final non-live checkpoint validation failed.'}\n`);
    process.exitCode = 1;
  }
}
