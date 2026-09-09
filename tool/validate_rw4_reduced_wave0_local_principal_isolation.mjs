#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { readRepositoryFile } from './read_repository_file.mjs';
import { readHistoricalRepositoryFile } from './read_historical_repository_file.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath =
  'docs/evidence/48h-remote/rw4-reduced-wave0-local-principal-isolation-20260825.json';
const inventorySnapshotHead = '9fd6b6023b124e7c7efd9aff518a8c7d61a304a0';
const sourcePaths = [
  'lib/services/auth_service.dart',
  'lib/services/data_service.dart',
  'lib/services/shared_persistence_sync.dart',
  'lib/services/shared_persistence_sync_web.dart',
  'lib/screens/search_results_screen.dart',
  'lib/screens/wishlists_screen.dart',
  'store/g2-data-lifecycle.json',
  'store/privacy-disclosures.json',
  'store/retention-deletion-readiness.json',
  'tool/validate_g2_data_lifecycle.mjs',
  'tool/validate_privacy_disclosures.mjs',
  'scripts/technical_regression_check.sh',
  'test/reduced_wave0_local_principal_isolation_test.dart',
  'test/reduced_wave0_local_state_truth_recovery_test.dart',
  'test/reduced_wave0_local_concurrency_consistency_test.dart',
  'test/g2l_saved_items_lifecycle_test.dart',
  'test/tool/validate_g2_data_lifecycle.test.mjs',
  'test/tool/g2a_navigation_migration_wiring.test.mjs',
  'test/tool/rw2_reduced_wave0_local_state_truth_recovery_wiring.test.mjs',
  'test/tool/rw3_reduced_wave0_local_concurrency_consistency_wiring.test.mjs',
  'test/tool/rw4_reduced_wave0_local_principal_isolation_wiring.test.mjs',
  'docs/compliance/g2a-navigation-gemerkt-migration-2026-08-20.md',
  'docs/compliance/g2l-g2-data-lifecycle-2026-08-20.md',
];

const fail = (message) => { throw new Error(message); };
const exact = (actual, expected) => JSON.stringify(actual) === JSON.stringify(expected);
const source = (repositoryRoot, path) =>
  readRepositoryFile(repositoryRoot, path, { label: `RW4 source ${path}` });
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function assertMarkers(content, path, expected) {
  for (const marker of expected) {
    if (!content.includes(marker)) fail(`RW4 marker missing in ${path}: ${marker}`);
  }
}

function assertSanitized(value) {
  const serialized = JSON.stringify(value);
  if (/\/Users\/|BEGIN PRIVATE|\bsk-[A-Za-z0-9]|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/u.test(serialized)) {
    fail('RW4 evidence contains private or secret-shaped material.');
  }
}

export function validateRw4ReducedWave0LocalPrincipalIsolation({
  repositoryRoot = root,
  evidence,
  sourceTexts = {},
} = {}) {
  const value = evidence ?? JSON.parse(source(repositoryRoot, evidencePath));
  const statuses = [
    'implemented-focused-matrix-passed-full-technical-regression-pending',
    'implemented-full-technical-regression-passed-ci-pending',
    'verified-regression-and-codeql-passed',
  ];
  if (value.schemaVersion !== 1
      || value.kind !== 'sit-rw4-reduced-wave0-local-principal-isolation'
      || !statuses.includes(value.status)
      || value.implementationBaseHead !== '9af5c768279e501a0e3288affea4c403c2baf178') {
    fail('RW4 evidence identity is invalid.');
  }
  if (!exact(value.predecessor, {
    package: 'RW3',
    evidence: 'docs/evidence/48h-remote/rw3-reduced-wave0-local-concurrency-consistency-20260825.json',
    verifiedImplementationHead: 'f7a49899b51e733041878dba86bebf5737fac023',
    closureCommit: '9af5c768279e501a0e3288affea4c403c2baf178',
  })) fail('RW4 predecessor binding is invalid.');

  if (!exact(value.scope, {
    allowed: [
      'opaque-principal-scoped-wishlist-state',
      'opaque-principal-scoped-rental-cart-state',
      'serialized-account-guest-session-transitions',
      'guest-only-legacy-migration-or-quarantine',
      'bucket-local-corruption-quarantine',
      'current-principal-export-and-confirmed-deletion',
      'bounded-local-principal-registry',
      'logical-identity-transition-events',
      'compact-stale-error-and-recovery-state',
    ],
    excluded: [
      'binding-request-contract-and-acceptance',
      'payment-refund-and-payout',
      'handover-return-damage-and-needs-review',
      'physical-device-and-candidate',
      'live-provider-pilot-and-release',
    ],
    syntheticOnly: true,
    localOnly: true,
    timingWorkaroundAllowed: false,
    testParallelismReductionAllowed: false,
  })) fail('RW4 scope or deterministic-test policy is invalid.');

  const findingIds = [
    'RW4-P0-SAVED-CROSS-PRINCIPAL-001',
    'RW4-P0-CART-CROSS-PRINCIPAL-002',
    'RW4-P0-LEGACY-MISATTRIBUTION-003',
    'RW4-P0-EXPORT-DELETION-SCOPE-004',
    'RW4-P1-IDENTIFIER-DISCLOSURE-005',
    'RW4-P1-IDENTITY-TRANSITION-006',
    'RW4-P1-BUCKET-CORRUPTION-007',
    'RW4-P1-BOUNDED-REGISTRY-008',
    'RW4-P1-COMPACT-RECOVERY-009',
  ];
  if (!Array.isArray(value.findings)
      || !exact(value.findings.map(({ id }) => id), findingIds)
      || value.findings.some(({ state, resolution }) =>
        state !== 'resolved-and-tested' || typeof resolution !== 'string' || !resolution)) {
    fail('RW4 finding set is invalid.');
  }

  const fullPassed = value.status !== statuses[0];
  const githubPassed = value.status === statuses[2];
  if (!exact(value.verification, {
    changedFileAnalyze: 'passed-zero-issues',
    focusedRw4Flutter: 'passed-13',
    principalAndAdjacentFlutter: 'passed-51',
    g2LifecycleAndPredecessorWiring: 'passed-20',
    rw4WiringTests: 'passed-7',
    fullTechnicalRegression: fullPassed ? 'passed' : 'pending',
    githubRegression: githubPassed ? 'passed' : 'pending',
    githubCodeql: githubPassed ? 'passed-no-new-alerts' : 'pending',
  })) fail('RW4 verification truth is invalid.');

  if (githubPassed) {
    const github = value.githubVerification;
    if (!github
        || github.head !== 'f11335b74b88365a4f42c0bc748966d9b58d85d7'
        || github.regressionRunId !== 32805997938
        || github.codeqlRunId !== 32805997934
        || github.regressionConclusion !== 'success'
        || github.codeqlConclusion !== 'success'
        || github.openCodeScanningAlerts !== 0) {
      fail('RW4 exact GitHub verification is invalid.');
    }
  } else if (value.githubVerification !== undefined) {
    fail('RW4 GitHub verification must be absent before exact CI passes.');
  }

  const expectedGates = {
    BUILD_READY: 'not-granted',
    PLAY_UPLOAD_APPROVED: 'not-granted',
    HUMAN_PILOT_ACTIVATED: 'not-granted',
    PR7_MERGE_APPROVED: 'not-granted',
    R17_GITGUARDIAN_HISTORY_REVIEW_COMPLETE: 'not-granted',
  };
  if (!exact(value.gates, expectedGates)
      || Object.values(value.boundaries ?? {}).length !== 16
      || !Object.values(value.boundaries).every((entry) => entry === false)) {
    fail('RW4 gate or boundary truth is invalid.');
  }

  if (!Array.isArray(value.sourceInventory)
      || value.sourceInventory.length !== sourcePaths.length
      || !exact(value.sourceInventory.map(({ path }) => path), sourcePaths)) {
    fail('RW4 source inventory paths are invalid.');
  }
  for (const entry of value.sourceInventory) {
    if (!/^[a-f0-9]{64}$/u.test(entry.sha256 ?? '')) {
      fail(`RW4 source hash is invalid: ${entry.path}`);
    }
    const text = readHistoricalRepositoryFile(repositoryRoot, inventorySnapshotHead, entry.path, {
      sourceTexts, label: 'RW4 source-binding snapshot',
    });
    if (sha256(text) !== entry.sha256) {
      fail(`RW4 source inventory hash is stale: ${entry.path}`);
    }
  }

  assertMarkers(source(repositoryRoot, value.architecture), value.architecture, [
    'Principal transition policy',
    'guest-only compatibility inputs',
    'current-principal snapshot',
    'No sleep, retry loop',
  ]);
  assertMarkers(source(repositoryRoot, value.report), value.report, [
    'Focused RW4 result: 13 passed',
    'passes 51 checks',
    'without a delay',
    'historical GitGuardian',
  ]);
  assertSanitized(value);

  return {
    status: value.status,
    allowedSurfaces: value.scope.allowed.length,
    excludedSurfaces: value.scope.excluded.length,
    resolvedFindings: value.findings.length,
    fullTechnicalRegression: value.verification.fullTechnicalRegression,
  };
}

function main() {
  const result = validateRw4ReducedWave0LocalPrincipalIsolation();
  process.stdout.write(`RW4 local principal isolation evidence valid: ${JSON.stringify(result)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
