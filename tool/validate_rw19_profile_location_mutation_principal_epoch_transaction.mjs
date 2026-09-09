#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { readRepositoryFile } from './read_repository_file.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath =
  'docs/evidence/48h-remote/rw19-profile-location-mutation-principal-epoch-transaction-20260826.json';
const sourceBindingHead = '9fd6b6023b124e7c7efd9aff518a8c7d61a304a0';
const sourcePaths = [
  'backend/src/app.js',
  'lib/screens/change_address_screen.dart',
  'lib/screens/contact_data_screen.dart',
  'lib/screens/edit_profile_screen.dart',
  'lib/screens/edit_social_media_screen.dart',
  'lib/screens/explore_screen.dart',
  'lib/screens/own_profile_screen.dart',
  'lib/screens/profile_info_screen.dart',
  'lib/services/auth_service.dart',
  'lib/services/backend_repository.dart',
  'lib/services/data_service.dart',
  'lib/services/profile_mutation_service.dart',
  'lib/services/session_transition_service.dart',
  'lib/services/shared_persistence_sync.dart',
  'lib/widgets/profile_mutation_interaction.dart',
  'lib/widgets/tracked_dialog_route.dart',
  'docs/evidence/48h-remote/rw18-contact-verification-principal-epoch-transaction-20260826.json',
  'scripts/technical_regression_check.sh',
  'test/rw9_local_account_profile_authorization_durability_test.dart',
  'test/rw19_profile_location_mutation_principal_epoch_transaction_test.dart',
  'test/tool/profile_info_async_lifecycle_wiring.test.mjs',
  'test/tool/rw9_local_account_profile_authorization_durability_wiring.test.mjs',
  'test/tool/rw19_profile_location_mutation_principal_epoch_transaction_wiring.test.mjs',
  'test/tool/validate_rw19_profile_location_mutation_principal_epoch_transaction.test.mjs',
  'tool/validate_rw19_profile_location_mutation_principal_epoch_transaction.mjs',
  'docs/architecture/rw19-profile-location-mutation-principal-epoch-transaction-2026-08-26.md',
  'docs/operations/RW19_PROFILE_LOCATION_MUTATION_PRINCIPAL_EPOCH_TRANSACTION_CLOSURE_2026-08-26.md',
];

const fail = (message) => { throw new Error(message); };
const exact = (actual, expected) =>
  JSON.stringify(actual) === JSON.stringify(expected);
const source = (repositoryRoot, path) =>
  readRepositoryFile(repositoryRoot, path, { label: `RW19 source ${path}` });
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function sourceAtImplementationHead(repositoryRoot, value, path, sourceTexts) {
  if (Object.hasOwn(sourceTexts, path)) return sourceTexts[path];
  try {
    return execFileSync('git', ['show', `${sourceBindingHead}:${path}`], {
      cwd: repositoryRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch { fail(`RW19 source-binding snapshot is unavailable: ${path}`); }
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
    fail('RW19 evidence contains private or secret-shaped material.');
  }
}

export function validateRw19ProfileLocationMutationPrincipalEpochTransaction({
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
      || value.kind !== 'sit-rw19-profile-location-mutation-principal-epoch-transaction'
      || !statuses.includes(value.status)
      || value.implementationBaseHead
        !== '37c313a62daf79a34352fd3f34ba16b9db8dc4a4') {
    fail('RW19 evidence identity is invalid.');
  }
  if (!exact(value.predecessor, {
    package: 'RW18',
    evidence:
      'docs/evidence/48h-remote/rw18-contact-verification-principal-epoch-transaction-20260826.json',
    verifiedImplementationHead: '83706e0e22a1b3fe1a8c876d0515d3eb41740a39',
    closureCommit: '37c313a62daf79a34352fd3f34ba16b9db8dc4a4',
  })) fail('RW19 predecessor binding is invalid.');

  if (!Array.isArray(value.findings)
      || value.findings.length !== 8
      || value.findings.some(({ id, state }) =>
        !/^RW19-P[01]-/u.test(id) || state !== 'resolved-and-tested')) {
    fail('RW19 finding closure is invalid.');
  }

  if (!exact(value.definiteRejectionContracts?.profileMutation, [
    { status: 400, code: 'minimum_age_required' },
    { status: 400, code: 'invalid_phone' },
    { status: 401, code: 'authentication_required' },
    { status: 401, code: 'invalid_or_expired_session' },
    { status: 401, code: 'account_not_active' },
    { status: 404, code: 'user_not_found' },
  ])) fail('RW19 definite-rejection contract drifted.');
  if (value.definiteRejectionContracts.profileMutation
    .some(({ status }) => status === 408)) {
    fail('RW19 408 cannot be classified as a definite rejection.');
  }

  const expectedActions = [
    ['profile.address', 'lib/screens/change_address_screen.dart'],
    ['contact.address', 'lib/screens/contact_data_screen.dart'],
    ['contact.coordinates', 'lib/screens/contact_data_screen.dart'],
    ['profile.compact', 'lib/screens/edit_profile_screen.dart'],
    ['profile.social-links', 'lib/screens/edit_social_media_screen.dart'],
    ['explore.manual-city', 'lib/screens/explore_screen.dart'],
    ['explore.automatic-location', 'lib/screens/explore_screen.dart'],
    ['own-profile.biography', 'lib/screens/own_profile_screen.dart'],
    ['own-profile.interests', 'lib/screens/own_profile_screen.dart'],
    ['profile-info.full', 'lib/screens/profile_info_screen.dart'],
    ['profile-info.photo', 'lib/screens/profile_info_screen.dart'],
    ['profile-info.languages-and-interests', 'lib/screens/profile_info_screen.dart'],
  ];
  if (!exact(
    value.profileMutationActionInventory
      ?.map(({ id, file, status }) => [id, file, status]),
    expectedActions.map(([id, file]) => [id, file, 'guarded-rw19']),
  )) fail('RW19 profile-action inventory is invalid.');

  const expectedCallSites = [
    ['DataService.updateCurrentUserProfile', {}],
    ['DataService.updateCurrentUserProfileForOwner', {
      'lib/services/profile_mutation_service.dart': 1,
    }],
    ['BackendRepository.updateCurrentProfile', {
      'lib/services/data_service.dart': 1,
    }],
    ['BackendRepository.updateCurrentProfileForOwner', {
      'lib/services/data_service.dart': 1,
    }],
    ['BackendRepository.getCurrentProfileForOwner', {
      'lib/services/data_service.dart': 1,
    }],
    ['.updateProfile', {
      'lib/screens/change_address_screen.dart': 1,
      'lib/screens/contact_data_screen.dart': 2,
      'lib/screens/edit_profile_screen.dart': 1,
      'lib/screens/edit_social_media_screen.dart': 1,
      'lib/screens/explore_screen.dart': 1,
      'lib/screens/own_profile_screen.dart': 2,
      'lib/screens/profile_info_screen.dart': 1,
    }],
    ['ProfileMutationInteractionController', {
      'lib/screens/change_address_screen.dart': 1,
      'lib/screens/contact_data_screen.dart': 1,
      'lib/screens/edit_profile_screen.dart': 1,
      'lib/screens/edit_social_media_screen.dart': 1,
      'lib/screens/explore_screen.dart': 1,
      'lib/screens/own_profile_screen.dart': 1,
      'lib/screens/profile_info_screen.dart': 1,
    }],
    ['.removeOwnedNavigationRoute', {
      'lib/screens/change_address_screen.dart': 1,
      'lib/screens/create_listing_screen.dart': 1,
      'lib/screens/edit_profile_screen.dart': 1,
      'lib/screens/edit_social_media_screen.dart': 1,
      'lib/screens/profile_info_screen.dart': 1,
    }],
  ];
  if (!exact(
    value.callSiteInventory?.map(({ symbol, paths }) => [symbol, paths]),
    expectedCallSites,
  )) fail('RW19 call-site inventory declaration is invalid.');
  for (const [symbol, paths] of expectedCallSites) {
    if (!exact(countCallSites({ repositoryRoot, sourceTexts, symbol }), paths)) {
      fail(`RW19 call-site inventory drifted for ${symbol}.`);
    }
  }

  const fullPassed = value.status !== statuses[0];
  const githubPassed = value.status === statuses[2];
  if (value.verification?.redFirst
        !== 'failed-missing-owner-bound-profile-coordinator-typed-results-exact-route-and-account-transition-contract-before-fix'
      || value.verification?.focusedRw19Flutter !== 'passed-9'
      || value.verification?.rw9Rw18CompatibilityFlutter !== 'passed-30'
      || value.verification?.changedFileAnalyze !== 'passed-zero-issues'
      || value.verification?.rw19WiringTests !== 'passed-8'
      || !['pending', 'passed-3'].includes(value.verification?.rw19ValidatorTests)
      || !/^pending$|^passed-[0-9]+$/u.test(value.verification?.completeToolInventory ?? '')
      || (fullPassed && value.verification.rw19ValidatorTests !== 'passed-3')
      || (fullPassed && !/^passed-[0-9]+$/u.test(value.verification.completeToolInventory))
      || value.verification?.completeToolInventorySkipped !== 0
      || value.verification?.fullTechnicalRegression
        !== (fullPassed ? 'passed' : 'pending')
      || value.verification?.githubRegression
        !== (githubPassed ? 'passed' : 'pending')
      || value.verification?.githubCodeql
        !== (githubPassed ? 'passed-no-new-alerts' : 'pending')) {
    fail('RW19 verification truth is invalid.');
  }

  if (value.inventoryAudit?.predecessorRepositoryOwnedFiles !== 349
      || value.inventoryAudit?.predecessorPassedTests !== 1934
      || value.inventoryAudit?.skippedTests !== 0
      || value.inventoryAudit?.executionPattern
        !== 'node --test test/tool/*.test.mjs'
      || value.inventoryAudit?.standardNodeParallelism !== true
      || (fullPassed
        ? (!Number.isInteger(value.inventoryAudit.closureRepositoryOwnedFiles)
          || !Number.isInteger(value.inventoryAudit.closurePassedTests)
          || value.inventoryAudit.closurePassedTests <= 1934)
        : (value.inventoryAudit.closureRepositoryOwnedFiles !== null
          || value.inventoryAudit.closurePassedTests !== null))) {
    fail('RW19 complete tool inventory is invalid.');
  }

  if (fullPassed) {
    if (!/^[a-f0-9]{40}$/u.test(value.implementationHead ?? '')
        || value.localRegression?.head !== value.implementationHead
        || value.localRegression?.standardParallelism !== true
        || value.localRegression?.timingWorkaroundUsed !== false
        || value.localRegression?.parallelismReductionUsed !== false) {
      fail('RW19 full-regression evidence is invalid.');
    }
  } else if (value.implementationHead !== null || value.localRegression !== null) {
    fail('RW19 cannot bind an implementation head before full regression.');
  }
  if (githubPassed) {
    const github = value.githubVerification;
    if (github?.head !== value.implementationHead
        || !Number.isInteger(github?.regressionRunId)
        || !Number.isInteger(github?.codeqlRunId)
        || github?.regressionConclusion !== 'success'
        || github?.codeqlConclusion !== 'success'
        || github?.openCodeScanningAlerts !== 0) {
      fail('RW19 GitHub verification is invalid.');
    }
  } else if (value.githubVerification !== null) {
    fail('RW19 cannot claim GitHub verification while CI is pending.');
  }

  if (value.ratchetAudit?.privacyDisclosureSemanticsChanged !== false
      || value.ratchetAudit?.retentionSemanticsChanged !== false
      || value.ratchetAudit?.backendRouteOrSchemaChanged !== false
      || value.ratchetAudit?.providerDecisionChanged !== false
      || value.ratchetAudit?.rw18VerifiedHeadChanged !== false
      || value.ratchetAudit?.rw18ClosureHeadChanged !== false
      || value.ratchetAudit?.timingWorkaroundIntroduced !== false) {
    fail('RW19 ratchet cause or boundary is invalid.');
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
    fail('RW19 gate or boundary truth is invalid.');
  }
  if (!Array.isArray(value.residualRisks)
      || value.residualRisks.length !== 4
      || value.residualRisks.some((entry) => typeof entry !== 'string' || !entry)) {
    fail('RW19 residual-risk truth is invalid.');
  }

  if (!Array.isArray(value.sourceInventory)
      || value.sourceInventory.length !== sourcePaths.length
      || !exact(value.sourceInventory.map(({ path }) => path), sourcePaths)) {
    fail('RW19 source inventory paths are invalid.');
  }
  for (const entry of value.sourceInventory) {
    const content = sourceAtImplementationHead(repositoryRoot, value, entry.path, sourceTexts);
    if (!/^[a-f0-9]{64}$/u.test(entry.sha256)
        || sha256(content) !== entry.sha256) {
      fail(`RW19 source inventory hash is stale: ${entry.path}`);
    }
  }
  assertSanitized(value);
  return {
    status: value.status,
    resolvedFindings: value.findings.length,
    openActions: value.profileMutationActionInventory
      .filter(({ status }) => status.startsWith('open-')).length,
    focusedRw19Flutter: value.verification.focusedRw19Flutter,
    residualRisks: value.residualRisks.length,
  };
}

function main() {
  const result = validateRw19ProfileLocationMutationPrincipalEpochTransaction();
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1]
    && import.meta.url === pathToFileURL(process.argv[1]).href) main();
