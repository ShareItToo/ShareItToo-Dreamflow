#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { validateExternalGateExecutionBoard } from './validate_external_gate_execution_board.mjs';
import { validateExternalGateSetup } from './validate_external_gate_setup.mjs';
import { validateRw20bOnePlusRemoteTestPlan } from './validate_rw20b_oneplus_remote_test_plan.mjs';
import { validateRw20cOnePlusOwnerSmokeReadiness } from './validate_rw20c_oneplus_owner_smoke_readiness.mjs';
import { validateRw20dPlayDraftTruthReconciliation } from './validate_rw20d_play_draft_truth_reconciliation.mjs';
import { validateWalidExternalGateActionPack } from './validate_walid_external_gate_action_pack.mjs';

const defaultRoot = fileURLToPath(new URL('../', import.meta.url));
const defaultReconciliationPath =
  'store/google-play/rw20e-current-candidate-external-gate-reconciliation.json';
const forbiddenKey = /(password|passcode|secret|token|credential|private.?key|api.?key|otp|pin)$/iu;

const expectedRefs = Object.freeze({
  candidateManifest: 'store/google-play/rw20-current-internal-candidate-manifest.json',
  uploadHandoff: 'store/google-play/rw20-current-internal-upload-handoff.json',
  remoteTestPlan: 'store/google-play/rw20b-oneplus-remote-test-plan.json',
  ownerSmokeReadiness: 'store/google-play/rw20c-oneplus-owner-smoke-readiness.json',
  draftTruthReconciliation: 'store/google-play/rw20d-play-draft-truth-reconciliation.json',
  operation:
    'docs/operations/RW20E_CURRENT_PLAY_CANDIDATE_EXTERNAL_GATE_RECONCILIATION_2026-08-27.md',
});
const expectedConsumers = Object.freeze({
  technicalSetup: 'docs/evidence/external-gates/technical-setup-manifest.json',
  executionBoard: 'docs/evidence/external-gates/external-gate-execution-board.json',
  humanExecutionBoard: 'docs/operations/EXTERNAL_GATE_EXECUTION_BOARD.md',
  walidActionPack: 'docs/operations/WALID_EXTERNAL_GATE_ACTION_PACK.md',
});
const expectedHistoricalRefs = Object.freeze([
  'docs/evidence/external-gates/current-head-android-touch-target-remediation-2026082302.json',
  'docs/evidence/external-gates/current-candidate-read-only-regression-2026082302.json',
  'docs/evidence/external-gates/current-candidate-authenticated-safe-links-2026082302.json',
  'docs/evidence/external-gates/current-candidate-talkback-preflight-2026082302.json',
  'docs/evidence/external-gates/current-candidate-firebase-device-services-opt-in-2026082302.json',
  'docs/evidence/external-gates/current-candidate-talkback-settings-preflight-2026082302.json',
]);

function fail(message) {
  throw new Error(message);
}

function object(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be an object.`);
  }
  return value;
}

function same(actual, expected, label) {
  if (actual !== expected) fail(`${label} has drifted.`);
}

function sameArray(actual, expected, label) {
  if (!Array.isArray(actual) || JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`${label} has drifted.`);
  }
}

function assertSanitized(value, label = 'reconciliation') {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertSanitized(entry, `${label}[${index}]`));
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      if (forbiddenKey.test(key)) fail(`${label}.${key} is credential-shaped.`);
      assertSanitized(entry, `${label}.${key}`);
    }
    return;
  }
  if (typeof value !== 'string') return;
  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu.test(value)) {
    fail(`${label} contains an email address.`);
  }
  if (/https?:\/\//iu.test(value)) fail(`${label} contains a URL.`);
  if (/(?:^|\s)\/Users\/|[A-Z]:\\/u.test(value)) {
    fail(`${label} contains a private filesystem path.`);
  }
  if (/(?:^|\s)(?:\d{1,3}\.){3}\d{1,3}:\d+(?:\s|$)/u.test(value)) {
    fail(`${label} contains a network address.`);
  }
}

function readJson(root, reference, label) {
  if (typeof reference !== 'string'
      || !/^[a-zA-Z0-9_./-]+\.json$/u.test(reference)
      || reference.includes('..')) {
    fail(`${label} is not a safe repository JSON reference.`);
  }
  try {
    return JSON.parse(readFileSync(resolve(root, reference), 'utf8'));
  } catch (error) {
    fail(`${label} could not be read: ${error.message}`);
  }
}

function readText(root, reference, label) {
  if (typeof reference !== 'string'
      || !/^[a-zA-Z0-9_./-]+\.md$/u.test(reference)
      || reference.includes('..')) {
    fail(`${label} is not a safe repository Markdown reference.`);
  }
  try {
    return readFileSync(resolve(root, reference), 'utf8');
  } catch (error) {
    fail(`${label} could not be read: ${error.message}`);
  }
}

export function validateRw20eCurrentCandidateExternalGateReconciliation({
  root = defaultRoot,
  reconciliation = readJson(root, defaultReconciliationPath, 'RW20E reconciliation'),
  technicalSetup,
  executionBoard,
  humanExecutionBoard,
  walidActionPack,
  candidateManifest,
  rw20dReconciliation,
  operation,
} = {}) {
  assertSanitized(reconciliation);
  same(reconciliation.schemaVersion, 1, 'schemaVersion');
  same(reconciliation.kind,
    'rw20e-current-play-candidate-external-gate-reconciliation', 'kind');
  same(reconciliation.status,
    'reconciled-current-draft-and-historical-device-evidence-release-gated', 'status');
  same(reconciliation.recordedOn, '2026-08-27', 'recordedOn');

  const refs = object(reconciliation.references, 'references');
  for (const [key, expected] of Object.entries(expectedRefs)) {
    same(refs[key], expected, `references.${key}`);
  }
  const consumers = object(reconciliation.reconciledConsumers, 'reconciledConsumers');
  for (const [key, expected] of Object.entries(expectedConsumers)) {
    same(consumers[key], expected, `reconciledConsumers.${key}`);
  }

  technicalSetup ??= readJson(root, consumers.technicalSetup, 'technical setup');
  executionBoard ??= readJson(root, consumers.executionBoard, 'execution board');
  humanExecutionBoard ??= readText(root, consumers.humanExecutionBoard,
    'human execution board');
  walidActionPack ??= readText(root, consumers.walidActionPack, 'Walid action pack');
  candidateManifest ??= readJson(root, refs.candidateManifest, 'candidate manifest');
  rw20dReconciliation ??=
    readJson(root, refs.draftTruthReconciliation, 'RW20D reconciliation');
  operation ??= readText(root, refs.operation, 'RW20E operation');

  const setupResult = validateExternalGateSetup({ manifestOverride: technicalSetup });
  const boardResult = validateExternalGateExecutionBoard({
    boardOverride: executionBoard,
    canonicalOverride: technicalSetup,
  });
  const actionPackResult = validateWalidExternalGateActionPack({ packOverride: walidActionPack });
  const rw20bResult = validateRw20bOnePlusRemoteTestPlan({ root });
  const rw20cResult = validateRw20cOnePlusOwnerSmokeReadiness({ root });
  const rw20dResult = validateRw20dPlayDraftTruthReconciliation({
    root,
    reconciliation: rw20dReconciliation,
  });
  same(setupResult.externallyReadyGateCount, 0, 'setup externallyReadyGateCount');
  same(boardResult.releaseDecision, 'hold-no-go', 'board releaseDecision');
  same(actionPackResult.status, 'hold-no-go', 'action pack status');
  same(rw20bResult.nextRequired, 'GOOGLE_PLAY_INTERNAL_RELEASE_GO',
    'RW20B nextRequired');
  same(rw20cResult.executionResult, 'NOT_RUN', 'RW20C executionResult');
  same(rw20dResult.currentExactDraftUploaded, true, 'RW20D currentExactDraftUploaded');

  const current = object(reconciliation.currentCandidate, 'currentCandidate');
  const manifestCandidate = object(candidateManifest.candidate, 'candidateManifest.candidate');
  same(current.versionCode, manifestCandidate.versionCode, 'currentCandidate.versionCode');
  same(current.artifactSourceHead, candidateManifest.provenance?.artifactSourceHead,
    'currentCandidate.artifactSourceHead');
  same(current.playState, 'uploaded-inactive-internal-draft',
    'currentCandidate.playState');
  same(current.activeInternalVersionCode, '2026081509',
    'currentCandidate.activeInternalVersionCode');
  same(current.candidateExpectedInstalledOnOnePlus, false,
    'currentCandidate.candidateExpectedInstalledOnOnePlus');
  same(current.candidateDeviceResults, 'NOT_RUN', 'currentCandidate.candidateDeviceResults');
  same(current.nextRequiredGate, 'GOOGLE_PLAY_INTERNAL_RELEASE_GO',
    'currentCandidate.nextRequiredGate');
  same(current.ownerWindowGate, 'ONEPLUS_PERSONAL_DEVICE_NONDESTRUCTIVE_TEST_GO',
    'currentCandidate.ownerWindowGate');

  const historical = object(reconciliation.historicalPhysicalCandidate,
    'historicalPhysicalCandidate');
  same(historical.versionCode, '2026082302', 'historicalPhysicalCandidate.versionCode');
  same(historical.reasonEvidenceIsHistorical,
    'application-source-changed-before-current-candidate',
    'historicalPhysicalCandidate.reasonEvidenceIsHistorical');
  same(historical.evidenceTransfersToCurrentCandidate, false,
    'historicalPhysicalCandidate.evidenceTransfersToCurrentCandidate');
  sameArray(historical.evidenceRefs, expectedHistoricalRefs,
    'historicalPhysicalCandidate.evidenceRefs');

  const setupStore = technicalSetup.gates.find(({ id }) =>
    id === 'store_submission_and_closed_testing');
  const setupFirebase = technicalSetup.gates.find(({ id }) =>
    id === 'firebase_owner_terms_and_controls');
  const boardStore = executionBoard.gates.find(({ id }) =>
    id === 'store_submission_and_closed_testing');
  const boardFirebase = executionBoard.gates.find(({ id }) =>
    id === 'firebase_owner_terms_and_controls');
  for (const [label, gate] of [
    ['technicalSetup store', setupStore],
    ['executionBoard store', boardStore],
  ]) {
    same(gate.currentCandidateTruth?.versionCode, current.versionCode,
      `${label} current version`);
    same(gate.currentCandidateTruth?.candidateDeviceResults, 'NOT_RUN',
      `${label} current device result`);
    same(gate.historicalPhysicalCandidateBoundary?.versionCode, historical.versionCode,
      `${label} historical version`);
    same(gate.historicalPhysicalCandidateBoundary?.evidenceTransfersToCurrentCandidate,
      false, `${label} evidence transfer`);
    if (!expectedHistoricalRefs.filter((reference) => !reference.includes('firebase-device'))
      .every((reference) => gate.historicalPhysicalEvidenceRefs?.includes(reference))) {
      fail(`${label} is missing historical physical evidence.`);
    }
  }
  const firebaseHistoricalRef = expectedHistoricalRefs.find((reference) =>
    reference.includes('firebase-device-services-opt-in'));
  for (const [label, gate] of [
    ['technicalSetup Firebase', setupFirebase],
    ['executionBoard Firebase', boardFirebase],
  ]) {
    if (!gate.historicalPhysicalEvidenceRefs?.includes(firebaseHistoricalRef)
        || gate.currentEvidenceRefs?.includes(firebaseHistoricalRef)
        || gate.technicalEvidenceRefs?.includes(firebaseHistoricalRef)) {
      fail(`${label} does not isolate historical Firebase evidence.`);
    }
  }

  const assertions = object(reconciliation.assertions, 'assertions');
  if (!Object.values(assertions).every((value) => value === false)) {
    fail('RW20E current-candidate assertions must all remain false.');
  }
  const boundaries = object(reconciliation.boundaries, 'boundaries');
  if (!Object.values(boundaries).every((value) => value === false)) {
    fail('RW20E boundaries must all remain false.');
  }
  for (const marker of [
    '`2026082601`',
    '`2026082302`',
    'no physical pass transfers to the current candidate',
    '`NOT_RUN`',
    '`GOOGLE_PLAY_INTERNAL_RELEASE_GO`',
    '`ONEPLUS_PERSONAL_DEVICE_NONDESTRUCTIVE_TEST_GO`',
    'HOLD / NO-GO',
  ]) {
    if (!humanExecutionBoard.includes(marker)
        && !walidActionPack.includes(marker)
        && !operation.includes(marker)) {
      fail(`documentation marker missing: ${marker}`);
    }
  }

  const verification = object(reconciliation.verification, 'verification');
  if (verification.state === 'pending-exact-sha') {
    same(verification.implementationHead, null, 'verification.implementationHead');
    same(verification.localTechnicalRegression, 'pending',
      'verification.localTechnicalRegression');
    for (const key of ['githubRegression', 'githubCodeql', 'openCodeScanningAlerts']) {
      same(verification[key], null, `verification.${key}`);
    }
  } else if (verification.state === 'verified-exact-sha') {
    if (!/^[a-f0-9]{40}$/u.test(verification.implementationHead)) {
      fail('verification.implementationHead must be an exact commit SHA.');
    }
    same(verification.localTechnicalRegression,
      'passed-standard-parallelism-no-workaround',
      'verification.localTechnicalRegression');
    for (const key of ['githubRegression', 'githubCodeql']) {
      const run = object(verification[key], `verification.${key}`);
      if (!Number.isSafeInteger(run.runId) || run.runId <= 0) {
        fail(`verification.${key}.runId is invalid.`);
      }
      same(run.headSha, verification.implementationHead, `verification.${key}.headSha`);
      same(run.conclusion, 'success', `verification.${key}.conclusion`);
    }
    same(verification.githubRegression.publishApiImage, 'skipped',
      'verification.githubRegression.publishApiImage');
    same(verification.openCodeScanningAlerts, 0, 'verification.openCodeScanningAlerts');
  } else {
    fail('verification.state is invalid.');
  }
  same(verification.workaroundIntroduced, false, 'verification.workaroundIntroduced');

  for (const key of [
    'containsSecrets',
    'containsTesterIdentity',
    'containsOptInUrl',
    'containsRawDeviceIdentifier',
    'containsNetworkAddress',
  ]) same(reconciliation[key], false, key);

  return Object.freeze({
    status: reconciliation.status,
    currentCandidateVersionCode: current.versionCode,
    activeInternalVersionCode: current.activeInternalVersionCode,
    currentCandidateDeviceResults: current.candidateDeviceResults,
    historicalPhysicalVersionCode: historical.versionCode,
    evidenceTransfersToCurrentCandidate: false,
    nextRequiredGate: current.nextRequiredGate,
    verificationState: verification.state,
  });
}

const invokedDirectly = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invokedDirectly) {
  try {
    process.stdout.write(
      `${JSON.stringify(validateRw20eCurrentCandidateExternalGateReconciliation(), null, 2)}\n`,
    );
  } catch (error) {
    process.stderr.write(`ERROR: ${error?.message ?? 'RW20E validation failed.'}\n`);
    process.exitCode = 1;
  }
}
