#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { readRepositoryFile } from './read_repository_file.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath =
  'docs/evidence/48h-remote/rw2-reduced-wave0-local-state-truth-recovery-20260825.json';
const sourceInventoryHead = '7d2df51c25ebbe94ee41dd075d8512c5e7439f11';
const sourcePaths = [
  'lib/services/data_service.dart',
  'lib/screens/explore_screen.dart',
  'lib/screens/search_results_screen.dart',
  'lib/screens/wishlists_screen.dart',
  'lib/widgets/item_card.dart',
  'lib/widgets/item_details_overlay.dart',
  'lib/widgets/listing_options_dialog.dart',
  'lib/widgets/local_state_error_panel.dart',
  'lib/widgets/wishlist_selection_sheet.dart',
  'scripts/technical_regression_check.sh',
  'test/g2a_rental_cart_screen_test.dart',
  'test/local_state_error_panel_semantics_test.dart',
  'test/reduced_wave0_local_state_truth_recovery_test.dart',
  'test/tool/listing_options_async_context_wiring.test.mjs',
  'test/tool/rw2_reduced_wave0_local_state_truth_recovery_wiring.test.mjs',
];

const fail = (message) => { throw new Error(message); };
const exact = (actual, expected) => JSON.stringify(actual) === JSON.stringify(expected);
const source = (repositoryRoot, path) =>
  readRepositoryFile(repositoryRoot, path, { label: `RW2 source ${path}` });
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
    fail(`RW2 historical source is unavailable: ${path}`);
  }
}

function assertMarkers(content, path, expected) {
  for (const marker of expected) {
    if (!content.includes(marker)) fail(`RW2 marker missing in ${path}: ${marker}`);
  }
}

function assertSanitized(value) {
  const serialized = JSON.stringify(value);
  if (/\/Users\/|BEGIN PRIVATE|\bsk-[A-Za-z0-9]|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/u.test(serialized)) {
    fail('RW2 evidence contains private or secret-shaped material.');
  }
}

export function validateRw2ReducedWave0LocalStateTruthRecovery({
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
      || value.kind !== 'sit-rw2-reduced-wave0-local-state-truth-recovery'
      || !statuses.includes(value.status)
      || value.implementationBaseHead !== 'ffa1d0bda9127db331e5b906dd950d608ab3f749') {
    fail('RW2 evidence identity is invalid.');
  }
  if (!exact(value.predecessor, {
    package: 'RW1',
    evidence: 'docs/evidence/48h-remote/rw1-reduced-wave0-accessibility-resilience-20260825.json',
    verifiedImplementationHead: '13bf29bce7911bf95e339ff61744c678aeafdce4',
    closureCommit: 'ffa1d0bda9127db331e5b906dd950d608ab3f749',
  })) fail('RW2 predecessor binding is invalid.');

  if (!exact(value.scope, {
    allowed: [
      'category-reference-cache-recovery',
      'wishlist-metadata-and-assignment-validation',
      'saved-listing-grouping-truth',
      'verified-local-wishlist-and-cart-writes',
      'persistent-retry-and-last-known-good-ui',
      'search-explore-card-options-and-detail-saved-state',
      'compact-large-text-semantics-and-rapid-interaction',
      'process-style-local-store-recreation',
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
    selfHealingReferenceKeys: ['categories'],
    selfHealingUserOwnedKeys: [],
  })) fail('RW2 scope or self-healing policy is invalid.');

  const findingIds = [
    'RW2-P1-REFERENCE-CACHE-001',
    'RW2-P0-WISHLIST-METADATA-002',
    'RW2-P0-WISHLIST-ASSIGNMENTS-003',
    'RW2-P1-SAVED-LISTINGS-004',
    'RW2-P1-PERSISTENT-ERROR-005',
    'RW2-P1-RAPID-ACTION-006',
    'RW2-P1-ADJACENT-SAVED-STATE-007',
  ];
  if (!Array.isArray(value.findings)
      || !exact(value.findings.map(({ id }) => id), findingIds)
      || value.findings.some(({ state, resolution }) =>
        state !== 'resolved-and-tested' || typeof resolution !== 'string' || !resolution)) {
    fail('RW2 finding set is invalid.');
  }

  const fullPassed = value.status !== statuses[0];
  const githubPassed = value.status === statuses[2];
  if (!exact(value.verification, {
    changedFileAnalyze: 'passed-zero-issues',
    focusedRw2Flutter: 'passed-13',
    adjacentFlutterTests: 'passed',
    adjacentLifecycleWiringTests: 'passed-19',
    rw2WiringTests: 'passed-5',
    fullTechnicalRegression: fullPassed ? 'passed' : 'pending',
    githubRegression: githubPassed ? 'passed' : 'pending',
    githubCodeql: githubPassed ? 'passed-no-new-alerts' : 'pending',
  })) fail('RW2 verification truth is invalid.');

  if (githubPassed) {
    const github = value.githubVerification;
    if (!github
        || !/^[a-f0-9]{40}$/u.test(github.head ?? '')
        || !Number.isSafeInteger(github.regressionRunId)
        || !Number.isSafeInteger(github.codeqlRunId)
        || github.regressionConclusion !== 'success'
        || github.codeqlConclusion !== 'success'
        || github.openCodeScanningAlerts !== 0) {
      fail('RW2 exact GitHub verification is invalid.');
    }
  } else if (value.githubVerification !== undefined) {
    fail('RW2 GitHub verification must be absent before exact CI passes.');
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
    fail('RW2 gate or boundary truth is invalid.');
  }

  if (!Array.isArray(value.sourceInventory)
      || value.sourceInventory.length !== sourcePaths.length
      || !exact(value.sourceInventory.map(({ path }) => path), sourcePaths)) {
    fail('RW2 source inventory paths are invalid.');
  }
  for (const entry of value.sourceInventory) {
    if (!/^[a-f0-9]{64}$/u.test(entry.sha256 ?? '')) {
      fail(`RW2 source hash is invalid: ${entry.path}`);
    }
    const text = inventorySource(repositoryRoot, sourceTexts, entry.path);
    if (sha256(text) !== entry.sha256) {
      fail(`RW2 source inventory hash is stale: ${entry.path}`);
    }
  }

  assertMarkers(source(repositoryRoot, value.architecture), value.architecture, [
    'State policy',
    'Only category reference data is safely reconstructible',
    'Persistent error plus explicit retry',
    'All fixtures are synthetic and local',
  ]);
  assertMarkers(source(repositoryRoot, value.report), value.report, [
    'Focused RW2 result: 13 passed',
    'No retry loop, delay, serial execution',
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
  const result = validateRw2ReducedWave0LocalStateTruthRecovery();
  process.stdout.write(`RW2 local-state evidence valid: ${JSON.stringify(result)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
