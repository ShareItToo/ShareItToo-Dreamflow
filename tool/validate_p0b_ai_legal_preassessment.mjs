#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const packageRoot = 'assets/legal/de/p0b-ai-preassessment-2026-09-14.1';
const manifestPath = `${packageRoot}/manifest.json`;
const reviewedSourceCommit = '2db2b90aab385aeba527fd559a33c269c8dc00cf';

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

// These digests describe the exact historical inputs reviewed at the L2
// checkpoint. Mutable implementation files are intentionally not re-hashed
// against a later HEAD: doing so would make every legitimate correction look
// like evidence tampering. The three L2 artifacts themselves remain live-hash
// checked below.
const reviewedSourceInventory = Object.freeze({
  'assets/legal/de/p0b-ai-preassessment-2026-09-14.1/01_ai_rechtliche_vorpruefung.md': 'a1772c59c24158315f8e23e48bf81e4c225f26a6a1f8087bfb2339c0cc5f6e44',
  'assets/legal/de/p0b-ai-preassessment-2026-09-14.1/02_decision_matrix.json': 'c715cc28e50e6f47d92d5ac7c8143a02eeca7d6ef4dd535d20490127ee5b333a',
  'assets/legal/de/p0b-ai-preassessment-2026-09-14.1/03_astra_crosscheck_scope.md': 'fcbdaf3fb545a351617aa35411b2273210e012775665cad2b821441b5589092d',
  'assets/legal/de/legal_manifest_v52.json': '757289c45dfe50c9f3f3ec9c96953f06b62f15b282bb1d6cdedc6e8e07d2e69b',
  'assets/legal/de/legal_manifest_v53.json': 'd1265d31f68a7c616d782a78cd77c22eadb03dabbbd7e9ebe36a485d6d1a49c6',
  'assets/legal/de/legal_review_intake_p0b_20260821.json': '2ce69106a3ea06ad6fa08a365a22716bf1342c44b107fa03cdda5a399e165696',
  'assets/legal/de/legal_manifest_g3l_draft.json': 'd3bc9b74cf70324b448df4e9d10662ab3a03485028dfc9e2d7c81535b8f9a02a',
  'docs/architecture/g3a-same-owner-multi-item-decision-2026-08-20.md': '39db40f9b4d16dc11bca4cae5b09c87c657fcb36611ab744ed5a21710ce9af7b',
  'lib/screens/private_pilot_checkout_screen.dart': 'd00a622598d67cda94185554ba69312ad8401f7c415ddd49a2a2579fa87549c8',
  'lib/screens/platform_withdrawal_screen.dart': 'b3664e160885647afbde0607ea83b1173f201c38f3f7bdcb238ab66ed29804be',
  'backend/src/booking_group_legal_document.js': '1cc7b6d0bcf0a4edb7c69fba605322736d353a0ea6f589e2170ae98bfe547966',
  'backend/src/payment_workflow.js': 'fd68b07de3b5ef017bb5f26531bd9c193385c66b5ba460cc6f9b871797efed9e',
  'store/retention-deletion-readiness.json': '6858ba64d995e270660bc6ae7a5793cb0aec8bbd6dbeec66ef91779ab31e6dad',
  'docs/compliance/s3n-separate-dsa-notice-intake-2026-08-22.md': 'daec509e0997739558f4c3a97fa8e0ce3610c816f96b184e65f51d556bc0c088',
  'docs/compliance/s3o-dsa-notice-locator-completion-2026-08-22.md': '52c5d39a4019518bc8bd91b8013a7895feec1da822ac02ab57c620c75ca447d6',
});

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

function historicalDigest(repositoryRoot, commit, path) {
  let blob;
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', commit, 'HEAD'], {
      cwd: repositoryRoot,
      stdio: 'ignore',
    });
    blob = execFileSync('git', ['show', `${commit}:${path}`], {
      cwd: repositoryRoot,
      encoding: null,
      maxBuffer: 16 * 1024 * 1024,
    });
  } catch {
    fail(`cannot verify historical source ${path} at ${commit}.`);
  }
  return createHash('sha256').update(blob).digest('hex');
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

  exact(value?.sourceInventory, reviewedSourceInventory, 'source inventory');
  for (const [path, expected] of Object.entries(reviewedSourceInventory)) {
    exact(historicalDigest(repositoryRoot, reviewedSourceCommit, path), expected,
      `historical source ${path}`);
  }
  for (const path of [
    value.assessment.report,
    value.assessment.decisionMatrix,
    value.assessment.astraCrosscheckScope,
  ]) {
    exact(digest(repositoryRoot, path), reviewedSourceInventory[path],
      `L2 artifact ${path}`);
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
