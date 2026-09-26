#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { readRepositoryFile } from './read_repository_file.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath =
  'docs/evidence/48h-remote/rw20-listing-mutation-principal-epoch-transaction-20260826.json';
const sourceBindingHead = '9fd6b6023b124e7c7efd9aff518a8c7d61a304a0';
const sourcePaths = [
  'backend/src/app.js',
  'lib/screens/create_listing_screen.dart',
  'lib/screens/explore_screen.dart',
  'lib/screens/my_listings_screen.dart',
  'lib/screens/own_profile_screen.dart',
  'lib/services/auth_service.dart',
  'lib/services/backend_repository.dart',
  'lib/services/data_service.dart',
  'lib/services/listing_mutation_service.dart',
  'lib/services/session_transition_service.dart',
  'lib/services/shared_persistence_sync.dart',
  'lib/widgets/item_details_overlay.dart',
  'lib/widgets/listing_mutation_interaction.dart',
  'lib/widgets/search_header.dart',
  'lib/widgets/tracked_dialog_route.dart',
  'docs/evidence/48h-remote/rw19-profile-location-mutation-principal-epoch-transaction-20260826.json',
  'scripts/technical_regression_check.sh',
  'test/rw7_local_listing_catalog_authorization_durability_test.dart',
  'test/rw19_profile_location_mutation_principal_epoch_transaction_test.dart',
  'test/rw20_listing_mutation_principal_epoch_transaction_test.dart',
  'test/tool/blue_ocean_draft_recovery_wiring.test.mjs',
  'test/tool/blue_ocean_n6_listing_ui_wiring.test.mjs',
  'test/tool/create_listing_photo_async_lifecycle_wiring.test.mjs',
  'test/tool/g5a_supply_enrichment_wiring.test.mjs',
  'test/tool/rw7_local_listing_catalog_authorization_durability_wiring.test.mjs',
  'test/tool/rw20_listing_mutation_principal_epoch_transaction_wiring.test.mjs',
  'test/tool/validate_rw20_listing_mutation_principal_epoch_transaction.test.mjs',
  'tool/validate_rw20_listing_mutation_principal_epoch_transaction.mjs',
  'docs/architecture/rw20-listing-mutation-principal-epoch-transaction-2026-08-26.md',
  'docs/operations/RW20_LISTING_MUTATION_PRINCIPAL_EPOCH_TRANSACTION_CLOSURE_2026-08-26.md',
];

const fail = (message) => { throw new Error(message); };
const exact = (actual, expected) =>
  JSON.stringify(actual) === JSON.stringify(expected);
const source = (repositoryRoot, path) =>
  readRepositoryFile(repositoryRoot, path, { label: `RW20 source ${path}` });
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function sourceAtImplementationHead(repositoryRoot, value, path, sourceTexts) {
  if (Object.hasOwn(sourceTexts, path)) return sourceTexts[path];
  try {
    return execFileSync('git', ['show', `${sourceBindingHead}:${path}`], {
      cwd: repositoryRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch { fail(`RW20 source-binding snapshot is unavailable: ${path}`); }
}
const escapeRegExp = (value) =>
  value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

function repositoryDartPaths(repositoryRoot) {
  const paths = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      if (entry.isFile() && entry.name.endsWith('.dart')) {
        paths.push(relative(repositoryRoot, absolute).replaceAll('\\', '/'));
      }
    }
  };
  visit(join(repositoryRoot, 'lib'));
  return paths.sort();
}

function countCallSites({ repositoryRoot, sourceTexts, symbol }) {
  const matcher = new RegExp(`${escapeRegExp(symbol)}\\s*\\(`, 'gu');
  const counts = {};
  for (const path of repositoryDartPaths(repositoryRoot)) {
    const content = Object.hasOwn(sourceTexts, path)
      ? sourceTexts[path]
      : readFileSync(join(repositoryRoot, path), 'utf8');
    const count = [...content.matchAll(matcher)].length;
    if (count > 0) counts[path] = count;
  }
  return counts;
}

function assertSanitized(value) {
  const serialized = JSON.stringify(value);
  if (/\/Users\/|BEGIN PRIVATE|\bsk-[A-Za-z0-9]|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/u.test(serialized)) {
    fail('RW20 evidence contains private or secret-shaped material.');
  }
}

const rejectionContracts = {
  400: [
    'invalid_listing',
    'listing_title_required',
    'listing_description_too_short',
    'listing_category_required',
    'invalid_listing_condition',
    'invalid_listing_price',
    'listing_location_required',
    'invalid_listing_coordinates',
    'invalid_listing_duration',
    'invalid_handover_radius',
    'listing_photo_required',
    'listing_photo_must_be_uploaded',
    'listing_photo_not_found',
    'listing_photo_not_approved',
    'invalid_listing_status',
    'listing_revision_required',
    'private_pilot_listing_declaration_required',
    'private_pilot_category_not_allowed',
    'private_pilot_subcategory_not_allowed',
    'private_pilot_country_not_allowed',
    'private_pilot_region_not_allowed',
  ],
  401: [
    'authentication_required',
    'invalid_or_expired_session',
    'account_not_active',
  ],
  403: [
    'listing_forbidden',
    'listing_photo_forbidden',
    'action_blocked_by_moderation',
  ],
  404: ['listing_not_found', 'user_not_found'],
  409: [
    'listing_revision_conflict',
    'listing_locked_by_moderation',
    'listing_photo_already_used',
    'private_pilot_account_declaration_required',
    'private_pilot_commercial_review_blocked',
    'private_pilot_listing_declaration_required',
    'private_pilot_category_not_allowed',
    'private_pilot_subcategory_not_allowed',
    'private_pilot_country_not_allowed',
    'private_pilot_region_not_allowed',
    'private_pilot_listing_region_unbound',
  ],
  429: ['rate_limit_exceeded'],
};

export function validateRw20ListingMutationPrincipalEpochTransaction({
  repositoryRoot = root,
  evidence,
  sourceTexts = {},
} = {}) {
  const value = evidence ?? JSON.parse(source(repositoryRoot, evidencePath));
  const statuses = [
    'implemented-focused-passed-full-regression-pending',
    'implemented-full-technical-regression-passed-ci-pending',
    'verified-regression-and-codeql-passed',
  ];
  if (value.schemaVersion !== 1
      || value.kind !== 'sit-rw20-listing-mutation-principal-epoch-transaction'
      || !statuses.includes(value.status)
      || value.implementationBaseHead
        !== '176d35d6622aefaa833b2f2194ab5ae628c93257') {
    fail('RW20 evidence identity is invalid.');
  }
  if (!exact(value.predecessor, {
    package: 'RW19',
    evidence:
      'docs/evidence/48h-remote/rw19-profile-location-mutation-principal-epoch-transaction-20260826.json',
    verifiedImplementationHead: '93b7a4cde7bbcb04f9f6c0c60b26dc5bb941e2ae',
    closureCommit: '176d35d6622aefaa833b2f2194ab5ae628c93257',
  })) fail('RW20 predecessor binding is invalid.');

  if (!Array.isArray(value.findings)
      || value.findings.length !== 8
      || value.findings.some(({ id, state }) =>
        !/^RW20-P[01]-/u.test(id) || state !== 'resolved-and-tested')) {
    fail('RW20 finding closure is invalid.');
  }

  if (!exact(value.definiteRejectionContracts?.listingMutation,
    rejectionContracts)) {
    fail('RW20 definite-rejection contract drifted.');
  }
  if (Object.hasOwn(value.definiteRejectionContracts.listingMutation, '408')) {
    fail('RW20 408 cannot be classified as a definite rejection.');
  }

  const expectedActions = [
    ['create.media-and-upload', 'lib/screens/create_listing_screen.dart'],
    ['create.blue-ocean-analysis-and-review', 'lib/screens/create_listing_screen.dart'],
    ['create.draft', 'lib/screens/create_listing_screen.dart'],
    ['create.publish', 'lib/screens/create_listing_screen.dart'],
    ['edit.update', 'lib/screens/create_listing_screen.dart'],
    ['my-listings.status', 'lib/screens/my_listings_screen.dart'],
    ['my-listings.delete', 'lib/screens/my_listings_screen.dart'],
    ['my-listings.edit-and-preview', 'lib/screens/my_listings_screen.dart'],
    ['own-profile.status', 'lib/screens/own_profile_screen.dart'],
    ['own-profile.preview', 'lib/screens/own_profile_screen.dart'],
    ['explore.created-result', 'lib/screens/explore_screen.dart'],
    ['explore.supply-enrichment', 'lib/screens/explore_screen.dart'],
  ];
  if (!exact(
    value.listingMutationActionInventory
      ?.map(({ id, file, status }) => [id, file, status]),
    expectedActions.map(([id, file]) => [id, file, 'guarded-rw20']),
  )) fail('RW20 listing-action inventory is invalid.');

  const expectedCallSites = [
    ['DataService.addItem', {}],
    ['DataService.addItemForOwner', {
      'lib/services/listing_mutation_service.dart': 1,
    }],
    ['DataService.updateItem', {}],
    ['DataService.updateItemForOwner', {
      'lib/services/listing_mutation_service.dart': 1,
    }],
    ['DataService.updateItemStatus', {}],
    ['DataService.updateItemStatusForOwner', {
      'lib/services/listing_mutation_service.dart': 1,
    }],
    ['DataService.deleteItemById', {}],
    ['DataService.deleteItemByIdForOwner', {
      'lib/services/listing_mutation_service.dart': 1,
    }],
    ['BackendRepository.createListingForOwner', {
      'lib/services/data_service.dart': 1,
    }],
    ['BackendRepository.publishBlueOceanListingForOwner', {
      'lib/services/data_service.dart': 1,
    }],
    ['BackendRepository.updateListingForOwner', {
      'lib/services/data_service.dart': 1,
    }],
    ['BackendRepository.updateListingStatusForOwner', {
      'lib/services/data_service.dart': 1,
    }],
    ['BackendRepository.deleteListingForOwner', {
      'lib/services/data_service.dart': 1,
    }],
    ['ListingMutationInteractionController', {
      'lib/screens/create_listing_screen.dart': 1,
      'lib/screens/explore_screen.dart': 1,
      'lib/screens/my_listings_screen.dart': 1,
      'lib/screens/own_profile_screen.dart': 2,
    }],
  ];
  if (!exact(
    value.callSiteInventory?.map(({ symbol, paths }) => [symbol, paths]),
    expectedCallSites,
  )) fail('RW20 call-site inventory declaration is invalid.');
  for (const [symbol, paths] of expectedCallSites) {
    if (!exact(countCallSites({ repositoryRoot, sourceTexts, symbol }), paths)) {
      fail(`RW20 call-site inventory drifted for ${symbol}.`);
    }
  }

  const fullPassed = value.status !== statuses[0];
  const githubPassed = value.status === statuses[2];
  const toolInventoryPassed = /^passed-[0-9]+$/u.test(
    value.verification?.completeToolInventory ?? '',
  );
  if (value.verification?.redFirst
        !== 'failed-missing-owner-bound-listing-coordinator-typed-results-exact-route-and-account-transition-contract-before-fix'
      || value.verification?.focusedRw20Flutter !== 'passed-13'
      || value.verification?.rw7Rw19CompatibilityFlutter !== 'passed-24'
      || value.verification?.changedFileAnalyze !== 'passed-zero-issues'
      || value.verification?.rw20WiringTests !== 'passed-8'
      || !['pending', 'passed-3'].includes(value.verification?.rw20ValidatorTests)
      || !/^pending$|^passed-[0-9]+$/u.test(value.verification?.completeToolInventory ?? '')
      || (fullPassed && value.verification.rw20ValidatorTests !== 'passed-3')
      || (fullPassed && !/^passed-[0-9]+$/u.test(value.verification.completeToolInventory))
      || value.verification?.completeToolInventorySkipped !== 0
      || value.verification?.fullTechnicalRegression
        !== (fullPassed ? 'passed' : 'pending')
      || value.verification?.githubRegression
        !== (githubPassed ? 'passed' : 'pending')
      || value.verification?.githubCodeql
        !== (githubPassed ? 'passed-no-new-alerts' : 'pending')) {
    fail('RW20 verification truth is invalid.');
  }

  if (value.inventoryAudit?.predecessorRepositoryOwnedFiles !== 358
      || value.inventoryAudit?.predecessorPassedTests !== 1945
      || value.inventoryAudit?.skippedTests !== 0
      || value.inventoryAudit?.executionPattern !== 'node --test test/tool/*.test.mjs'
      || value.inventoryAudit?.standardNodeParallelism !== true
      || (toolInventoryPassed
        ? (!Number.isInteger(value.inventoryAudit.closureRepositoryOwnedFiles)
          || !Number.isInteger(value.inventoryAudit.closurePassedTests)
          || value.inventoryAudit.closurePassedTests <= 1945)
        : (value.inventoryAudit.closureRepositoryOwnedFiles !== null
          || value.inventoryAudit.closurePassedTests !== null))) {
    fail('RW20 complete tool inventory is invalid.');
  }

  if (fullPassed) {
    if (!/^[a-f0-9]{40}$/u.test(value.implementationHead ?? '')
        || value.localRegression?.head !== value.implementationHead
        || value.localRegression?.standardParallelism !== true
        || value.localRegression?.timingWorkaroundUsed !== false
        || value.localRegression?.parallelismReductionUsed !== false) {
      fail('RW20 full-regression evidence is invalid.');
    }
  } else if (value.implementationHead !== null || value.localRegression !== null) {
    fail('RW20 cannot bind an implementation head before full regression.');
  }
  if (githubPassed) {
    const github = value.githubVerification;
    if (github?.head !== value.implementationHead
        || !Number.isInteger(github?.regressionRunId)
        || !Number.isInteger(github?.codeqlRunId)
        || github?.regressionConclusion !== 'success'
        || github?.codeqlConclusion !== 'success'
        || github?.openCodeScanningAlerts !== 0) {
      fail('RW20 GitHub verification is invalid.');
    }
  } else if (value.githubVerification !== null) {
    fail('RW20 cannot claim GitHub verification while CI is pending.');
  }

  if (value.ratchetAudit?.privacyDisclosureSemanticsChanged !== false
      || value.ratchetAudit?.retentionSemanticsChanged !== false
      || value.ratchetAudit?.backendRouteOrSchemaChanged !== false
      || value.ratchetAudit?.providerDecisionChanged !== false
      || value.ratchetAudit?.rw19VerifiedHeadChanged !== false
      || value.ratchetAudit?.rw19ClosureHeadChanged !== false
      || value.ratchetAudit?.timingWorkaroundIntroduced !== false) {
    fail('RW20 ratchet cause or boundary is invalid.');
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
    fail('RW20 gate or boundary truth is invalid.');
  }
  if (!Array.isArray(value.residualRisks)
      || value.residualRisks.length !== 4
      || value.residualRisks.some((entry) => typeof entry !== 'string' || !entry)) {
    fail('RW20 residual-risk truth is invalid.');
  }

  if (!Array.isArray(value.sourceInventory)
      || value.sourceInventory.length !== sourcePaths.length
      || !exact(value.sourceInventory.map(({ path }) => path), sourcePaths)) {
    fail('RW20 source inventory paths are invalid.');
  }
  for (const entry of value.sourceInventory) {
    const content = sourceAtImplementationHead(repositoryRoot, value, entry.path, sourceTexts);
    if (!/^[a-f0-9]{64}$/u.test(entry.sha256)
        || sha256(content) !== entry.sha256) {
      fail(`RW20 source inventory hash is stale: ${entry.path}`);
    }
  }
  assertSanitized(value);
  return {
    status: value.status,
    resolvedFindings: value.findings.length,
    openActions: value.listingMutationActionInventory
      .filter(({ status }) => status.startsWith('open-')).length,
    focusedRw20Flutter: value.verification.focusedRw20Flutter,
    residualRisks: value.residualRisks.length,
  };
}

function main() {
  const result = validateRw20ListingMutationPrincipalEpochTransaction();
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1]
    && import.meta.url === pathToFileURL(process.argv[1]).href) main();
