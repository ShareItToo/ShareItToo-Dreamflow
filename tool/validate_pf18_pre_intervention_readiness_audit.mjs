#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { validateExternalGateExecutionBoard } from './validate_external_gate_execution_board.mjs';
import { validateExternalGateSetup } from './validate_external_gate_setup.mjs';
import { validateSupportTestMatrixTraceability } from './validate_support_test_matrix_traceability.mjs';
import { validateWalidExternalGateActionPack } from './validate_walid_external_gate_action_pack.mjs';

const defaultRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath =
  'docs/evidence/external-gates/pre-intervention-readiness-audit-20260823.json';
const baselineCommit = '9cf0e6396d8b7bc596226f17a3e8d10d2f6b22af';
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
      fail(`PF18 private field is forbidden: ${[...trail, key].join('.')}`);
    }
    inspectPrivateShape(entry, [...trail, key]);
  }
}

function assertBaselineIsAncestor(root) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', baselineCommit, 'HEAD'], {
      cwd: root,
      stdio: ['ignore', 'ignore', 'ignore'],
    });
  } catch {
    fail('PF18 baseline is not available as an ancestor of the current checkout.');
  }
}

export function validatePf18PreInterventionReadinessAudit({
  root = defaultRoot,
  evidence = undefined,
  checkGitCommit = true,
} = {}) {
  const value = evidence ?? JSON.parse(readFileSync(resolve(root, evidencePath), 'utf8'));
  inspectPrivateShape(value);

  const setup = validateExternalGateSetup();
  const board = validateExternalGateExecutionBoard();
  const actionPack = validateWalidExternalGateActionPack();
  const support = validateSupportTestMatrixTraceability();

  if (value.schemaVersion !== 1
      || value.kind !== 'sit-pre-intervention-readiness-audit'
      || value.state !== 'autonomous-technical-lanes-exhausted-external-evidence-required'
      || value.capturedAt !== '2026-08-23T16:03:32Z') {
    fail('PF18 pre-intervention audit identity is invalid.');
  }
  if (!exact(value.repository, {
    branch: 'codex/master-workflow-20260808',
    baselineCommit,
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
      regressionRunId: 32649746483,
      regressionConclusion: 'success',
      codeqlRunId: 32649746475,
      codeqlConclusion: 'success',
      headSha: baselineCommit,
    },
  })) {
    fail('PF18 repository, PR or exact-CI baseline is invalid.');
  }
  if (checkGitCommit) assertBaselineIsAncestor(root);

  if (!exact(value.driveSource, {
    sitFolderId: '12ygBaPbfOg8LiLsVC3H9pv8pMxt65w1m',
    codexFolderId: '1YOBStKRnK1jOxWiCQz17MlGj7F3yNKWc',
    supportPacketFolderId: '1LtPEL2Lgo2TFnrA6iKxPOlAP8m-sF6fx',
    supportMatrixFileId: '1CcCqdsEVveiqoKJqZlA_iHKfZhttU5Le',
    supportMatrixSha256,
    repositoryHashMatchesDrive: true,
    scenarioCount: 167,
  })) {
    fail('PF18 Drive source binding is invalid.');
  }

  if (!exact(value.technicalPreparation, {
    requiredGateCount: setup.requiredGateCount,
    technicallyPreparedGateCount: setup.technicallyPreparedGateCount,
    externallyReadyGateCount: setup.externallyReadyGateCount,
    stageABlockerCount: board.stageABlockerCount,
    stageADeferredCount: board.stageADeferredCount,
    stageBOnlyBlockerCount: board.stageBOnlyBlockerCount,
    stageCOnlyBlockerCount: board.stageCOnlyBlockerCount,
    issuedReleaseTokenCount: board.issuedReleaseTokenCount,
    supportTechnicalCoverageCount: support.technicalCoverageCount,
    supportExternalEvidenceRequiredCount: support.externalEvidenceRequiredCount,
    supportExternalEvidencePresentCount: support.externalEvidencePresentCount,
    actionPackNextBlock: actionPack.nextActionBlock,
    nextWalidAnswerTokens: ['PF3_A1_QUOTE_REQUEST_PACK_GO', 'PF3_A1_HOLD'],
    releaseDecision: 'hold-no-go',
  })) {
    fail('PF18 aggregate gate or Support state is invalid.');
  }

  if (!exact(value.currentAndroidCandidate, {
    deviceReachable: true,
    physical: true,
    manufacturer: 'Google',
    model: 'Pixel 7 Pro',
    versionName: '1.0.0',
    buildNumber: '2026082302',
    delivery: 'direct-apk',
    exactInstalledApkBoundByPf17: true,
    fontScale: '0.85',
    accessibilityEnabled: false,
    enabledAccessibilityServices: false,
    containsRawDeviceIdentifier: false,
  })) {
    fail('PF18 current Android candidate observation is invalid or overstated.');
  }

  if (!exact(value.protectedFixture, {
    standardVaultPresent: false,
    newSyntheticAccountsCreated: false,
    authenticatedFixtureLinksPassedOnCurrentCandidate: false,
    reason: 'protected-synthetic-role-vault-not-transferred',
    safeResumeCondition: 'restore-protected-vault-or-provision-with-verified-email-and-deletion-chain',
    containsCredentials: false,
    containsAccountIdentifiers: false,
  })) {
    fail('PF18 protected-fixture boundary is invalid.');
  }

  if (!exact(value.deterministicReleaseReadiness, {
    technicalDebtExitContractCount: 21,
    technicalDebtOpenCount: 0,
    aggregateDraftValidatorsPassed: true,
    aggregateStrictValidatorsFailedClosed: true,
    fullRegressionPassedAtBaseline: true,
    codeqlPassedAtBaseline: true,
  })) {
    fail('PF18 deterministic release-readiness state is invalid.');
  }
  const debt = readFileSync(
    resolve(root, 'docs/operations/TECHNICAL_DEBT_RELEASE_READINESS.md'),
    'utf8',
  );
  if (!debt.includes('closed, 21/21 deterministic exit contracts retained')
      || (debt.match(/\| `TD-RR-\d{3}` \| \*\*CLOSED/gu) ?? []).length !== 21) {
    fail('PF18 technical-debt closure source has drifted.');
  }

  if (!exact(value.nextExternalGate, {
    id: 'legal_and_operator_approval',
    actionBlock: 'A1',
    walidPresenceRequired: true,
    costApprovalRequiredBeforeAnyQuotedCost: true,
    automaticContinuationAllowed: false,
  })) {
    fail('PF18 next external gate must remain the bounded A1 Walid decision.');
  }
  if (!allFalse(value.boundaries)) {
    fail('PF18 cannot claim an external mutation, release or merge.');
  }
  const serialized = JSON.stringify(value);
  if (/\/(?:Users|home)\/|@|password\s*[:=]|secret\s*[:=]|deviceSerial|androidId|\bimei\b|ssid\s*[:=]|bssid\s*[:=]|ipAddress/iu.test(serialized)) {
    fail('PF18 evidence contains private or secret-shaped content.');
  }

  return Object.freeze({
    status: value.state,
    technicallyPreparedGateCount: 11,
    externallyReadyGateCount: 0,
    supportTechnicalCoverageCount: 167,
    supportExternalEvidenceRequiredCount: 47,
    currentAndroidBuildNumber: '2026082302',
    protectedFixtureVaultPresent: false,
    nextActionBlock: 'A1',
    releaseDecision: 'hold-no-go',
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const ciMetadataOnly = process.argv.includes('--ci-metadata-only');
    const unknown = process.argv.slice(2).filter((value) => value !== '--ci-metadata-only');
    if (unknown.length > 0) fail(`Unknown argument: ${unknown[0]}`);
    if (ciMetadataOnly && process.env.CI !== 'true') {
      fail('PF18 CI metadata-only mode is restricted to CI.');
    }
    const result = validatePf18PreInterventionReadinessAudit({
      checkGitCommit: !ciMetadataOnly,
    });
    process.stdout.write(
      `PF18 pre-intervention audit valid: prepared=${result.technicallyPreparedGateCount}, `
      + `externalReady=${result.externallyReadyGateCount}, support=${result.supportTechnicalCoverageCount}, `
      + `externalSupport=${result.supportExternalEvidenceRequiredCount}, `
      + `candidate=${result.currentAndroidBuildNumber}, next=${result.nextActionBlock}, `
      + `decision=${result.releaseDecision}\n`,
    );
  } catch (error) {
    process.stderr.write(`${error?.message ?? 'PF18 pre-intervention audit validation failed.'}\n`);
    process.exitCode = 1;
  }
}
