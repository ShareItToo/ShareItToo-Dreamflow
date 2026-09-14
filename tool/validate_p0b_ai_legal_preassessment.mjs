#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const packageRoot = 'assets/legal/de/p0b-ai-preassessment-2026-09-14.1';
const manifestPath = `${packageRoot}/manifest.json`;

const decisionKeys = Object.freeze([
  'operatorIdentityAndImprint',
  'groupPrivateRentalContractModel',
  'groupPlatformContractScope',
  'completeOfferAndCounterOfferSemantics',
  'checkoutAndDurableConfirmation',
  'withdrawalAndFixedPeriodRental',
  'partialPerformanceAndDivisibilityConsequences',
  'groupAndPositionCancellationRefundRules',
  'sharedAppointmentAndPositionEvidenceEffect',
  'positionNeedsReviewAndUnrelatedRelease',
  'groupPaymentAuthorizationAndProviderContract',
  'positionLedgerRefundAndChargebackAllocation',
  'groupConfirmationAndReceiptIssuerContent',
  'privacyPurposesLegalBasesAndRecipients',
  'accountExportCompletenessAndCounterpartyProtection',
  'retentionDeletionLegalHoldPeriodsAndTriggers',
  'marketplaceTransparencyDsaAndModeration',
  'businessGlobalConsumerAndTraderVariants',
]);

const allowedAiDecisions = new Set([
  'ai_recommended',
  'ai_recommended_with_changes',
  'ai_hold_external_fact',
]);

function fail(message) {
  throw new Error(`P0B-L2 AI legal preassessment ${message}`);
}

function exact(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`${label} is invalid.`);
  }
}

function digest(repositoryRoot, path) {
  return createHash('sha256')
    .update(readFileSync(resolve(repositoryRoot, path)))
    .digest('hex');
}

export function validateP0bAiLegalPreassessment({
  manifest,
  matrix,
  repositoryRoot = root,
} = {}) {
  const value = manifest
    ?? JSON.parse(readFileSync(resolve(repositoryRoot, manifestPath), 'utf8'));
  const matrixValue = matrix
    ?? JSON.parse(readFileSync(
      resolve(repositoryRoot, value?.assessment?.decisionMatrix ?? ''),
      'utf8',
    ));

  exact(value?.schemaVersion, 1, 'schema version');
  exact(value?.kind, 'sit-p0b-ai-legal-preassessment', 'kind');
  exact(value?.packageVersion,
    'P0B-L2-AI-PREASSESSMENT-2026-09-14.1', 'package version');
  exact(value?.status,
    'AI_PREASSESSMENT_PENDING_INDEPENDENT_AI_CROSSCHECK', 'status');
  exact(value?.jurisdiction, 'DE', 'jurisdiction');
  exact(value?.assessment?.decisionCount, 18, 'decision count');
  exact(value?.assessment?.decisionCounts, {
    ai_recommended: 1,
    ai_recommended_with_changes: 13,
    ai_hold_external_fact: 4,
  }, 'decision counts');

  const gates = value?.gates ?? {};
  const expectedGateKeys = [
    'independentAstraCrosscheckComplete',
    'ownerAdoptionRecorded',
    'professionalLegalApproval',
    'publicActivationAllowed',
    'productionProvisioningAllowed',
    'storeSubmissionAllowed',
    'realMoneyAllowed',
    'g3MultiItemPubliclyAvailable',
  ];
  exact(Object.keys(gates), expectedGateKeys, 'gate keys');
  if (Object.values(gates).some((entry) => entry !== false)) {
    fail('must remain fail-closed and cannot claim approval or activation.');
  }

  exact(matrixValue?.schemaVersion, 1, 'matrix schema version');
  exact(matrixValue?.packageVersion, value.packageVersion, 'matrix package');
  exact(matrixValue?.status, value.status, 'matrix status');
  for (const field of [
    'professionalLegalApproval',
    'ownerAdoptionRecorded',
    'publicActivationAllowed',
    'productionProvisioningAllowed',
    'storeSubmissionAllowed',
    'realMoneyAllowed',
  ]) {
    exact(matrixValue?.[field], false, `matrix ${field}`);
  }

  if (!Array.isArray(matrixValue?.decisions)) fail('matrix decisions are missing.');
  exact(matrixValue.decisions.map((entry) => entry.key), decisionKeys,
    'decision key order');
  const observedCounts = {
    ai_recommended: 0,
    ai_recommended_with_changes: 0,
    ai_hold_external_fact: 0,
  };
  for (const entry of matrixValue.decisions) {
    if (!allowedAiDecisions.has(entry?.decision)) {
      fail(`decision ${entry?.key ?? 'unknown'} uses an approval-shaped result.`);
    }
    exact(entry?.professionalStatus, 'open', `${entry.key} professional status`);
    if (!Array.isArray(entry?.blockingFacts)) {
      fail(`${entry.key} blocking facts are missing.`);
    }
    observedCounts[entry.decision] += 1;
  }
  exact(observedCounts, value.assessment.decisionCounts, 'observed decision counts');
  exact(matrixValue?.independentCrosscheck, {
    required: true,
    targetModel: 'GPT-6 Astra',
    targetEffort: 'ultra',
    codeChangesAllowed: false,
    liveChangesAllowed: false,
  }, 'independent crosscheck');

  if (!Array.isArray(value?.officialSources) || value.officialSources.length < 10) {
    fail('official source register is incomplete.');
  }
  for (const source of value.officialSources) {
    if (!/^https:\/\/(?:www\.gesetze-im-internet\.de|eur-lex\.europa\.eu)\//u.test(source)) {
      fail('official source register contains a non-primary domain.');
    }
  }

  if (Object.keys(value?.sourceInventory ?? {}).length !== 15) {
    fail('source inventory is incomplete.');
  }
  for (const [path, expected] of Object.entries(value.sourceInventory)) {
    exact(digest(repositoryRoot, path), expected, `source inventory ${path}`);
  }

  const report = readFileSync(resolve(repositoryRoot, value.assessment.report), 'utf8');
  for (const marker of [
    'PROFESSIONELLE RECHTSFREIGABE',
    'Die Entscheidungen im',
    'professionellen P0B-L1-Schema bleiben `open`',
    '§-356a-Widerrufsfunktion',
    'ai_hold_external_fact',
    'Stripe-Connect-Vertrag',
    'KI-Konsolidierung darf niemals `professionalLegalApproval=true` setzen',
  ]) {
    if (!report.includes(marker)) fail('assessment report is incomplete.');
  }
  for (const key of decisionKeys) {
    if (!report.includes(`\`${key}\``)) fail(`assessment report misses ${key}.`);
  }

  const crosscheck = readFileSync(
    resolve(repositoryRoot, value.assessment.astraCrosscheckScope), 'utf8',
  );
  for (const marker of [
    'Astra-Ultra-Abgleichauftrag',
    'Beantworte jeden der 18 P0B-L1-Schlüssel einzeln',
    'Keine Code-, Git-, Drive-, Provider-, Store-, Cloud-, VPS-, Firebase-',
    'ASTRA_CROSSCHECK_RESULT=CONFIRM|CORRECTIONS_REQUIRED|INSUFFICIENT_EVIDENCE',
  ]) {
    if (!crosscheck.includes(marker)) fail('Astra crosscheck scope is incomplete.');
  }

  const serialized = JSON.stringify({ value, matrixValue });
  if (/\/(?:Users|home)\/|@(?:gmail|shareittoo)|\+49\d|BEGIN PRIVATE|\b(?:sk|rk)_(?:test|live)_|\bwhsec_|clientSecret|privateKeyValue/iu.test(serialized)) {
    fail('package contains private or secret-shaped data.');
  }

  return Object.freeze({
    packageVersion: value.packageVersion,
    status: value.status,
    decisionCount: matrixValue.decisions.length,
    decisionCounts: observedCounts,
    professionalLegalApproval: false,
    realMoneyAllowed: false,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    process.stdout.write(`${JSON.stringify(validateP0bAiLegalPreassessment())}\n`);
  } catch (error) {
    process.stderr.write(`${error?.message ?? 'P0B-L2 validation failed.'}\n`);
    process.exitCode = 1;
  }
}
