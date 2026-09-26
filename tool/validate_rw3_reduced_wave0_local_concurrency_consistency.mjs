#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { readRepositoryFile } from './read_repository_file.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath =
  'docs/evidence/48h-remote/rw3-reduced-wave0-local-concurrency-consistency-20260825.json';
const sourceInventoryHead = '7d2df51c25ebbe94ee41dd075d8512c5e7439f11';
const sourcePaths = [
  'lib/services/data_service.dart',
  'lib/services/shared_persistence_sync.dart',
  'lib/services/shared_persistence_sync_web.dart',
  'lib/screens/explore_screen.dart',
  'lib/screens/search_results_screen.dart',
  'lib/screens/wishlists_screen.dart',
  'lib/widgets/item_card.dart',
  'lib/widgets/item_details_overlay.dart',
  'store/g2-data-lifecycle.json',
  'tool/validate_g2_data_lifecycle.mjs',
  'scripts/technical_regression_check.sh',
  'test/reduced_wave0_local_state_truth_recovery_test.dart',
  'test/reduced_wave0_local_concurrency_consistency_test.dart',
  'test/tool/g2a_navigation_migration_wiring.test.mjs',
  'test/tool/rw2_reduced_wave0_local_state_truth_recovery_wiring.test.mjs',
  'test/tool/validate_g2_data_lifecycle.test.mjs',
  'test/tool/rw3_reduced_wave0_local_concurrency_consistency_wiring.test.mjs',
  'docs/compliance/g2a-navigation-gemerkt-migration-2026-08-20.md',
  'docs/compliance/g2l-g2-data-lifecycle-2026-08-20.md',
];

const fail = (message) => { throw new Error(message); };
const exact = (actual, expected) => JSON.stringify(actual) === JSON.stringify(expected);
const source = (repositoryRoot, path) =>
  readRepositoryFile(repositoryRoot, path, { label: `RW3 source ${path}` });
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function inventorySource(repositoryRoot, sourceTexts, path) {
  if (Object.prototype.hasOwnProperty.call(sourceTexts, path)) return sourceTexts[path];
  try {
    return execFileSync('git', ['show', `${sourceInventoryHead}:${path}`], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    fail(`RW3 historical source is unavailable: ${path}`);
  }
}

function assertMarkers(content, path, expected) {
  for (const marker of expected) {
    if (!content.includes(marker)) fail(`RW3 marker missing in ${path}: ${marker}`);
  }
}

function assertSanitized(value) {
  const serialized = JSON.stringify(value);
  if (/\/Users\/|BEGIN PRIVATE|\bsk-[A-Za-z0-9]|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/u.test(serialized)) {
    fail('RW3 evidence contains private or secret-shaped material.');
  }
}

export function validateRw3ReducedWave0LocalConcurrencyConsistency({
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
      || value.kind !== 'sit-rw3-reduced-wave0-local-concurrency-consistency'
      || !statuses.includes(value.status)
      || value.implementationBaseHead !== 'c3ac3b6be4cbd4813c33f24ff629f8d7419243fa') {
    fail('RW3 evidence identity is invalid.');
  }
  if (!exact(value.predecessor, {
    package: 'RW2',
    evidence: 'docs/evidence/48h-remote/rw2-reduced-wave0-local-state-truth-recovery-20260825.json',
    verifiedImplementationHead: 'bd6c861b2b223e4d3dc179dcdbc1ea5e2e4f9103',
    closureCommit: 'c3ac3b6be4cbd4813c33f24ff629f8d7419243fa',
  })) fail('RW3 predecessor binding is invalid.');

  if (!exact(value.scope, {
    allowed: [
      'serialized-wishlist-read-modify-write',
      'atomic-canonical-wishlist-document',
      'serialized-local-rental-cart-mutations',
      'serialized-guest-cart-sync-boundary',
      'logical-local-revision-events',
      'coalesced-cross-surface-refresh',
      'compact-corruption-and-event-recovery',
      'local-export-and-account-deletion-lifecycle',
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
  })) fail('RW3 scope or deterministic-test policy is invalid.');

  const findingIds = [
    'RW3-P0-WISHLIST-RACE-001',
    'RW3-P0-WISHLIST-TORN-002',
    'RW3-P0-CART-RACE-003',
    'RW3-P1-CROSS-SURFACE-004',
    'RW3-P1-QUEUE-RECOVERY-005',
    'RW3-P1-COMPACT-RECOVERY-006',
    'RW3-P1-LIFECYCLE-007',
  ];
  if (!Array.isArray(value.findings)
      || !exact(value.findings.map(({ id }) => id), findingIds)
      || value.findings.some(({ state, resolution }) =>
        state !== 'resolved-and-tested' || typeof resolution !== 'string' || !resolution)) {
    fail('RW3 finding set is invalid.');
  }

  const fullPassed = value.status !== statuses[0];
  const githubPassed = value.status === statuses[2];
  if (!exact(value.verification, {
    changedFileAnalyze: 'passed-zero-issues',
    focusedRw3Flutter: 'passed-9',
    adjacentFlutterTests: 'passed-34-skipped-2-exact-profile',
    g2LifecycleAndWiringTests: 'passed-9',
    rw3WiringTests: 'passed-6',
    fullTechnicalRegression: fullPassed ? 'passed' : 'pending',
    githubRegression: githubPassed ? 'passed' : 'pending',
    githubCodeql: githubPassed ? 'passed-no-new-alerts' : 'pending',
  })) fail('RW3 verification truth is invalid.');

  if (githubPassed) {
    const github = value.githubVerification;
    if (!github
        || !/^[a-f0-9]{40}$/u.test(github.head ?? '')
        || !Number.isSafeInteger(github.regressionRunId)
        || !Number.isSafeInteger(github.codeqlRunId)
        || github.regressionConclusion !== 'success'
        || github.codeqlConclusion !== 'success'
        || github.openCodeScanningAlerts !== 0) {
      fail('RW3 exact GitHub verification is invalid.');
    }
  } else if (value.githubVerification !== undefined) {
    fail('RW3 GitHub verification must be absent before exact CI passes.');
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
    fail('RW3 gate or boundary truth is invalid.');
  }

  if (!Array.isArray(value.sourceInventory)
      || value.sourceInventory.length !== sourcePaths.length
      || !exact(value.sourceInventory.map(({ path }) => path), sourcePaths)) {
    fail('RW3 source inventory paths are invalid.');
  }
  for (const entry of value.sourceInventory) {
    if (!/^[a-f0-9]{64}$/u.test(entry.sha256 ?? '')) {
      fail(`RW3 source hash is invalid: ${entry.path}`);
    }
    const text = inventorySource(repositoryRoot, sourceTexts, entry.path);
    if (sha256(text) !== entry.sha256) {
      fail(`RW3 source inventory hash is stale: ${entry.path}`);
    }
  }

  assertMarkers(source(repositoryRoot, value.architecture), value.architecture, [
    'Consistency policy',
    'Invocation order, not scheduler timing',
    'one verified canonical',
    'All fixtures are synthetic and local',
  ]);
  assertMarkers(source(repositoryRoot, value.report), value.report, [
    'Focused RW3 result: 9 passed',
    'without a delay, retry',
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
  const result = validateRw3ReducedWave0LocalConcurrencyConsistency();
  process.stdout.write(`RW3 local concurrency evidence valid: ${JSON.stringify(result)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
