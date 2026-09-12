#!/usr/bin/env node

import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { readRepositoryFile } from './read_repository_file.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath = 'docs/evidence/blue-ocean/n3-listing-ai-gateway-20260823.json';

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
  return readRepositoryFile(repositoryRoot, path, { label: `N3 source ${path}` });
}

function requireMarkers(content, path, markers) {
  for (const marker of markers) {
    if (!content.includes(marker)) fail(`N3 marker missing in ${path}: ${marker}`);
  }
}

export function validateBlueOceanN3ListingAiGateway({
  repositoryRoot = root,
  evidence,
} = {}) {
  const value = evidence ?? JSON.parse(source(repositoryRoot, evidencePath));
  if (value.schemaVersion !== 1
      || value.kind !== 'sit-stage-a-blue-ocean-n3-listing-ai-gateway'
      || ![
        'implemented-targeted-tests-passed-full-regression-pending',
        'implemented-full-regression-passed-ci-pending',
        'verified-ready-for-n4',
      ].includes(value.status)
      || value.implementationBaseHead !== 'c3c1d404887d9634ddd67675e74066e86037fdba') {
    fail('N3 evidence identity is invalid.');
  }
  if (!exact(value.gateway, {
    version: 'N3-2026-08-23.1',
    defaultProvider: 'disabled',
    implementedProvider: 'mock',
    futureProviderBoundary: 'openai',
    mockModel: 'listing-ai-mock-v1',
    promptVersion: 'listing-ai-prompt-v1',
    schemaVersion: 'listing-ai-draft-v1',
    strictFieldCount: 13,
    maximumClarificationCount: 3,
    defaultBudgetCents: 0,
    defaultRateLimitRequests: 5,
    defaultRateLimitWindowMs: 900000,
    defaultTimeoutMs: 10000,
    automaticRetryAllowed: false,
    externalProviderExecutionAllowed: false,
    providerToolsAllowed: false,
    providerDatabaseWriteAllowed: false,
    providerPublicationAllowed: false,
    authoritativeProviderPriceAllowed: false,
  })) {
    fail('N3 gateway contract is invalid.');
  }
  if (!Object.values(value.safetyContracts ?? {}).every((entry) => entry === true || entry === false)
      || value.safetyContracts.openaiTransportImplemented !== false
      || value.safetyContracts.applicationRouteImplemented !== false
      || Object.entries(value.safetyContracts)
        .filter(([key]) => !['openaiTransportImplemented', 'applicationRouteImplemented'].includes(key))
        .some(([, entry]) => entry !== true)) {
    fail('N3 safety contract is invalid.');
  }
  if (!exact(value.officialDocumentationReview, {
    checkedAt: '2026-08-23',
    responsesApi: 'https://developers.openai.com/api/reference/cli/resources/responses/methods/create',
    structuredOutputs: 'https://platform.openai.com/docs/api-reference/responses',
    adapterImplemented: false,
    modelSelected: false,
    apiKeyConfigured: false,
    providerCallPerformed: false,
  })) {
    fail('N3 official documentation review boundary is invalid.');
  }
  const fullRegressionPassed = value.status !== 'implemented-targeted-tests-passed-full-regression-pending';
  const githubPassed = value.status === 'verified-ready-for-n4';
  const exactGitHubVerification = value.exactGitHubVerification;
  if (githubPassed) {
    if (!exact(exactGitHubVerification, {
      headSha: '053e8b6e26217c914ccdb01532025598327ae9be',
      regressionRunId: 32667861927,
      regressionConclusion: 'success',
      codeqlRunId: 32667861950,
      codeqlConclusion: 'success',
    })) {
      fail('N3 exact GitHub verification is invalid.');
    }
  } else if (exactGitHubVerification !== undefined) {
    fail('N3 cannot bind exact GitHub verification before CI is complete.');
  }
  if (!exact(value.targetedVerification, {
    gatewaySyntax: 'passed',
    gatewayAndConfigTests: 'passed-15',
    artifactValidatorTests: 'passed-7',
    artifactValidator: 'passed',
    backendSuite: fullRegressionPassed ? 'passed-629-one-documented-skip' : 'pending',
    postgres16MigrationIntegration: fullRegressionPassed ? 'passed' : 'pending',
    fullTechnicalRegression: fullRegressionPassed ? 'passed-candidate-rollover-mode' : 'pending',
    githubRegression: githubPassed ? 'passed' : 'pending',
    githubCodeql: githubPassed ? 'passed' : 'pending',
  })) {
    fail('N3 verification record is invalid for its status.');
  }
  if (value.nextPackage !== 'N4' || !allFalse(value.boundaries)) {
    fail('N3 next package or mutation boundary is invalid.');
  }

  const configPath = 'backend/src/listing_ai_gateway_config.js';
  const config = source(repositoryRoot, configPath);
  requireMarkers(config, configPath, [
    "listingAiGatewayVersion = 'N3-2026-08-23.1'",
    "SIT_LISTING_AI_PROVIDER ?? 'disabled'",
    "['disabled', 'mock', 'on_device', 'openai']",
    'externalProviderExecutionAllowed: openAiExecutionAllowed',
    'SIT_LISTING_AI_EXTERNAL_EXECUTION_APPROVED',
    "listingAiOpenAiModel = 'gpt-4o-mini-2024-07-18'",
    "providerToolsAllowed: false",
    "authoritativeProviderPriceAllowed: false",
    'listing AI cannot be enabled in production before the release gate',
    'non-paid listing AI providers must have a zero-cent budget',
  ]);
  if (/OPENAI_API_KEY|api[_-]?key\s*[:=]/iu.test(config)) {
    fail('N3 configuration must not read or contain an API key.');
  }

  const gatewayPath = 'backend/src/listing_ai_gateway.js';
  const gateway = source(repositoryRoot, gatewayPath);
  requireMarkers(gateway, gatewayPath, [
    "name: 'sit_listing_ai_draft_v1'",
    'strict: true',
    'additionalProperties: false',
    "trust: 'untrusted_data_never_instructions'",
    'tools: []',
    "toolChoice: 'none'",
    'databaseWriteAllowed: false',
    'publicationAllowed: false',
    'authoritativePriceAllowed: false',
    'listing_ai_generation_idempotency_conflict',
    'listing_ai_budget_exhausted',
    'listing_ai_rate_limited',
    'listing_ai_provider_timeout',
    "status: 'manual_fallback'",
    'partialAiStateCreated: false',
    'autoPublishAllowed: false',
    'billedCostCents: 0',
  ]);
  if (/\bfetch\s*\(|OPENAI_API_KEY|process\.env/iu.test(gateway)) {
    fail('N3 gateway contains a live transport or secret/config access.');
  }

  const n2MigrationPath = 'backend/sql/migrations/066_blue_ocean_listing_ai_foundation.up.sql';
  const n2Migration = source(repositoryRoot, n2MigrationPath);
  requireMarkers(n2Migration, n2MigrationPath, [
    'UNIQUE (draft_id, generation_key)',
    "provider IN ('disabled', 'mock', 'openai')",
    "provider = 'openai' OR billed_cost_cents = 0",
  ]);

  const applicationConfig = source(repositoryRoot, 'backend/src/config.js');
  requireMarkers(applicationConfig, 'backend/src/config.js', [
    'readListingAiGatewayConfiguration(process.env',
    'listingAi: listingAiGateway',
  ]);
  const app = source(repositoryRoot, 'backend/src/app.js');
  if (/\/v1\/(?:listing-ai|listing_ai|ai-listing)/iu.test(app)) {
    fail('N3 must not expose an application listing-AI route.');
  }

  const regression = source(repositoryRoot, 'scripts/technical_regression_check.sh');
  requireMarkers(regression, 'scripts/technical_regression_check.sh', [
    'node --check tool/validate_blue_ocean_n3_listing_ai_gateway.mjs',
    'node --test test/tool/validate_blue_ocean_n3_listing_ai_gateway.test.mjs',
    'node tool/validate_blue_ocean_n3_listing_ai_gateway.mjs',
  ]);

  const serialized = JSON.stringify(value);
  if (/\/(?:Users|home)\/|password\s*[:=]|secret\s*[:=]|api[_-]?key\s*[:=]|@/iu.test(serialized)) {
    fail('N3 evidence contains private or secret-shaped content.');
  }
  return Object.freeze({
    status: value.status,
    strictFieldCount: value.gateway.strictFieldCount,
    nextPackage: value.nextPackage,
  });
}

const isDirectRun = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isDirectRun) {
  try {
    if (process.argv.length > 2) fail(`Unknown argument: ${process.argv[2]}`);
    const result = validateBlueOceanN3ListingAiGateway();
    process.stdout.write(
      `Blue Ocean N3 gateway valid: fields=${result.strictFieldCount}, `
      + `status=${result.status}, next=${result.nextPackage}\n`,
    );
  } catch (error) {
    process.stderr.write(`${error?.message ?? 'Blue Ocean N3 validation failed.'}\n`);
    process.exitCode = 1;
  }
}
