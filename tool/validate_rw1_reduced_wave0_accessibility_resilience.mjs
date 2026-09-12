#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { readRepositoryFile } from './read_repository_file.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath =
  'docs/evidence/48h-remote/rw1-reduced-wave0-accessibility-resilience-20260825.json';
const sourceInventoryHead = '7d2df51c25ebbe94ee41dd075d8512c5e7439f11';
const sourcePaths = [
  'lib/screens/create_listing_screen.dart',
  'lib/screens/wishlists_screen.dart',
  'lib/widgets/app_popup.dart',
  'lib/widgets/listing_options_dialog.dart',
  'scripts/technical_regression_check.sh',
  'test/reduced_wave0_accessibility_resilience_test.dart',
  'test/tool/rw1_reduced_wave0_accessibility_resilience_wiring.test.mjs',
];

const fail = (message) => { throw new Error(message); };
const exact = (actual, expected) => JSON.stringify(actual) === JSON.stringify(expected);
const source = (repositoryRoot, path) =>
  readRepositoryFile(repositoryRoot, path, { label: `RW1 source ${path}` });
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
    fail(`RW1 historical source is unavailable: ${path}`);
  }
}

function assertMarkers(content, path, expected) {
  for (const marker of expected) {
    if (!content.includes(marker)) fail(`RW1 marker missing in ${path}: ${marker}`);
  }
}

function assertSanitized(value) {
  const serialized = JSON.stringify(value);
  if (/\/Users\/|BEGIN PRIVATE|\bsk-[A-Za-z0-9]|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/u.test(serialized)) {
    fail('RW1 evidence contains private or secret-shaped material.');
  }
}

export function validateRw1ReducedWave0AccessibilityResilience({
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
      || value.kind !== 'sit-rw1-reduced-wave0-accessibility-resilience'
      || !statuses.includes(value.status)
      || value.implementationBaseHead !== 'ccdc1ec981d0f520605bf5900ccc0ae4e9fad787') {
    fail('RW1 evidence identity is invalid.');
  }
  if (!exact(value.predecessor, {
    package: 'RW0',
    evidence: 'docs/evidence/48h-remote/rw0-reduced-wave0-product-journey-20260825.json',
    verifiedImplementationHead: 'ce37ecc89af1a5176d4afaa608ddd1f3552d2512',
    closureCommit: 'ccdc1ec981d0f520605bf5900ccc0ae4e9fad787',
  })) fail('RW1 predecessor binding is invalid.');

  if (!exact(value.scope, {
    viewportDp: [320, 568],
    textScale: 2,
    allowed: [
      'listing-options-and-feedback',
      'search-and-saved-selection',
      'listing-form-and-publication-controls',
      'non-reserving-cart-and-project-controls',
      'keyboard-focus-and-route-recreation',
      'rw0-restart-and-corrupt-store-regression',
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
  })) fail('RW1 scope is invalid.');

  const findingIds = [
    'RW1-P1-LISTING-OPTIONS-SCROLL-001',
    'RW1-P1-APP-POPUP-SCROLL-002',
    'RW1-P1-CART-COMPACT-LAYOUT-003',
    'RW1-P1-LISTING-COMPACT-LAYOUT-004',
    'RW1-P2-OPTION-SEMANTICS-005',
  ];
  if (!Array.isArray(value.findings)
      || !exact(value.findings.map(({ id }) => id), findingIds)
      || value.findings.some(({ state, resolution }) =>
        state !== 'resolved-and-tested' || typeof resolution !== 'string' || !resolution)) {
    fail('RW1 finding set is invalid.');
  }

  const fullPassed = value.status !== statuses[0];
  const githubPassed = value.status === statuses[2];
  if (!exact(value.verification, {
    changedFileAnalyze: 'passed-zero-issues',
    compactDefaultProfile: 'passed-5-one-documented-profile-skip',
    compactExactProfile: 'passed-6',
    adjacentFlutterTests: 'passed-16-two-documented-profile-skips',
    adjacentLifecycleWiringTests: 'passed-16',
    rw1WiringTests: 'passed-4',
    fullTechnicalRegression: fullPassed ? 'passed' : 'pending',
    githubRegression: githubPassed ? 'passed' : 'pending',
    githubCodeql: githubPassed ? 'passed-no-new-alerts' : 'pending',
  })) fail('RW1 verification truth is invalid.');

  if (githubPassed) {
    const github = value.githubVerification;
    if (!github
        || !/^[a-f0-9]{40}$/u.test(github.head ?? '')
        || !Number.isSafeInteger(github.regressionRunId)
        || !Number.isSafeInteger(github.codeqlRunId)
        || github.regressionConclusion !== 'success'
        || github.codeqlConclusion !== 'success'
        || github.openCodeScanningAlerts !== 0) {
      fail('RW1 exact GitHub verification is invalid.');
    }
  } else if (value.githubVerification !== undefined) {
    fail('RW1 GitHub verification must be absent before exact CI passes.');
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
    fail('RW1 gate or boundary truth is invalid.');
  }

  if (!Array.isArray(value.sourceInventory)
      || value.sourceInventory.length !== sourcePaths.length
      || !exact(value.sourceInventory.map(({ path }) => path), sourcePaths)) {
    fail('RW1 source inventory paths are invalid.');
  }
  for (const entry of value.sourceInventory) {
    if (!/^[a-f0-9]{64}$/u.test(entry.sha256 ?? '')) {
      fail(`RW1 source hash is invalid: ${entry.path}`);
    }
    const text = inventorySource(repositoryRoot, sourceTexts, entry.path);
    if (sha256(text) !== entry.sha256) {
      fail(`RW1 source inventory hash is stale: ${entry.path}`);
    }
  }

  assertMarkers(source(repositoryRoot, value.architecture), value.architecture, [
    'Exact matrix',
    'Red-first findings closed',
    '320 dp viewport and 200 percent text',
    'RW1 uses synthetic local data only',
  ]);
  assertMarkers(source(repositoryRoot, value.report), value.report, [
    'ordinary profile: five passed',
    'exact Stage-A/Blue-Ocean profile: six passed',
    'Full local regression and exact GitHub',
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
  const result = validateRw1ReducedWave0AccessibilityResilience();
  process.stdout.write(`RW1 accessibility/resilience evidence valid: ${JSON.stringify(result)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
