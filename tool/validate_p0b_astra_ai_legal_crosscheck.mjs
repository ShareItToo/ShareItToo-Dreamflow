#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { validateP0bAiLegalPreassessment } from './validate_p0b_ai_legal_preassessment.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const packageRoot = 'assets/legal/de/p0b-astra-ai-crosscheck-2026-09-14.1';
const manifestPath = packageRoot + '/manifest.json';

const decisionRows = Object.freeze([
  ['operatorIdentityAndImprint', 'INSUFFICIENT_EVIDENCE', 'P0'],
  ['groupPrivateRentalContractModel', 'CONFIRM', 'P1'],
  ['groupPlatformContractScope', 'CORRECT', 'P0'],
  ['completeOfferAndCounterOfferSemantics', 'CORRECT', 'P0'],
  ['checkoutAndDurableConfirmation', 'CORRECT', 'P0'],
  ['withdrawalAndFixedPeriodRental', 'CORRECT', 'P0'],
  ['partialPerformanceAndDivisibilityConsequences', 'CORRECT', 'P0'],
  ['groupAndPositionCancellationRefundRules', 'CORRECT', 'P0'],
  ['sharedAppointmentAndPositionEvidenceEffect', 'CONFIRM', 'P1'],
  ['positionNeedsReviewAndUnrelatedRelease', 'CORRECT', 'P0'],
  ['groupPaymentAuthorizationAndProviderContract', 'INSUFFICIENT_EVIDENCE', 'P0'],
  ['positionLedgerRefundAndChargebackAllocation', 'CONFIRM', 'P1'],
  ['groupConfirmationAndReceiptIssuerContent', 'CORRECT', 'P0'],
  ['privacyPurposesLegalBasesAndRecipients', 'CORRECT', 'P0'],
  ['accountExportCompletenessAndCounterpartyProtection', 'CORRECT', 'P0'],
  ['retentionDeletionLegalHoldPeriodsAndTriggers', 'CORRECT', 'P0'],
  ['marketplaceTransparencyDsaAndModeration', 'CORRECT', 'P0'],
  ['businessGlobalConsumerAndTraderVariants', 'INSUFFICIENT_EVIDENCE', 'P1'],
]);

const expectedSourceInventory = Object.freeze({
  'assets/legal/de/p0b-ai-preassessment-2026-09-14.1/manifest.json': 'ff752ea1a9192d91d0940678d3ba403fda327cc25bf413eaaa59f8d89477552e',
  'assets/legal/de/p0b-ai-preassessment-2026-09-14.1/01_ai_rechtliche_vorpruefung.md': 'a1772c59c24158315f8e23e48bf81e4c225f26a6a1f8087bfb2339c0cc5f6e44',
  'assets/legal/de/p0b-ai-preassessment-2026-09-14.1/02_decision_matrix.json': 'c715cc28e50e6f47d92d5ac7c8143a02eeca7d6ef4dd535d20490127ee5b333a',
  'assets/legal/de/p0b-ai-preassessment-2026-09-14.1/03_astra_crosscheck_scope.md': 'fcbdaf3fb545a351617aa35411b2273210e012775665cad2b821441b5589092d',
});

const expectedArtifactInventory = Object.freeze({
  [packageRoot + '/01_crosscheck_result.md']: '5f78aaa93a94d4b0d8e5d698a603f2b8b9d33cf4b07c81f81c7ad5ee608f2487',
  [packageRoot + '/02_verdict_matrix.json']: 'f1c66c993d966b0d6c83c1e7b5201e7da9de9d515b53aa77f10aa6faffeb48d8',
});

function fail(message) {
  throw new Error('P0B-L3 Astra AI legal crosscheck ' + message);
}

function exact(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(label + ' is invalid.');
  }
}

function digest(repositoryRoot, path) {
  return createHash('sha256')
    .update(readFileSync(resolve(repositoryRoot, path)))
    .digest('hex');
}

export function validateP0bAstraAiLegalCrosscheck({
  manifest,
  matrix,
  report,
  repositoryRoot = root,
} = {}) {
  validateP0bAiLegalPreassessment({ repositoryRoot });
  const value = manifest
    ?? JSON.parse(readFileSync(resolve(repositoryRoot, manifestPath), 'utf8'));
  const matrixValue = matrix
    ?? JSON.parse(readFileSync(resolve(repositoryRoot, value?.result?.verdictMatrix ?? ''), 'utf8'));
  const reportText = report
    ?? readFileSync(resolve(repositoryRoot, value?.result?.report ?? ''), 'utf8');

  exact(value?.schemaVersion, 1, 'schema version');
  exact(value?.kind, 'sit-p0b-astra-ai-legal-crosscheck', 'kind');
  exact(value?.packageVersion,
    'P0B-L3-ASTRA-AI-CROSSCHECK-2026-09-14.1', 'package version');
  exact(value?.status,
    'AI_CROSSCHECK_PARTIAL_NORMALIZED_OUTCOME_CAPTURE', 'status');
  exact(value?.jurisdiction, 'DE', 'jurisdiction');
  exact(value?.reviewedAt, '2026-09-14', 'reviewed date');
  exact(value?.sourceAssessment, {
    packageVersion: 'P0B-L2-AI-PREASSESSMENT-2026-09-14.1',
    branch: 'codex/master-workflow-20260808',
    sourceCommit: '2db2b90aab385aeba527fd559a33c269c8dc00cf',
    sourceInventory: expectedSourceInventory,
  }, 'source assessment');
  for (const [path, expected] of Object.entries(expectedSourceInventory)) {
    exact(digest(repositoryRoot, path), expected, 'source artifact ' + path);
  }

  exact(value?.result, {
    report: packageRoot + '/01_crosscheck_result.md',
    verdictMatrix: packageRoot + '/02_verdict_matrix.json',
    outcome: 'CORRECTIONS_REQUIRED',
    resultCapture: 'partial-normalized-outcome-only-raw-response-not-persisted',
    decisionDetailComplete: false,
    decisionCount: 18,
    verdictCounts: { CONFIRM: 3, CORRECT: 12, INSUFFICIENT_EVIDENCE: 3 },
    priorityCounts: { P0: 14, P1: 4 },
  }, 'result');
  exact(value?.taskProvenance, {
    taskId: '01a09e1b-0c59-71d2-b323-8c79b0b73bbd',
    taskTitle: 'Astra Ultra für SIT am Macbook',
    executionClass: 'remote-macbook-codex-task',
    requestedReviewer: 'Astra Ultra',
    backendModelIdentityCaptured: false,
  }, 'task provenance');
  exact(value?.gates, {
    crosscheckTaskCompleted: true,
    crosscheckScopeComplete: false,
    normalizedOutcomeRecorded: true,
    rawResponsePersisted: false,
    ownerAdoptionRecorded: false,
    professionalLegalApproval: false,
    publicActivationAllowed: false,
    productionProvisioningAllowed: false,
    storeSubmissionAllowed: false,
    realMoneyAllowed: false,
    g3MultiItemPubliclyAvailable: false,
  }, 'gates');
  exact(value?.officialSourceScope,
    'day-end-correction-and-section-193-caveat-only', 'official source scope');
  exact(value?.officialSources, [
    'https://www.gesetze-im-internet.de/bgb/__187.html',
    'https://www.gesetze-im-internet.de/bgb/__188.html',
    'https://www.gesetze-im-internet.de/bgb/__355.html',
    'https://www.gesetze-im-internet.de/bgb/__193.html',
  ], 'official sources');
  exact(value?.artifactInventory, expectedArtifactInventory, 'artifact inventory');
  for (const [path, expected] of Object.entries(expectedArtifactInventory)) {
    exact(digest(repositoryRoot, path), expected, 'result artifact ' + path);
  }

  exact(matrixValue?.schemaVersion, 1, 'matrix schema');
  exact(matrixValue?.packageVersion, value.packageVersion, 'matrix package');
  exact(matrixValue?.status, value.status, 'matrix status');
  exact(matrixValue?.jurisdiction, 'DE', 'matrix jurisdiction');
  exact(matrixValue?.reviewedAt, value.reviewedAt, 'matrix reviewed date');
  exact(matrixValue?.reviewedSourceCommit,
    value.sourceAssessment.sourceCommit, 'matrix source commit');
  exact(matrixValue?.outcome, 'CORRECTIONS_REQUIRED', 'matrix outcome');
  exact(matrixValue?.resultCapture,
    'partial-normalized-outcome-only-raw-response-not-persisted', 'result capture');
  exact(matrixValue?.decisionDetailComplete, false, 'decision detail completeness');
  exact(matrixValue?.crosscheckScopeComplete, false, 'crosscheck scope completeness');
  exact(matrixValue?.rawResponsePersisted, false, 'raw response persistence');
  for (const field of [
    'professionalLegalApproval',
    'ownerAdoptionRecorded',
    'publicActivationAllowed',
    'productionProvisioningAllowed',
    'storeSubmissionAllowed',
    'realMoneyAllowed',
  ]) exact(matrixValue?.[field], false, 'matrix ' + field);
  exact(matrixValue?.verdictCounts, value.result.verdictCounts, 'verdict counts');
  exact(matrixValue?.priorityCounts, value.result.priorityCounts, 'priority counts');
  if (!Array.isArray(matrixValue?.decisions)) fail('decision matrix is missing.');
  exact(matrixValue.decisions.map((entry) => [
    entry.key,
    entry.verdict,
    entry.priority,
  ]), decisionRows, 'decision rows');
  if (matrixValue.decisions.some((entry) => entry.professionalStatus !== 'open')) {
    fail('professional decisions must remain open.');
  }
  exact(matrixValue?.insufficientEvidenceKeys, decisionRows
    .filter(([, verdict]) => verdict === 'INSUFFICIENT_EVIDENCE')
    .map(([key]) => key), 'insufficient evidence keys');

  for (const marker of [
    'anwaltliche oder sonstige professionelle Rechtsfreigabe',
    '2db2b90aab385aeba527fd559a33c269c8dc00cf',
    'CONFIRM`: 3',
    'CORRECT`: 12',
    'INSUFFICIENT_EVIDENCE`: 3',
    'vollständige rohe Modellantwort',
    'nicht im Repository persistiert',
    'nicht unabhängig',
    '01a09e1b-0c59-71d2-b323-8c79b0b73bbd',
    'noch keine vollständige gesetzliche Frist-Closure',
    '§ 193 BGB',
    'ASTRA_CROSSCHECK_RESULT=CORRECTIONS_REQUIRED',
    'ASTRA_CROSSCHECK_SCOPE_COMPLETE=false',
  ]) {
    if (!reportText.includes(marker)) fail('result report is incomplete.');
  }

  const serialized = JSON.stringify({ value, matrixValue, reportText });
  if (/\/(?:Users|home)\/|@(?:gmail|shareittoo)|\+49\d|BEGIN PRIVATE|\b(?:sk|rk)_(?:test|live)_|\bwhsec_|clientSecret|privateKeyValue/iu.test(serialized)) {
    fail('package contains private or secret-shaped data.');
  }

  return Object.freeze({
    packageVersion: value.packageVersion,
    sourceCommit: value.sourceAssessment.sourceCommit,
    outcome: value.result.outcome,
    verdictCounts: value.result.verdictCounts,
    priorityCounts: value.result.priorityCounts,
    professionalLegalApproval: false,
    realMoneyAllowed: false,
    crosscheckScopeComplete: false,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    process.stdout.write(JSON.stringify(validateP0bAstraAiLegalCrosscheck()) + '\n');
  } catch (error) {
    process.stderr.write((error?.message ?? 'P0B-L3 validation failed.') + '\n');
    process.exitCode = 1;
  }
}
