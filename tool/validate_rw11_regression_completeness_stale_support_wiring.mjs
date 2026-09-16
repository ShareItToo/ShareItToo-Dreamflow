#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { readRepositoryFile } from './read_repository_file.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath =
  'docs/evidence/48h-remote/rw11-regression-completeness-stale-support-wiring-20260825.json';
const sourceBindingHead = '9fd6b6023b124e7c7efd9aff518a8c7d61a304a0';
const sourcePaths = [
  'backend/src/app.js',
  'backend/src/moderation_workflow.js',
  'lib/screens/messages_screen.dart',
  'lib/services/backend_repository.dart',
  'lib/services/local_safety_privacy_service.dart',
  'lib/services/user_reports_service.dart',
  'docs/architecture/s4j-non-acute-harassment-block-report-2026-08-22.md',
  'docs/decisions/ADR-073-atomic-non-acute-harassment-block-report.md',
  'docs/architecture/s3x-support-case-ui-accessibility-2026-08-22.md',
  'docs/decisions/ADR-061-support-case-semantic-order-and-empty-blocked-filter.md',
  'scripts/technical_regression_check.sh',
  'test/tool/harassment_block_report_wiring.test.mjs',
  'test/tool/support_case_ui_accessibility_wiring.test.mjs',
  'test/tool/rw11_regression_completeness_wiring.test.mjs',
  'test/tool/validate_rw11_regression_completeness_stale_support_wiring.test.mjs',
  'tool/validate_rw11_regression_completeness_stale_support_wiring.mjs',
  'docs/architecture/rw11-regression-completeness-stale-support-wiring-2026-08-25.md',
  'docs/operations/RW11_REGRESSION_COMPLETENESS_STALE_SUPPORT_WIRING_2026-08-25.md',
];

const fail = (message) => { throw new Error(message); };
const exact = (actual, expected) =>
  JSON.stringify(actual) === JSON.stringify(expected);
const source = (repositoryRoot, path) =>
  readRepositoryFile(repositoryRoot, path, { label: `RW11 source ${path}` });
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function sourceAtImplementationHead(repositoryRoot, value, path, sourceTexts) {
  if (Object.hasOwn(sourceTexts, path)) return sourceTexts[path];
  try {
    return execFileSync('git', ['show', `${sourceBindingHead}:${path}`], {
      cwd: repositoryRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    fail(`RW11 source-binding snapshot is unavailable: ${path}`);
  }
}

function assertSanitized(value) {
  const serialized = JSON.stringify(value);
  if (/\/Users\/|BEGIN PRIVATE|\bsk-[A-Za-z0-9]|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/u.test(serialized)) {
    fail('RW11 evidence contains private or secret-shaped material.');
  }
}

export function validateRw11RegressionCompletenessStaleSupportWiring({
  repositoryRoot = root,
  evidence,
  sourceTexts = {},
} = {}) {
  const value = evidence ?? JSON.parse(source(repositoryRoot, evidencePath));
  const statuses = [
    'implemented-complete-tool-inventory-passed-full-regression-pending',
    'implemented-full-technical-regression-passed-ci-pending',
    'verified-regression-and-codeql-passed',
  ];
  if (value.schemaVersion !== 1
      || value.kind
        !== 'sit-rw11-regression-completeness-stale-support-wiring'
      || !statuses.includes(value.status)
      || value.implementationBaseHead
        !== '5ad324704db716e39f8b79347167d24813f1596a') {
    fail('RW11 evidence identity is invalid.');
  }
  if (!exact(value.predecessor, {
    package: 'RW10',
    evidence:
      'docs/evidence/48h-remote/rw10-local-security-control-truthfulness-20260825.json',
    verifiedImplementationHead: 'd72e18eb607bb3f9ed7baf09ab7212f3ef695ee5',
    closureCommit: '5ad324704db716e39f8b79347167d24813f1596a',
  })) fail('RW11 predecessor binding is invalid.');

  const allowed = [
    'sup094-current-atomic-boundary-assertion-repair',
    'sup151-152-conditional-blocked-visibility-assertion-repair',
    'complete-repository-owned-node-tool-test-execution',
    'red-first-permanent-regression-registration-guard',
    'mechanical-predecessor-regression-script-hash-refresh',
    'deterministic-local-and-ci-regression-evidence',
  ];
  const excluded = [
    'product-runtime-and-backend-behavior-change',
    'rw10-product-or-evidence-semantic-change',
    'timing-retry-parallelism-reduction-and-test-exclusion',
    'production-vps-dns-cloud-firebase-store-and-play',
    'payment-provider-ai-pilot-real-money-and-real-support-traffic',
    'legal-owner-gitguardian-pr-merge-and-history-rewrite',
  ];
  if (!exact(value.scope, {
    allowed,
    excluded,
    localOnly: true,
    productBehaviorChanged: false,
    timingWorkaroundAllowed: false,
    testParallelismReductionAllowed: false,
    toolTestExclusionAllowed: false,
  })) fail('RW11 scope or deterministic-test policy is invalid.');

  const findingIds = [
    'RW11-P0-DORMANT-TOOL-TEST-INVENTORY-001',
    'RW11-P1-SUP094-ATOMICITY-ASSERTION-DRIFT-002',
    'RW11-P1-SUP151152-VISIBILITY-ASSERTION-DRIFT-003',
  ];
  if (!Array.isArray(value.findings)
      || !exact(value.findings.map(({ id }) => id), findingIds)
      || value.findings.some(({ state, classification, resolution }) =>
        state !== 'resolved-and-tested'
          || !['regression-governance-gap', 'stale-assertion-drift']
            .includes(classification)
          || typeof resolution !== 'string'
          || !resolution)) {
    fail('RW11 finding set is invalid.');
  }

  const regression = Object.hasOwn(sourceTexts,
    'scripts/technical_regression_check.sh')
    ? sourceTexts['scripts/technical_regression_check.sh']
    : source(repositoryRoot, 'scripts/technical_regression_check.sh');
  if (!/^node --test test\/tool\/\*\.test\.mjs$/mu.test(regression)) {
    fail('RW11 complete tool-test execution is not registered.');
  }
  if (!exact(value.inventoryAudit, {
    baselineRepositoryOwnedFiles: 322,
    baselineDirectlyNamedFiles: 273,
    baselineNotDirectlyNamedFiles: 49,
    closureRepositoryOwnedFiles: 324,
    executionPattern: 'node --test test/tool/*.test.mjs',
    excludedFiles: [],
    standardNodeParallelism: true,
  })) fail('RW11 inventory audit is invalid.');
  const discovered = readdirSync(join(repositoryRoot, 'test/tool'))
    .filter((name) => name.endsWith('.test.mjs'));
  if (discovered.length < value.inventoryAudit.closureRepositoryOwnedFiles) {
    fail('RW11 repository-owned tool-test inventory was silently reduced.');
  }

  const fullPassed = value.status !== statuses[0];
  const githubPassed = value.status === statuses[2];
  if (value.verification?.redFirstCompletenessGuard !== 'failed-before-fix'
      || value.verification?.focusedCorrectedMatrix !== 'passed-7'
      || value.verification?.completeToolInventory !== 'passed-1867'
      || value.verification?.completeToolInventorySkipped !== 0
      || value.verification?.fullTechnicalRegression
        !== (fullPassed ? 'passed' : 'pending')
      || value.verification?.githubRegression
        !== (githubPassed ? 'passed' : 'pending')
      || value.verification?.githubCodeql
        !== (githubPassed ? 'passed-no-new-alerts' : 'pending')) {
    fail('RW11 verification truth is invalid.');
  }
  if (fullPassed) {
    if (!/^[a-f0-9]{40}$/u.test(value.implementationHead ?? '')
        || value.localRegression?.head !== value.implementationHead
        || value.localRegression?.standardParallelism !== true
        || value.localRegression?.timingWorkaroundUsed !== false
        || value.localRegression?.parallelismReductionUsed !== false) {
      fail('RW11 full-regression evidence is invalid.');
    }
  } else if (value.implementationHead !== null
      || value.localRegression !== null) {
    fail('RW11 cannot bind an implementation head before full regression.');
  }
  if (githubPassed) {
    const github = value.githubVerification;
    if (github?.head !== value.implementationHead
        || !Number.isInteger(github?.regressionRunId)
        || !Number.isInteger(github?.codeqlRunId)
        || github?.regressionConclusion !== 'success'
        || github?.codeqlConclusion !== 'success'
        || github?.openCodeScanningAlerts !== 0) {
      fail('RW11 GitHub verification is invalid.');
    }
  } else if (value.githubVerification !== null) {
    fail('RW11 cannot claim GitHub verification while CI is pending.');
  }

  if (value.ratchetAudit?.productSourceChanged !== false
      || value.ratchetAudit?.privacyManifestChanged !== false
      || value.ratchetAudit?.retentionManifestChanged !== false
      || value.ratchetAudit?.providerDecisionChanged !== false
      || value.ratchetAudit?.providerGateChanged !== false
      || value.ratchetAudit?.rw10SemanticsChanged !== false
      || !Array.isArray(value.ratchetAudit?.predecessorRefreshes)
      || value.ratchetAudit.predecessorRefreshes.length !== 2) {
    fail('RW11 ratchet audit is invalid.');
  }
  if (value.ratchets?.activeProviderState !== 'prepared-hold'
      || value.ratchets?.completedOwnerDecisions !== 0
      || value.ratchets?.requiredOwnerDecisions !== 10
      || value.ratchets?.externalReadiness !== false) {
    fail('RW11 provider truth is invalid.');
  }

  const gates = [
    'BUILD_READY',
    'PLAY_UPLOAD_APPROVED',
    'HUMAN_PILOT_ACTIVATED',
    'PR7_MERGE_APPROVED',
    'R17_GITGUARDIAN_HISTORY_REVIEW_COMPLETE',
  ];
  if (!exact(Object.keys(value.gates), gates)
      || Object.values(value.gates).some((entry) => entry !== 'not-granted')
      || Object.values(value.boundaries).some((entry) => entry !== false)) {
    fail('RW11 gate or boundary truth is invalid.');
  }
  if (!Array.isArray(value.residualRisks)
      || value.residualRisks.length !== 3
      || value.residualRisks.some((entry) =>
        typeof entry !== 'string' || !entry)) {
    fail('RW11 residual-risk truth is invalid.');
  }
  if (!Array.isArray(value.sourceInventory)
      || value.sourceInventory.length !== sourcePaths.length
      || !exact(value.sourceInventory.map(({ path }) => path), sourcePaths)) {
    fail('RW11 source inventory paths are invalid.');
  }
  for (const entry of value.sourceInventory) {
    const text = sourceAtImplementationHead(repositoryRoot, value, entry.path, sourceTexts);
    if (!/^[a-f0-9]{64}$/u.test(entry.sha256)
        || sha256(text) !== entry.sha256) {
      fail(`RW11 source inventory hash is stale: ${entry.path}`);
    }
  }
  assertSanitized(value);
  return {
    status: value.status,
    resolvedFindings: findingIds.length,
    completeToolInventoryPassed: value.verification.completeToolInventory,
    residualRisks: value.residualRisks.length,
  };
}

function main() {
  const result = validateRw11RegressionCompletenessStaleSupportWiring();
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1]
    && import.meta.url === pathToFileURL(process.argv[1]).href) main();
