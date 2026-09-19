#!/usr/bin/env node

import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { readRepositoryFile } from './read_repository_file.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath = 'docs/evidence/blue-ocean/n5-regional-price-engine-v2-20260824.json';

function fail(message) {
  throw new Error(message);
}

function exact(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function allFalse(value) {
  return value && typeof value === 'object'
    && Object.values(value).every((entry) => entry === false);
}

function source(repositoryRoot, path) {
  return readRepositoryFile(repositoryRoot, path, { label: `N5 source ${path}` });
}

function requireMarkers(content, path, markers) {
  for (const marker of markers) {
    if (!content.includes(marker)) fail(`N5 marker missing in ${path}: ${marker}`);
  }
}

export function validateBlueOceanN5RegionalPriceEngineV2({
  repositoryRoot = root,
  evidence,
} = {}) {
  const value = evidence ?? JSON.parse(source(repositoryRoot, evidencePath));
  if (value.schemaVersion !== 1
      || value.kind !== 'sit-stage-a-blue-ocean-n5-regional-price-engine-v2'
      || ![
        'implemented-targeted-tests-passed-full-regression-pending',
        'implemented-full-regression-passed-ci-pending',
        'verified-ready-for-n6',
      ].includes(value.status)
      || value.implementationBaseHead !== '2b6c421457fe13b5499b8a2f5431385b90521e58') {
    fail('N5 evidence identity is invalid.');
  }
  if (!exact(value.engine, {
    authority: 'SIT_REGIONAL_PRICE_ENGINE_V2',
    version: 'N5-2026-08-24.1',
    observationVersion: 'regional-market-observation-v2',
    currency: 'EUR',
    roundingRule: 'EUR_FULL_UNIT_HALF_UP_V1',
    categoryRuleCount: 6,
    replacementValueBandCount: 5,
    conditionFactorCount: 3,
    functionNotConfirmedBlocks: true,
    defectiveOutsideStageA: true,
  })) {
    fail('N5 price authority, category or rounding contract is invalid.');
  }
  if (!exact(value.marketEvidence, {
    geographyHierarchy: [
      'within_20_km',
      'within_50_km',
      'within_100_km',
      'baden_wuerttemberg',
      'germany',
    ],
    sourceQualityBasisPoints: {
      completed_sit_rental: 10000,
      accepted_sit_request: 9000,
      active_sit_listing: 5500,
      reviewed_external_c2c_asking_price: 4000,
      professional_commercial_reference: 2500,
      synthetic_fixture: 0,
    },
    weightFormula: 'quality_x_similarity_x_distance_decay_x_age_decay',
    weightQuantization: 'integer-micro-weight',
    center: 'weighted-median',
    outlierScreen: 'weighted-median-mad',
    effectiveSampleSize: true,
    shrinkageK: 8,
    syntheticLearningWeight: 0,
    manualImportTemplateRows: 0,
    externalAdapterImplemented: false,
    scrapingImplemented: false,
  })) {
    fail('N5 market evidence, source, geography or robust-statistics contract is invalid.');
  }
  if (!exact(value.recommendation, {
    confidenceValues: ['HIGH', 'MEDIUM', 'LOW'],
    highEffectiveMinimum: 8,
    mediumEffectiveMinimum: 3,
    highMaximumGeography: 'within_50_km',
    demandRequestThreshold: 20,
    demandActiveListingThreshold: 10,
    demandMinimumBasisPoints: 9000,
    demandMaximumBasisPoints: 11000,
    ownerOptionIds: ['rent_fast', 'sit_recommendation', 'set_higher'],
    fallbackOwnerOptionBasisPoints: [9000, 10000, 11000],
    ownerOverrideAllowed: true,
    ownerConfirmationRequired: true,
    userPrinciple: 'Unverbindliche SIT-Preisempfehlung. Du entscheidest über deinen Mietpreis.',
    demandOrIncomeGuaranteed: false,
  })) {
    fail('N5 owner, confidence or demand contract is invalid.');
  }
  if (!exact(value.durationAndQuote, {
    durationTierCount: 5,
    durationDiscountBasisPoints: [0, 1000, 1500, 3000, 4000],
    durationOwnerEditable: true,
    durationDisableAllowed: true,
    durationMarketDerivedClaim: false,
    quoteAuthority: 'V5.2_QUOTE_ENGINE',
    sitContributionBasisPoints: 1000,
    discountAppliedBeforeContribution: true,
    simulationOnly: true,
    securityDepositMinor: 0,
  })) {
    fail('N5 duration or V5.2 quote contract is invalid.');
  }
  if (!exact(value.persistence, {
    migration: '067_blue_ocean_regional_price_engine_v2',
    additive: true,
    historicalListingsRewritten: false,
    existingN2RowsEngineEligibleByDefault: false,
    appendOnlyFoundationPreserved: true,
    rollbackBlockedWhenV2DataExists: true,
    exactAddressStored: false,
    personalIdentityStored: false,
  })) {
    fail('N5 persistence or rollback contract is invalid.');
  }

  const fullRegressionPassed = value.status !== 'implemented-targeted-tests-passed-full-regression-pending';
  const githubPassed = value.status === 'verified-ready-for-n6';
  const exactGitHubVerification = value.exactGitHubVerification;
  if (githubPassed) {
    if (!exact(exactGitHubVerification, {
      headSha: 'e4db1515215b6735a0c02294782eb38418615cd6',
      regressionRunId: 32670454653,
      regressionConclusion: 'success',
      codeqlRunId: 32670454524,
      codeqlConclusion: 'success',
    })) {
      fail('N5 exact GitHub verification is invalid.');
    }
  } else if (exactGitHubVerification !== undefined) {
    fail('N5 cannot bind exact GitHub verification before CI is complete.');
  }
  if (!exact(value.targetedVerification, {
    engineSyntax: 'passed',
    engineTests: 'passed-19',
    artifactValidatorTests: githubPassed ? 'passed-7' : 'passed-6',
    artifactValidator: 'passed',
    postgres16MigrationIntegration: 'passed',
    backendSuite: fullRegressionPassed ? 'passed-658-one-documented-skip' : 'pending',
    fullTechnicalRegression: fullRegressionPassed ? 'passed-candidate-rollover-mode' : 'pending',
    githubRegression: githubPassed ? 'passed' : 'pending',
    githubCodeql: githubPassed ? 'passed' : 'pending',
  })) {
    fail('N5 verification record is invalid for its status.');
  }
  if (value.nextPackage !== 'N6' || !allFalse(value.boundaries)) {
    fail('N5 next package or mutation boundary is invalid.');
  }

  const enginePath = 'backend/src/regional_price_engine_v2.js';
  const engine = source(repositoryRoot, enginePath);
  requireMarkers(engine, enginePath, [
    "regionalPriceEngineAuthority = 'SIT_REGIONAL_PRICE_ENGINE_V2'",
    "regionalMarketObservationVersion = 'regional-market-observation-v2'",
    "regionalPriceRoundingRule = 'EUR_FULL_UNIT_HALF_UP_V1'",
    'Unverbindliche SIT-Preisempfehlung. Du entscheidest über deinen Mietpreis.',
    'power_tools:',
    'cleaning_machines:',
    'garden_machines:',
    'ladders_hand_tools:',
    'event_camping:',
    'accessories:',
    'over_1000: null',
    'visibly_used_but_functional: 8_000',
    'synthetic_fixture: 0',
    "'within_20_km'",
    "'within_50_km'",
    "'within_100_km'",
    "'baden_wuerttemberg'",
    "'germany'",
    'Math.exp(-observation.distanceKm / 40)',
    'Math.exp(-Math.max(0, ageDays) / 60)',
    'function weightedPercentile(rows, percentile)',
    'function robustOutlierScreen(rows)',
    'const fallbackShareNumerator = 8n * rational.sumSquares',
    'requests >= 20',
    'listings >= 10',
    "id: 'rent_fast'",
    "id: 'sit_recommendation'",
    "id: 'set_higher'",
    'export function buildRegionalDurationPriceSchedule',
    'export function previewRegionalPriceWithV52Fee',
    'quoteRental({',
    "quoteAuthority: 'V5.2_QUOTE_ENGINE'",
    'automaticPublicationAllowed: false',
    'syntheticLearningApplied: false',
  ]);
  if (!engine.includes("regionalPriceEngineVersion = 'N5-2026-08-24.1'")
      && !engine.includes("regionalPriceEngineVersion = 'R6-2026-08-24.1'")) {
    fail('N5 engine has no recognized N5 or fail-closed R6 successor version.');
  }
  if (/\bfetch\s*\(|OPENAI_API_KEY|process\.env|INSERT\s+INTO|UPDATE\s+listings|DELETE\s+FROM|autoPublish/iu.test(engine)) {
    fail('N5 engine contains a provider, persistence or publication mutation.');
  }

  const upPath = 'backend/sql/migrations/067_blue_ocean_regional_price_engine_v2.up.sql';
  const upMigration = source(repositoryRoot, upPath);
  requireMarkers(upMigration, upPath, [
    'ADD COLUMN engine_eligible BOOLEAN NOT NULL DEFAULT false',
    "market_observation_version = 'regional-market-observation-v2'",
    "WHEN 'synthetic_fixture' THEN 0",
    "synthetic = (source_class = 'synthetic_fixture')",
    "engine_version = 'N5-2026-08-24.1'",
    'synthetic_learning_applied = false',
  ]);
  if (/\b(?:UPDATE|DELETE|TRUNCATE)\s+(?:TABLE\s+)?(?:listings|regional_market_observations|regional_price_engine_snapshots)\b/iu.test(upMigration)) {
    fail('N5 migration rewrites historical listing or regional price data.');
  }
  const downPath = 'backend/sql/migrations/067_blue_ocean_regional_price_engine_v2.down.sql';
  const downMigration = source(repositoryRoot, downPath);
  requireMarkers(downMigration, downPath, [
    'N5 rollback blocked: regional price V2 data exists',
    "market_observation_version = 'regional-market-observation-v2'",
    "engine_version = 'N5-2026-08-24.1'",
  ]);

  const templatePath = 'docs/templates/regional-price-observations-manual-import-v1.csv';
  const template = source(repositoryRoot, templatePath);
  const expectedHeader = 'observation_id,category_key,subcategory,brand_model_family,condition,daily_equivalent_rent_minor,currency,market_actor_type,geography_bucket,state_code,country_code,distance_km,captured_at,source_type,status,provenance_reference,reviewed,amount_includes_only_rent,synthetic';
  if (template.trim() !== expectedHeader) {
    fail('N5 manual import template must be header-only with the exact closed schema.');
  }

  const app = source(repositoryRoot, 'backend/src/app.js');
  if (/regional_price_engine_v2|regional-price|regional_price/iu.test(app)) {
    fail('N5 must not expose an application regional-price route.');
  }
  const regression = source(repositoryRoot, 'scripts/technical_regression_check.sh');
  requireMarkers(regression, 'scripts/technical_regression_check.sh', [
    'node --check tool/validate_blue_ocean_n5_regional_price_engine_v2.mjs',
    'node --test test/tool/validate_blue_ocean_n5_regional_price_engine_v2.test.mjs',
    'node tool/validate_blue_ocean_n5_regional_price_engine_v2.mjs',
  ]);

  const serialized = JSON.stringify(value);
  if (/\/(?:Users|home)\/|password\s*[:=]|secret\s*[:=]|api[_-]?key\s*[:=]|@/iu.test(serialized)) {
    fail('N5 evidence contains private or secret-shaped content.');
  }
  return Object.freeze({
    status: value.status,
    categoryRuleCount: value.engine.categoryRuleCount,
    nextPackage: value.nextPackage,
  });
}

const isDirectRun = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isDirectRun) {
  try {
    if (process.argv.length > 2) fail(`Unknown argument: ${process.argv[2]}`);
    const result = validateBlueOceanN5RegionalPriceEngineV2();
    process.stdout.write(
      `Blue Ocean N5 regional price engine valid: categories=${result.categoryRuleCount}, `
      + `status=${result.status}, next=${result.nextPackage}\n`,
    );
  } catch (error) {
    process.stderr.write(`${error?.message ?? 'Blue Ocean N5 validation failed.'}\n`);
    process.exitCode = 1;
  }
}
