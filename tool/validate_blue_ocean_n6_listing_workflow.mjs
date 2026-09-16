#!/usr/bin/env node

import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { readRepositoryFile } from './read_repository_file.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath = 'docs/evidence/blue-ocean/n6-listing-workflow-20260824.json';

function fail(message) {
  throw new Error(message);
}

function exact(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function source(repositoryRoot, path) {
  return readRepositoryFile(repositoryRoot, path, { label: `N6 source ${path}` });
}

function requireMarkers(content, path, markers) {
  for (const marker of markers) {
    if (!content.includes(marker)) fail(`N6 marker missing in ${path}: ${marker}`);
  }
}

export function validateBlueOceanN6ListingWorkflow({
  repositoryRoot = root,
  evidence,
} = {}) {
  const value = evidence ?? JSON.parse(source(repositoryRoot, evidencePath));
  const validStatuses = [
    'implemented-targeted-tests-passed-full-regression-pending',
    'implemented-full-regression-passed-ci-pending',
    'verified-ready-for-n7',
  ];
  if (value.schemaVersion !== 1
      || value.kind !== 'sit-stage-a-blue-ocean-n6-listing-workflow'
      || !validStatuses.includes(value.status)
      || value.implementationBaseHead !== 'c0457ccbfe2cc7928cba57ed5fe7de5d0ce7a48c') {
    fail('N6 evidence identity is invalid.');
  }
  if (!exact(value.workflow, {
    version: 'N6-2026-08-24.1',
    imageCountMinimum: 1,
    imageCountMaximum: 4,
    draftFieldCount: 13,
    clarificationMaximum: 3,
    ownerConfirmationCount: 11,
    priceAuthority: 'SIT_REGIONAL_PRICE_ENGINE_V2',
    quoteAuthority: 'V5.2_QUOTE_ENGINE',
    readinessStates: ['NEEDS_REVIEW', 'READY_TO_PUBLISH'],
    explicitPublicationAction: 'Anzeige veröffentlichen',
    automaticPublicationAllowed: false,
  })) {
    fail('N6 workflow, readiness or publication contract is invalid.');
  }
  if (!exact(value.accessAndFailure, {
    flutterGateDefaultEnabled: false,
    backendProviderRequired: 'mock',
    backendBudgetCents: 0,
    productionMockAllowed: false,
    defaultVisualScreenCompleted: false,
    completedVisualScreenAdapterScope: 'injected-test-only',
    manualEditorPreserved: true,
    photosPreservedOnFallback: true,
    manualInputsPreservedOnFallback: true,
    automaticRetryAllowed: false,
  })) {
    fail('N6 access or safe-fallback contract is invalid.');
  }
  if (!exact(value.ownerReview, {
    confidenceTextAndIconRequired: true,
    lowConfidencePrefillAllowed: false,
    functionalityConfirmationBlocks: true,
    replacementBandConfirmationRequired: true,
    ownerPriceEditable: true,
    ownerPriceConfirmationRequired: true,
    durationPricingEditable: true,
    durationPricingDisableAllowed: true,
    feePreviewSimulationOnly: true,
    noColorOnlyMeaning: true,
    errorFocusRecovery: true,
    screenReaderLiveProgress: true,
  })) {
    fail('N6 owner-review or accessibility contract is invalid.');
  }
  if (!exact(value.persistence, {
    migration: '068_blue_ocean_listing_workflow',
    additive: true,
    historicalListingsRewritten: false,
    draftRevisionsAppendOnly: true,
    priceSnapshotsAppendOnly: true,
    publicationReceiptImmutable: true,
    publicationAtomicWithListing: true,
    rollbackBlockedWhenPublicationDataExists: true,
    privacyIntegrationPackage: 'N8',
  })) {
    fail('N6 persistence, atomicity or rollback contract is invalid.');
  }
  if (!exact(value.boundaries, {
    authenticatedTechnicalRouteAdded: true,
    runtimeDefaultEnabled: false,
    realImageScannerImplemented: false,
    externalProviderCallPerformed: false,
    paidCallPerformed: false,
    billingActivated: false,
    secretStored: false,
    realPersonDataUsed: false,
    productionChanged: false,
    vpsChanged: false,
    dnsChanged: false,
    cloudChanged: false,
    firebaseChanged: false,
    storeChanged: false,
    appleChanged: false,
    realMoneyEnabled: false,
    publicReleasePerformed: false,
    listingAutoPublished: false,
    pullRequestMerged: false,
    historyRewritten: false,
  })) {
    fail('N6 mutation boundary is invalid.');
  }

  const fullRegressionPassed = value.status !== validStatuses[0];
  const githubPassed = value.status === 'verified-ready-for-n7';
  const expectedPostgres = 'passed';
  if (!exact(value.targetedVerification, {
    workflowSyntax: 'passed',
    workflowTests: 'passed-5',
    uiWiringTests: 'passed-7',
    artifactValidatorTests: 'passed-7',
    artifactValidator: 'passed',
    flutterAnalyze: 'passed',
    backendSuite: 'passed-663-one-documented-skip',
    postgres16MigrationAndRouteIntegration: expectedPostgres,
    fullTechnicalRegression: fullRegressionPassed ? 'passed-candidate-rollover-mode' : 'pending',
    githubRegression: githubPassed ? 'passed' : 'pending',
    githubCodeql: githubPassed ? 'passed' : 'pending',
  })) {
    fail('N6 verification record is invalid for its status.');
  }
  if (value.nextPackage !== 'N7') fail('N6 next package is invalid.');
  if (githubPassed) {
    const verification = value.exactGitHubVerification;
    if (!verification
        || !/^[a-f0-9]{40}$/u.test(verification.headSha ?? '')
        || !Number.isSafeInteger(verification.regressionRunId)
        || verification.regressionConclusion !== 'success'
        || !Number.isSafeInteger(verification.codeqlRunId)
        || verification.codeqlConclusion !== 'success') {
      fail('N6 exact GitHub verification is invalid.');
    }
  } else if (value.exactGitHubVerification !== undefined) {
    fail('N6 cannot bind exact GitHub verification before CI is complete.');
  }

  const workflowPath = 'backend/src/blue_ocean_listing_workflow.js';
  const workflow = source(repositoryRoot, workflowPath);
  requireMarkers(workflow, workflowPath, [
    "blueOceanListingWorkflowVersion = 'N6-2026-08-24.1'",
    'runListingAiImagePrivacyPipeline({',
    'createListingAiGateway({ configuration })',
    'recommendRegionalPriceV2({',
    'previewRegionalPriceWithV52Fee({',
    "state: readyToPublish ? 'READY_TO_PUBLISH' : 'NEEDS_REVIEW'",
    "publicationAction: 'explicit_owner_action_required'",
    "publicationAction: 'explicit_owner_action_verified'",
    'explicitOwnerAction !== true',
    'autoPublishAllowed: false',
  ]);
  if (/\bfetch\s*\(|process\.env|OPENAI_API_KEY|INSERT\s+INTO|UPDATE\s+listings/iu.test(workflow)) {
    fail('N6 workflow domain contains a transport, secret or direct listing persistence.');
  }

  const storePath = 'backend/src/blue_ocean_listing_store.js';
  const store = source(repositoryRoot, storePath);
  requireMarkers(store, storePath, [
    'persistBlueOceanGeneratedDraft',
    'persistBlueOceanReview',
    'markBlueOceanDraftPublished',
    'listing_ai_draft_versions',
    'regional_price_engine_snapshots',
    'listing_ai_publication_receipts',
    'blue_ocean_generation_idempotency_conflict',
  ]);

  const app = source(repositoryRoot, 'backend/src/app.js');
  requireMarkers(app, 'backend/src/app.js', [
    "'/v1/blue-ocean/listing-drafts/analyze'",
    "'/v1/blue-ocean/listing-drafts/:id/review'",
    "'/v1/blue-ocean/listing-drafts/:id/publish'",
    'assertBlueOceanListingTechnicalAccess();',
    "req.body?.explicitAction !== 'Anzeige veröffentlichen'",
    "action: 'blue_ocean.listing.published_by_owner'",
    'requireAuth, requireActiveAccount, requireUnsuspendedScope(\'listing\')',
  ]);

  const config = source(repositoryRoot, 'lib/config/private_pilot_config.dart');
  requireMarkers(config, 'lib/config/private_pilot_config.dart', [
    'SIT_BLUE_OCEAN_LISTING_ASSISTANT',
    'defaultValue: false',
  ]);
  const screen = source(repositoryRoot, 'lib/screens/create_listing_screen.dart');
  requireMarkers(screen, 'lib/screens/create_listing_screen.dart', [
    'KI-Anzeigenassistent',
    'Ausgewählte Fotos analysieren',
    'Bearbeitbarer KI-Entwurf',
    'Rückfragen (höchstens drei)',
    'Eigentümer-Bestätigungen',
    'Mietdauer- und V5.2-Gebührenvorschau',
    'READY_TO_PUBLISH',
    "const Text('Anzeige veröffentlichen')",
    'liveRegion: true',
    'Scrollable.ensureVisible',
  ]);

  const upPath = 'backend/sql/migrations/068_blue_ocean_listing_workflow.up.sql';
  const up = source(repositoryRoot, upPath);
  requireMarkers(up, upPath, [
    'ADD COLUMN disclosure_version TEXT',
    'ADD COLUMN image_preflight_status TEXT',
    'CREATE TABLE listing_ai_publication_receipts',
    "explicit_action = 'Anzeige veröffentlichen'",
    "readiness_state = 'READY_TO_PUBLISH'",
  ]);
  if (/\b(?:UPDATE|DELETE|TRUNCATE)\s+(?:TABLE\s+)?listings\b/iu.test(up)) {
    fail('N6 migration rewrites historical listings.');
  }
  const down = source(repositoryRoot, 'backend/sql/migrations/068_blue_ocean_listing_workflow.down.sql');
  requireMarkers(down, 'backend/sql/migrations/068_blue_ocean_listing_workflow.down.sql', [
    'N6 rollback blocked: listing workflow publication data exists',
  ]);
  const regression = source(repositoryRoot, 'scripts/technical_regression_check.sh');
  requireMarkers(regression, 'scripts/technical_regression_check.sh', [
    'node --test test/tool/blue_ocean_n6_listing_ui_wiring.test.mjs',
    'node --check tool/validate_blue_ocean_n6_listing_workflow.mjs',
    'node --test test/tool/validate_blue_ocean_n6_listing_workflow.test.mjs',
    'node tool/validate_blue_ocean_n6_listing_workflow.mjs',
  ]);
  const serialized = JSON.stringify(value);
  if (/\/(?:Users|home)\/|password\s*[:=]|secret\s*[:=]|api[_-]?key\s*[:=]|@/iu.test(serialized)) {
    fail('N6 evidence contains private or secret-shaped content.');
  }
  return Object.freeze({
    status: value.status,
    ownerConfirmationCount: value.workflow.ownerConfirmationCount,
    nextPackage: value.nextPackage,
  });
}

const isDirectRun = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isDirectRun) {
  try {
    if (process.argv.length > 2) fail(`Unknown argument: ${process.argv[2]}`);
    const result = validateBlueOceanN6ListingWorkflow();
    process.stdout.write(
      `Blue Ocean N6 workflow valid: confirmations=${result.ownerConfirmationCount}, `
      + `status=${result.status}, next=${result.nextPackage}\n`,
    );
  } catch (error) {
    process.stderr.write(`${error?.message ?? 'Blue Ocean N6 validation failed.'}\n`);
    process.exitCode = 1;
  }
}
