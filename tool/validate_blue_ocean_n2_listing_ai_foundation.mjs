#!/usr/bin/env node

import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { readRepositoryFile } from './read_repository_file.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath = 'docs/evidence/blue-ocean/n2-listing-ai-foundation-20260823.json';

function fail(message) {
  throw new Error(message);
}

function exact(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function allFalse(value) {
  return value !== null
    && typeof value === 'object'
    && Object.values(value).every((entry) => entry === false);
}

function source(repositoryRoot, path) {
  return readRepositoryFile(repositoryRoot, path, { label: `N2 source ${path}` });
}

function requireMarkers(content, path, markers) {
  for (const marker of markers) {
    if (!content.includes(marker)) fail(`N2 marker missing in ${path}: ${marker}`);
  }
}

export function validateBlueOceanN2ListingAiFoundation({
  repositoryRoot = root,
  evidence,
} = {}) {
  const value = evidence ?? JSON.parse(source(repositoryRoot, evidencePath));
  if (value.schemaVersion !== 1
      || value.kind !== 'sit-stage-a-blue-ocean-n2-listing-ai-foundation'
      || ![
        'implemented-targeted-tests-passed-full-regression-pending',
        'implemented-full-regression-passed-ci-pending',
        'verified-ready-for-n3',
      ].includes(value.status)
      || value.implementationBaseHead !== 'fc09e238b4d07e9c4d6aab1cf27fac865cf5087a') {
    fail('N2 evidence identity is invalid.');
  }
  if (!exact(value.domain, {
    domainVersion: 'N2-2026-08-23.1',
    schemaVersion: 'listing-ai-draft-v1',
    promptVersion: 'listing-ai-prompt-v1',
    priceEngineAuthority: 'SIT_REGIONAL_PRICE_ENGINE_V2',
    generatedFieldCount: 13,
    ownerConfirmationCount: 11,
    maximumImageCount: 4,
    maximumClarificationCount: 3,
    lowConfidenceValueBlank: true,
    mediumConfidenceReviewRequired: true,
    functionalityConfirmationBlocksReadiness: true,
    explicitOwnerPublicationRequired: true,
    autoPublishAllowed: false,
  })) {
    fail('N2 domain contract is invalid.');
  }
  const tables = [
    'listing_ai_drafts',
    'listing_ai_draft_versions',
    'listing_ai_analysis_derivatives',
    'regional_market_observations',
    'regional_price_engine_snapshots',
    'listing_ai_cost_ledger',
    'listing_ai_budget_aggregates',
  ];
  if (!exact(value.storageFoundations, tables)) fail('N2 storage foundation list is invalid.');
  if (!exact(value.preservedInvariants, {
    manualListingCreationPreserved: true,
    historicalListingsRewritten: false,
    existingListingSchemaAltered: false,
    existingPhotosChanged: false,
    exactAddressInMarketObservationAllowed: false,
    providerPriceAuthoritative: false,
    paidCallPerformed: false,
    applicationWriterEnabled: false,
    publicRouteEnabled: false,
  })) {
    fail('N2 preservation boundary is invalid.');
  }
  if (!exact(value.lifecycle, {
    draftRevisionsAppendOnly: true,
    derivativeTransitionsForwardOnly: true,
    derivativePurgeTerminal: true,
    privacyErasureCascadePreserved: true,
    rollbackBlockedWhenDataExists: true,
    privacyExportIntegrationRequiredBeforeActivation: true,
    retentionInventoryIntegrationRequiredBeforeActivation: true,
    accountErasureIntegrationRequiredBeforeActivation: true,
    integrationPackage: 'N8',
  })) {
    fail('N2 lifecycle boundary is invalid.');
  }
  if (value.nextPackage !== 'N3' || !allFalse(value.boundaries)) {
    fail('N2 next package or mutation boundary is invalid.');
  }
  const exactGitHubVerification = value.exactGitHubVerification;
  if (value.status === 'verified-ready-for-n3') {
    if (!exact(exactGitHubVerification, {
      headSha: '8bbef0bcc118ac8b1bf8b606c0795cbf16ba2e90',
      regressionRunId: 32666454117,
      regressionConclusion: 'success',
      codeqlRunId: 32666454108,
      codeqlConclusion: 'success',
    })) {
      fail('N2 exact GitHub verification is invalid.');
    }
  } else if (exactGitHubVerification !== undefined) {
    fail('N2 cannot bind exact GitHub verification before CI is complete.');
  }
  if (!exact(value.targetedVerification, {
    domainSyntax: 'passed',
    domainTests: 'passed-9',
    artifactValidatorTests: 'passed-6',
    artifactValidator: 'passed',
    backendSuite: 'passed-614-one-documented-skip',
    postgres16MigrationIntegration: 'passed',
    flutterSuite: 'passed-387-one-documented-skip',
    webDebugAndSmoke: 'passed',
    androidDebugAndMinSdk24: 'passed',
    fullTechnicalRegression: 'passed-candidate-rollover-mode',
    githubRegression: value.status === 'verified-ready-for-n3' ? 'passed' : 'pending',
    githubCodeql: value.status === 'verified-ready-for-n3' ? 'passed' : 'pending',
  })) {
    fail('N2 verification record is invalid for its status.');
  }

  const domainPath = 'backend/src/listing_ai_draft_domain.js';
  const domain = source(repositoryRoot, domainPath);
  requireMarkers(domain, domainPath, [
    "listingAiDraftDomainVersion = 'N2-2026-08-23.1'",
    "listingAiDraftSchemaVersion = 'listing-ai-draft-v1'",
    "listingAiPromptVersion = 'listing-ai-prompt-v1'",
    "listingAiPriceEngineAuthority = 'SIT_REGIONAL_PRICE_ENGINE_V2'",
    "publicationAction: 'explicit_owner_action_required'",
    'autoPublishAllowed: false',
    'historicalListingRewriteAllowed: false',
    "confidence === 'LOW'",
  ]);

  const upPath = 'backend/sql/migrations/066_blue_ocean_listing_ai_foundation.up.sql';
  const up = source(repositoryRoot, upPath);
  for (const table of tables) requireMarkers(up, upPath, [`CREATE TABLE ${table} (`]);
  requireMarkers(up, upPath, [
    "engine_authority = 'SIT_REGIONAL_PRICE_ENGINE_V2'",
    "status IN ('editing', 'review_ready', 'discarded')",
    'jsonb_array_length(clarification_questions) <= 3',
    'listing_ai_draft_versions_append_only_guard',
    'listing_ai_derivative_update_guard',
  ]);
  if (/ALTER TABLE listings|UPDATE listings|INSERT INTO listings|DELETE FROM listings/iu.test(up)) {
    fail('N2 migration mutates the historical listing model.');
  }

  const downPath = 'backend/sql/migrations/066_blue_ocean_listing_ai_foundation.down.sql';
  const down = source(repositoryRoot, downPath);
  requireMarkers(down, downPath, [
    'N2 rollback blocked: listing AI foundation data exists',
    'DROP TABLE listing_ai_drafts;',
  ]);
  if (/DROP TABLE listings|ALTER TABLE listings|DELETE FROM listings/iu.test(down)) {
    fail('N2 rollback mutates the historical listing model.');
  }

  const serialized = JSON.stringify(value);
  if (/\/(?:Users|home)\/|password\s*[:=]|secret\s*[:=]|api[_-]?key\s*[:=]|@/iu.test(serialized)) {
    fail('N2 evidence contains private or secret-shaped content.');
  }
  return Object.freeze({
    status: value.status,
    storageFoundationCount: tables.length,
    nextPackage: value.nextPackage,
  });
}

const isDirectRun = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isDirectRun) {
  try {
    if (process.argv.length > 2) fail(`Unknown argument: ${process.argv[2]}`);
    const result = validateBlueOceanN2ListingAiFoundation();
    process.stdout.write(
      `Blue Ocean N2 foundation valid: tables=${result.storageFoundationCount}, `
      + `status=${result.status}, next=${result.nextPackage}\n`,
    );
  } catch (error) {
    process.stderr.write(`${error?.message ?? 'Blue Ocean N2 validation failed.'}\n`);
    process.exitCode = 1;
  }
}
