#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath = 'docs/evidence/release-readiness/wp157-dsa-moderation-decision-appeal-parity-20260915.json';
const handoverPath = 'docs/operations/WP157_DSA_MODERATION_DECISION_APPEAL_PARITY_2026-09-15.md';

export const wp157SourcePaths = Object.freeze([
  'AGENTS.md',
  'docs/current_state.md',
  'docs/current_work_package.md',
  handoverPath,
  'docs/operations/SIT_CODEX_CONTEXT_CREDIT_EFFICIENCY_RULES_V1.md',
  'backend/src/app.js',
  'backend/src/moderation_decision_workflow.js',
  'backend/src/moderation_workflow.js',
  'backend/src/support_case_domain.js',
  'backend/src/support_case_workflow.js',
  'backend/src/support_appeal_domain.js',
  'backend/src/support_appeal_workflow.js',
  'lib/screens/support_cases_screen.dart',
  'backend/test/support_appeal_workflow.test.js',
  'test/support_cases_screen_test.dart',
  'test/tool/support_appeal_wiring.test.mjs',
  'tool/validate_wp157_dsa_moderation_decision_appeal_parity.mjs',
  'test/tool/validate_wp157_dsa_moderation_decision_appeal_parity.test.mjs',
  'scripts/technical_regression_check.sh',
]);

function fail(message) { throw new Error(`WP157 ${message}.`); }
function exact(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(`${label} is invalid`);
}
function digest(repositoryRoot, path) {
  return createHash('sha256').update(readFileSync(resolve(repositoryRoot, path))).digest('hex');
}
function inventoryDigest(inventory) {
  return createHash('sha256').update(Object.entries(inventory)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([path, hash]) => `${path}\0${hash}\n`).join('')).digest('hex');
}
function source(repositoryRoot, path, sourceTexts) {
  return sourceTexts?.[path] ?? readFileSync(resolve(repositoryRoot, path), 'utf8');
}
function hasAll(text, markers, label) {
  for (const marker of markers) if (!text.includes(marker)) fail(`${label} marker missing: ${marker}`);
}

export function validateWp157DsaModerationDecisionAppealParity({ repositoryRoot = root, evidence, sourceTexts = {} } = {}) {
  const value = evidence ?? JSON.parse(readFileSync(resolve(repositoryRoot, evidencePath), 'utf8'));
  exact(value.schemaVersion, 1, 'schemaVersion');
  exact(value.package, 'WP157-DSA-MODERATION-DECISION-APPEAL-PARITY-20260915', 'package');
  if (!['technical-closure-focused-passed-full-regression-pending-external-gates-hold',
    'technical-closure-full-regression-passed-external-gates-hold'].includes(value.status)) {
    fail('status is invalid');
  }
  exact(value.repository.branch, 'codex/master-workflow-20260808', 'repository branch');
  exact(value.repository.baselineHead, '541bbdb8024bb8778899bf892918b0a993e5a290', 'baseline head');
  if (!/^[a-f0-9]{40}$/u.test(value.repository.finalHead)) fail('final head is invalid');
  exact(value.repository.remoteAhead, 0, 'remote ahead');
  exact(value.repository.remoteBehind, 0, 'remote behind');
  exact(value.findings, {
    exactPrincipalContentActionReasonSource: true,
    reporterBoundSubmission: true,
    adminClaimOnly: true,
    independentReviewerRequired: true,
    typedResolutionOutcomes: true,
    durableNextUpdateFallback: true,
    durableUserVisibleResolution: true,
    automaticReopen: false,
    externalDelivery: false,
  }, 'findings');
  exact(value.legalBoundaries, {
    dsaApplicabilityDecided: false,
    operatorFactsDecided: false,
    sizeExceptionDecided: false,
    statutoryDeadlinesInvented: false,
    professionalLegalApproval: false,
  }, 'legal boundaries');
  exact(value.verification.fullTechnicalRegression,
    value.status === 'technical-closure-full-regression-passed-external-gates-hold'
      ? 'passed-ci-equivalent-exit-0' : 'pending', 'full technical regression');
  exact(value.verification.githubRegression, 'pending', 'GitHub Regression');
  exact(value.verification.githubCodeql, 'pending', 'CodeQL');
  exact(value.boundaries, {
    providerRequestPerformed: false, paymentPerformed: false, moneyMoved: false,
    deploymentChanged: false, productionChanged: false, publicActivationChanged: false,
    storeChanged: false, firebaseChanged: false, cloudOrVpsChanged: false,
    credentialReadOrRecorded: false, deviceChanged: false, pullRequestMerged: false,
  }, 'boundaries');

  exact(Object.keys(value.sourceInventory).sort(), [...wp157SourcePaths].sort(), 'source inventory paths');
  exact(value.captureAttestation.inventoryDigestAlgorithm,
    'sha256-path-nul-digest-newline-v1', 'inventory digest algorithm');
  exact(value.captureAttestation.sourceInventoryDigest,
    inventoryDigest(value.sourceInventory), 'source inventory digest');
  for (const path of wp157SourcePaths) {
    if (!/^[a-f0-9]{64}$/u.test(value.sourceInventory[path] ?? '')) fail(`source inventory ${path} is not a SHA-256 digest`);
    exact(digest(repositoryRoot, path), value.sourceInventory[path], `source inventory ${path}`);
  }

  const workflow = source(repositoryRoot, 'backend/src/support_appeal_workflow.js', sourceTexts);
  hasAll(workflow, [
    'case_next_update_at', 'support_appeal_implementation_changes_required',
    "status = 'under_review'", 'independence_flag = true',
    'automaticReopen: false', 'externalMessageSent: false',
    "principalId: row.submitted_by", "source: 'sit-api'",
    "support.appeal.claim", "support.appeal.resolve",
    'support_appeal_claim_idempotency_conflict',
    'support_appeal_resolution_idempotency_conflict',
  ], 'appeal workflow');
  const app = source(repositoryRoot, 'backend/src/app.js', sourceTexts);
  hasAll(app, [
    "app.get('/v1/admin/support/appeals'", "app.post('/v1/admin/support/appeals/:id/claim'",
    "app.post('/v1/admin/support/appeals/:id/resolve'", 'requireAdminRole',
    'requireStaffElevation',
  ], 'admin appeal routes');
  const supportCase = source(repositoryRoot, 'backend/src/support_case_workflow.js', sourceTexts);
  hasAll(supportCase, ['appealState = \'submitted\'', 'getSupportAppealForCase'], 'support case projection');
  const ui = source(repositoryRoot, 'lib/screens/support_cases_screen.dart', sourceTexts);
  hasAll(ui, [
    'final String? outcomeReason;', 'final String? communicatedAt;',
    "const {'upheld', 'modified', 'reversed'}.contains(status)",
    'outcome != status || outcomeReason == null || communicatedAt == null',
    'appeal.outcomeReason!',
  ], 'typed appeal UI');
  const tests = source(repositoryRoot, 'backend/test/support_appeal_workflow.test.js', sourceTexts);
  hasAll(tests, ['appeal claim is admin-owned', 'appeal resolution records a durable user-visible result',
    'implementation truth'], 'appeal tests');
  const handover = source(repositoryRoot, handoverPath, sourceTexts);
  hasAll(handover, ['WP157', 'technical closure', 'DSA applicability', 'BUILD/production/provider gates unchanged'], 'handover');
  const regression = source(repositoryRoot, 'scripts/technical_regression_check.sh', sourceTexts);
  hasAll(regression, ['validate_wp157_dsa_moderation_decision_appeal_parity.mjs',
    'validate_wp157_dsa_moderation_decision_appeal_parity.test.mjs'], 'regression registration');
  if (/(?:password|secret|token|api[_-]?key|private[_-]?key|service[_-]?account|@)/iu.test(JSON.stringify(value))) {
    fail('evidence contains a secret-shaped or personal identifier');
  }
  return {
    status: value.status,
    fullTechnicalRegression: value.verification.fullTechnicalRegression,
    externalGates: 'hold',
  };
}

function main() {
  const result = validateWp157DsaModerationDecisionAppealParity();
  console.log(`WP157 valid: status=${result.status}, fullRegression=${result.fullTechnicalRegression}, externalGates=${result.externalGates}.`);
}
if (import.meta.url === `file://${process.argv[1]}`) main();
