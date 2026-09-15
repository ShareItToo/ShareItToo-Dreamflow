#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validatePrivacyDisclosures } from './validate_privacy_disclosures.mjs';
import {
  boundDigest,
  deriveBoundSnapshotAttestation,
  materializeBoundSourceTexts,
  resolveBoundSnapshot,
} from './read_bound_source.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath = 'docs/evidence/release-readiness/wp155-processing-transparency-purpose-basis-recipient-parity-20260915.json';
const handoverPath = 'docs/operations/WP155_PROCESSING_TRANSPARENCY_PURPOSE_BASIS_RECIPIENT_PARITY_2026-09-15.md';

export const wp155SourcePaths = Object.freeze([
  'AGENTS.md',
  'assets/legal/de/privacy_v5.html',
  'docs/current_state.md',
  'docs/current_work_package.md',
  handoverPath,
  'docs/operations/SIT_CODEX_CONTEXT_CREDIT_EFFICIENCY_RULES_V1.md',
  'lib/screens/legal_privacy_screen.dart',
  'store/legal-readiness.json',
  'store/privacy-disclosures.json',
  'store/retention-deletion-readiness.json',
  'scripts/technical_regression_check.sh',
  'test/legal_privacy_screen_test.dart',
  'test/tool/validate_privacy_disclosures.test.mjs',
  'test/tool/validate_wp155_processing_transparency_purpose_basis_recipient_parity.test.mjs',
  'tool/validate_privacy_disclosures.mjs',
  'tool/validate_wp155_processing_transparency_purpose_basis_recipient_parity.mjs',
]);

const decisionKeys = Object.freeze([
  'exactPurposeBasisMapping',
  'legitimateInterestAssessments',
  'statutoryObligationMapping',
  'specialCategoryArticle9Basis',
  'controllerAndRecipientIdentity',
  'processorContractsRegionsTransfers',
  'retentionSchedule',
  'exactCandidateParity',
]);

const boundaryKeys = Object.freeze([
  'providerRequestPerformed',
  'paymentPerformed',
  'moneyMoved',
  'deploymentChanged',
  'productionChanged',
  'publicActivationChanged',
  'storeChanged',
  'firebaseChanged',
  'cloudOrVpsChanged',
  'credentialReadOrRecorded',
  'deviceChanged',
  'pullRequestMerged',
]);

function fail(message) {
  throw new Error(`WP155 ${message}`);
}

function exact(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(`${label} is invalid.`);
}

function inventoryDigest(inventory) {
  return createHash('sha256')
    .update(Object.entries(inventory)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([path, hash]) => `${path}\0${hash}\n`)
      .join(''))
    .digest('hex');
}

function digest(repositoryRoot, path, sourceTexts, revision, expectedDigest) {
  return boundDigest({ repositoryRoot, path, revision, sourceTexts, expectedDigest });
}

function source(repositoryRoot, path, sourceTexts) {
  return sourceTexts?.[path] ?? readFileSync(resolve(repositoryRoot, path), 'utf8');
}

function assertOpenDecision(value, label) {
  exact(value, { status: 'open', evidenceRef: null }, label);
}

export function validateWp155ProcessingTransparency({
  repositoryRoot = root,
  evidence,
  sourceTexts = {},
} = {}) {
  const value = evidence ?? JSON.parse(readFileSync(resolve(repositoryRoot, evidencePath), 'utf8'));
  const baselineRevision = value.repository?.finalHead ?? value.repository?.baselineHead;
  let boundSnapshot;
  try {
    boundSnapshot = resolveBoundSnapshot({
      repositoryRoot,
      baselineHead: baselineRevision,
      inventory: value.sourceInventory,
      anchorPath: evidencePath,
      finalHead: value.repository?.finalHead,
    });
  } catch (error) {
    fail(error?.message ?? 'bound source snapshot unavailable.');
  }
  const boundRevision = boundSnapshot.revision;
  sourceTexts = {
    ...materializeBoundSourceTexts({
      repositoryRoot,
      snapshot: boundSnapshot,
    }),
    ...sourceTexts,
  };
  exact(value.schemaVersion, 1, 'schemaVersion');
  exact(value.package, 'WP155-PROCESSING-TRANSPARENCY-PURPOSE-BASIS-RECIPIENT-PARITY-20260915', 'package');
  if (![
    'technical-closure-focused-passed-full-regression-pending-external-gates-hold',
    'technical-closure-full-regression-passed-external-gates-hold',
  ].includes(value.status)) fail('status is invalid.');
  exact(value.repository.branch, 'codex/master-workflow-20260808', 'repository branch');
  if (!/^[a-f0-9]{40}$/u.test(value.repository.baselineHead)) fail('baseline head is invalid.');
  exact(value.repository.remoteAhead, 0, 'remote ahead');
  exact(value.repository.remoteBehind, 0, 'remote behind');
  exact(value.decision, {
    processingActivityCount: 14,
    dataTypeCount: 18,
    recipientClassCount: 13,
    purposeBasisRecipientMapping: 'fail-closed-technical-draft',
    professionalLegalApproval: false,
    privacyApprovalAllowed: false,
    approvedProcessingDecisions: 0,
    openProcessingDecisions: decisionKeys,
    article9ProfessionalReviewRequired: true,
    exactCandidateRequired: true,
  }, 'decision');
  exact(value.invariants, {
    everyActivityHasPurposeBasis: true,
    everyActivityHasRecipientClasses: true,
    everyCollectedDataTypeCovered: true,
    everyOpenDecisionBoundToActivity: true,
    consentControlsExplicitAndRevocable: true,
    legitimateInterestAssessmentOpen: true,
    statutoryMappingOpen: true,
    article9GateOpen: true,
    disabledProvidersRemainDisabled: true,
    externalAiRecipientAbsent: true,
    approvalCannotBeInferredFromTechnicalPreparation: true,
  }, 'invariants');
  const verification = value.verification;
  exact(verification.privacyManifest, 'valid-draft-18-data-types-11-services-14-activities', 'privacy manifest');
  exact(verification.privacyToolTests, 'passed-28-of-28', 'privacy tool tests');
  exact(verification.legalReadiness, 'valid-draft-approval-closed', 'legal readiness');
  exact(verification.retentionReadiness, 'valid-draft-execution-blocked', 'retention readiness');
  exact(verification.focusedFlutter, 'passed-2-of-2', 'focused Flutter');
  exact(verification.changedFileAnalyzer, 'passed-zero-findings', 'analyzer');
  exact(verification.diffCheck, 'passed', 'diff check');
  if (verification.fullTechnicalRegression !== 'pending'
      && verification.fullTechnicalRegression !== 'passed-ci-equivalent-exit-0') {
    fail('full regression status is invalid.');
  }
  exact(verification.githubRegression, 'pending', 'GitHub Regression');
  exact(verification.githubCodeql, 'pending', 'CodeQL');
  if (value.status === 'technical-closure-full-regression-passed-external-gates-hold'
      && verification.fullTechnicalRegression !== 'passed-ci-equivalent-exit-0') {
    fail('closed status requires the passed full regression.');
  }
  if (value.status === 'technical-closure-focused-passed-full-regression-pending-external-gates-hold'
      && verification.fullTechnicalRegression !== 'pending') {
    fail('pending status requires the pending full regression.');
  }
  exact(value.gates, {
    professionalLegalApproval: false,
    processingApprovalAllowed: false,
    providerActivationAllowed: false,
    paymentAllowed: false,
    realMoneyAllowed: false,
    storeAllowed: false,
    productionAllowed: false,
    publicActivationAllowed: false,
  }, 'gates');
  exact(Object.keys(value.boundaries).sort(), [...boundaryKeys].sort(), 'boundary keys');
  for (const key of boundaryKeys) exact(value.boundaries[key], false, `boundary ${key}`);

  exact(Object.keys(value.sourceInventory).sort(), [...wp155SourcePaths].sort(), 'source inventory paths');
  exact(value.captureAttestation.inventoryDigestAlgorithm,
    'sha256-path-nul-digest-newline-v1', 'inventory digest algorithm');
  exact(value.captureAttestation.sourceInventoryDigest,
    inventoryDigest(value.sourceInventory), 'source inventory digest');
  for (const path of wp155SourcePaths) {
    if (!/^[a-f0-9]{64}$/u.test(value.sourceInventory[path] ?? '')) {
      fail(`source inventory ${path} is not a SHA-256 digest.`);
    }
    exact(digest(repositoryRoot, path, sourceTexts, boundRevision, value.sourceInventory[path]), value.sourceInventory[path], `source inventory ${path}`);
  }

  const privacy = JSON.parse(source(repositoryRoot, 'store/privacy-disclosures.json', sourceTexts));
  const privacySnapshot = deriveBoundSnapshotAttestation({
    repositoryRoot,
    snapshot: boundSnapshot,
    inventory: Object.fromEntries((privacy.sourceInventory ?? []).map(({ path, sha256 }) => [path, sha256])),
  });
  sourceTexts = {
    ...sourceTexts,
    ...materializeBoundSourceTexts({
      repositoryRoot,
      snapshot: privacySnapshot,
    }),
    ...sourceTexts,
  };
  const decisions = privacy.processingTransparency?.requiredDecisions;
  exact(Object.keys(decisions ?? {}).sort(), [...decisionKeys].sort(), 'processing decisions');
  for (const key of decisionKeys) assertOpenDecision(decisions[key], `processing decision ${key}`);
  exact(privacy.processingTransparency.state, 'technical-draft-fail-closed', 'processing state');
  exact(privacy.processingTransparency.approvalAllowed, false, 'processing approval');
  exact(privacy.processingTransparency.activities.length, 14, 'activity count');
  const privacyResult = validatePrivacyDisclosures({
    repositoryRoot,
    root: repositoryRoot,
    privacyManifest: privacy,
    submissionManifest: JSON.parse(source(repositoryRoot, 'store/submission.json', sourceTexts)),
    deviceManifest: JSON.parse(source(repositoryRoot, 'store/device-validation.json', sourceTexts)),
    sourceTexts,
    historicalSnapshot: privacySnapshot,
  });
  exact(privacyResult.processingActivityCount, 14, 'validator activity count');

  const ui = source(repositoryRoot, 'lib/screens/legal_privacy_screen.dart', sourceTexts);
  for (const marker of [
    'Rechtsgrundlagen und Empfänger',
    'Art. 6 Abs. 1 Buchst. a DSGVO',
    'Art. 6 Abs. 1 Buchst. b DSGVO',
    'Art. 6 Abs. 1 Buchst. c DSGVO',
    'Art. 6 Abs. 1 Buchst. f DSGVO',
    'technische Vorbereitung gilt nicht als rechtliche Freigabe',
  ]) if (!ui.includes(marker)) fail(`in-app marker missing: ${marker}`);
  const handover = source(repositoryRoot, handoverPath, sourceTexts);
  for (const marker of [
    'FOCUSED CLOSURE PASSED',
    'exactly fourteen',
    'all eight decisions open',
    'No processing approval',
  ]) if (!handover.includes(marker)) fail(`handover marker missing: ${marker}`);
  const regression = source(repositoryRoot, 'scripts/technical_regression_check.sh', sourceTexts);
  for (const marker of [
    'node --check tool/validate_wp155_processing_transparency_purpose_basis_recipient_parity.mjs',
    'node --test test/tool/validate_wp155_processing_transparency_purpose_basis_recipient_parity.test.mjs',
    'node tool/validate_wp155_processing_transparency_purpose_basis_recipient_parity.mjs',
  ]) if (!regression.includes(marker)) fail(`full-gate marker missing: ${marker}`);
  const rawEvidence = JSON.stringify(value);
  if (/(?:password|secret|token|api[_-]?key|private[_-]?key|service[_-]?account|@)/iu.test(rawEvidence)) {
    fail('evidence contains a secret-shaped or personal identifier.');
  }
  return {
    status: value.status,
    processingActivityCount: 14,
    approvedProcessingDecisions: 0,
    fullTechnicalRegression: verification.fullTechnicalRegression,
    externalGates: 'hold',
  };
}

function main() {
  const result = validateWp155ProcessingTransparency();
  console.log(`WP155 valid: status=${result.status}, activities=${result.processingActivityCount}, `
    + `approvedDecisions=${result.approvedProcessingDecisions}, fullRegression=${result.fullTechnicalRegression}, `
    + `externalGates=${result.externalGates}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
