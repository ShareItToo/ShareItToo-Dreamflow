#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateRetentionDeletionReadiness } from './validate_retention_deletion_readiness.mjs';
import {
  boundDigest,
  deriveBoundSnapshotAttestation,
  materializeBoundSourceTexts,
  resolveBoundSnapshot,
} from './read_bound_source.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath = 'docs/evidence/release-readiness/wp156-retention-legal-hold-enforcement-safety-20260915.json';
const handoverPath = 'docs/operations/WP156_RETENTION_LEGAL_HOLD_ENFORCEMENT_SAFETY_2026-09-15.md';
export const wp156SourcePaths = Object.freeze([
  'AGENTS.md',
  'docs/current_state.md',
  'docs/current_work_package.md',
  handoverPath,
  'docs/operations/SIT_CODEX_CONTEXT_CREDIT_EFFICIENCY_RULES_V1.md',
  'store/privacy-disclosures.json',
  'store/retention-deletion-readiness.json',
  'backend/src/moderation_workflow.js',
  'backend/src/app.js',
  'backend/src/support_privacy_rights_workflow.js',
  'backend/src/retention_inventory.js',
  'backend/sql/schema.sql',
  'backend/sql/migrations/014_account_legal_holds.up.sql',
  'backend/sql/migrations/078_retention_legal_hold_scope.up.sql',
  'backend/sql/migrations/078_retention_legal_hold_scope.down.sql',
  'backend/ops/verify_restore.sh',
  'backend/test/account_legal_hold.test.js',
  'backend/test/retention_inventory.test.js',
  'backend/test/postgres_foundation.integration.test.js',
  'test/tool/support_privacy_rights_control_plane_wiring.test.mjs',
  'test/tool/verify_restore_readiness_wiring.test.mjs',
  'test/tool/validate_retention_deletion_readiness.test.mjs',
  'test/tool/validate_wp156_retention_legal_hold_enforcement_safety.test.mjs',
  'test/tool/run_r9_database_recovery.test.mjs',
  'tool/validate_retention_deletion_readiness.mjs',
  'tool/validate_wp156_retention_legal_hold_enforcement_safety.mjs',
  'tool/run_r9_database_recovery.mjs',
  'scripts/technical_regression_check.sh',
]);

const openDecisions = Object.freeze([
  'inactiveAccountPeriod', 'transactionalRecordPeriod', 'communicationPeriod',
  'privacyRightsPeriod', 'moderationEvidencePeriod', 'auditSecurityLogPeriod',
  'expiredCredentialPurgePeriod', 'backupErasureWindow',
  'externalProcessorRetention', 'legalHoldProcess',
]);

function fail(message) { throw new Error(`WP156 ${message}`); }
function exact(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(`${label} is invalid.`);
}
function digest(repositoryRoot, path, sourceTexts, revision, expectedDigest) {
  return boundDigest({ repositoryRoot, path, revision, sourceTexts, expectedDigest });
}
function inventoryDigest(inventory) {
  return createHash('sha256').update(Object.entries(inventory)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([path, hash]) => `${path}\0${hash}\n`).join('')).digest('hex');
}
function source(repositoryRoot, path, sourceTexts) {
  return sourceTexts?.[path] ?? readFileSync(resolve(repositoryRoot, path), 'utf8');
}

export function validateWp156RetentionLegalHoldSafety({ repositoryRoot = root, evidence, sourceTexts = {} } = {}) {
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
  exact(value.package, 'WP156-RETENTION-LEGAL-HOLD-ENFORCEMENT-SAFETY-20260915', 'package');
  if (![
    'technical-closure-focused-passed-full-regression-pending-external-gates-hold',
    'technical-closure-full-regression-passed-external-gates-hold',
  ].includes(value.status)) fail('status is invalid.');
  exact(value.repository.branch, 'codex/master-workflow-20260808', 'repository branch');
  if (!/^[a-f0-9]{40}$/u.test(value.repository.baselineHead)
      || !/^[a-f0-9]{40}$/u.test(value.repository.finalHead)) fail('repository heads are invalid.');
  exact(value.repository.baselineHead, '3ff7f9cb2b0f1efdb4dd8443ba9ea7ccdf70c9cc', 'baseline head');
  exact(value.repository.remoteAhead, 0, 'remote ahead');
  exact(value.repository.remoteBehind, 0, 'remote behind');
  exact(value.decisions, {
    openCount: 10,
    openKeys: openDecisions,
    executionEnabled: false,
    legalDurationsInvented: false,
    professionalLegalApproval: false,
  }, 'decisions');
  exact(value.invariants, {
    recordScoped: true,
    datasetAndRecordRequired: true,
    reviewAndEndRequired: true,
    unboundedHoldRejected: true,
    expiredHoldDoesNotBlockDeletion: true,
    auditIncludesScopeAndWindow: true,
    supportRoleDenied: true,
    oneActiveHoldPerRecord: true,
    noProfileRestoreFromBackup: true,
    restoreCheckIsIsolated: true,
    inventoryIsAggregateOnly: true,
    inventoryExecutionDisabled: true,
  }, 'invariants');
  exact(value.verification.retentionReadiness, 'valid-draft-execution-blocked', 'retention readiness');
  exact(value.verification.accountLegalHoldTests, 'passed', 'account legal-hold tests');
  exact(value.verification.restoreWiringTests, 'passed', 'restore wiring tests');
  exact(value.verification.fullTechnicalRegression,
    value.status === 'technical-closure-full-regression-passed-external-gates-hold'
      ? 'passed-ci-equivalent-exit-0' : 'pending', 'full regression');
  exact(value.verification.githubRegression, 'pending', 'GitHub Regression');
  exact(value.verification.githubCodeql, 'pending', 'CodeQL');
  exact(value.boundaries, {
    providerRequestPerformed: false, paymentPerformed: false, moneyMoved: false,
    deploymentChanged: false, productionChanged: false, publicActivationChanged: false,
    storeChanged: false, firebaseChanged: false, cloudOrVpsChanged: false,
    credentialReadOrRecorded: false, deviceChanged: false, pullRequestMerged: false,
  }, 'boundaries');

  exact(Object.keys(value.sourceInventory).sort(), [...wp156SourcePaths].sort(), 'source inventory paths');
  exact(value.captureAttestation.inventoryDigestAlgorithm,
    'sha256-path-nul-digest-newline-v1', 'inventory digest algorithm');
  exact(value.captureAttestation.sourceInventoryDigest,
    inventoryDigest(value.sourceInventory), 'source inventory digest');
  for (const path of wp156SourcePaths) {
    if (!/^[a-f0-9]{64}$/u.test(value.sourceInventory[path] ?? '')) fail(`source inventory ${path} is not a SHA-256 digest.`);
    exact(digest(repositoryRoot, path, sourceTexts, boundRevision, value.sourceInventory[path]), value.sourceInventory[path], `source inventory ${path}`);
  }

  const retention = JSON.parse(source(repositoryRoot, 'store/retention-deletion-readiness.json', sourceTexts));
  const privacy = JSON.parse(source(repositoryRoot, 'store/privacy-disclosures.json', sourceTexts));
  const retentionSnapshot = deriveBoundSnapshotAttestation({
    repositoryRoot,
    snapshot: boundSnapshot,
    inventory: Object.fromEntries((retention.sourceInventory ?? []).map(({ path, sha256 }) => [path, sha256])),
  });
  sourceTexts = {
    ...sourceTexts,
    ...materializeBoundSourceTexts({
      repositoryRoot,
      snapshot: retentionSnapshot,
    }),
    ...sourceTexts,
  };
  const retentionResult = validateRetentionDeletionReadiness({
    root: repositoryRoot,
    retentionManifest: retention,
    privacyManifest: privacy,
    sourceTexts,
    historicalSnapshot: retentionSnapshot,
  });
  exact(retentionResult.state, 'draft', 'retention state');
  exact(retentionResult.approvalAllowed, false, 'retention approval');
  exact(Object.keys(retention.requiredDecisions).sort(), [...openDecisions].sort(), 'retention decisions');
  const controls = retention.implementedControls?.legalHold;
  for (const key of ['recordScoped', 'datasetAndRecordRequired', 'reviewAndEndRequired', 'unboundedHoldRejected',
    'expiredHoldDoesNotBlockDeletion', 'auditIncludesScopeAndWindow']) {
    if (controls?.[key] !== true) fail(`retention control ${key} is missing.`);
  }
  if (controls?.profileRestoreGuard !== 'isolated-restore-rejects-revived-deleted-profile') fail('profile restore guard is missing.');
  const workflow = source(repositoryRoot, 'backend/src/moderation_workflow.js', sourceTexts);
  for (const marker of ['datasetKey', 'recordKey', 'reviewDueAt', 'holdEndsAt', 'active_legal_hold_exists_for_record', 'legalHoldId: inserted.rows[0].id']) {
    if (!workflow.includes(marker)) fail(`workflow marker is missing: ${marker}`);
  }
  const app = source(repositoryRoot, 'backend/src/app.js', sourceTexts);
  if (!/account_legal_holds[\s\S]*hold_ends_at >= now\(\)/u.test(app)) fail('expired legal holds still block deletion.');
  const privacyRights = source(repositoryRoot, 'backend/src/support_privacy_rights_workflow.js', sourceTexts);
  if ((privacyRights.match(/hold_ends_at >= now\(\)/gu) ?? []).length < 4) fail('privacy-rights legal-hold reads do not apply the expiry boundary.');
  const restore = source(repositoryRoot, 'backend/ops/verify_restore.sh', sourceTexts);
  for (const marker of ['deletedProfileRestoreGuard', 'personal_data_erased_at IS NOT NULL', 'revived or incompletely erased profile state']) {
    if (!restore.includes(marker)) fail(`restore guard marker is missing: ${marker}`);
  }
  const inventory = source(repositoryRoot, 'backend/src/retention_inventory.js', sourceTexts);
  for (const marker of ['containsIdentifiers: false', 'executionEnabled: false', 'eligibleRowsCalculated: false']) {
    if (!inventory.includes(marker)) fail(`inventory fail-closed marker is missing: ${marker}`);
  }
  const handover = source(repositoryRoot, handoverPath, sourceTexts);
  for (const marker of ['WP156', 'record-scoped', 'Exactly 10 retention decisions remain open', 'BUILD/production/provider gates unchanged']) {
    if (!handover.includes(marker)) fail(`handover marker is missing: ${marker}`);
  }
  const regression = source(repositoryRoot, 'scripts/technical_regression_check.sh', sourceTexts);
  for (const marker of ['validate_wp156_retention_legal_hold_enforcement_safety.mjs', 'validate_wp156_retention_legal_hold_enforcement_safety.test.mjs']) {
    if (!regression.includes(marker)) fail(`full-gate marker is missing: ${marker}`);
  }
  if (/(?:password|secret|token|api[_-]?key|private[_-]?key|service[_-]?account|@)/iu.test(JSON.stringify(value))) {
    fail('evidence contains a secret-shaped or personal identifier.');
  }
  return { status: value.status, openDecisions: 10, fullTechnicalRegression: value.verification.fullTechnicalRegression, externalGates: 'hold' };
}

function main() {
  const result = validateWp156RetentionLegalHoldSafety();
  console.log(`WP156 valid: status=${result.status}, openDecisions=${result.openDecisions}, fullRegression=${result.fullTechnicalRegression}, externalGates=${result.externalGates}.`);
}
if (import.meta.url === `file://${process.argv[1]}`) main();
