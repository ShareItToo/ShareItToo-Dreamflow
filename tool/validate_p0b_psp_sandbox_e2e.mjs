#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  evaluatePspSandboxReadinessGate,
  pspSandboxScenarioIds,
} from '../backend/src/psp_sandbox_readiness_gate.js';

const defaultRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const manifestPath = 'docs/evidence/p0b-next/psp-sandbox-e2e-evidence.json';
const sourceBindingHead = '441ad54d80d85aa9d84ea5c3c3f7219822649a77';

const expectedRepoSources = Object.freeze([
  Object.freeze(['backend/src/stripe_provider.js', 'da0515456298f197c283742585a445470b822a73e0c159eed3e1d70be94a593a']),
  Object.freeze(['backend/src/payment_domain.js', '753670c55caf486bf1f8a67afd5f668296704f20883ddbca72575660896c6c61']),
  Object.freeze(['backend/src/payment_workflow.js', '7a58f65c83959c3277e1fc69f06ea386b238b0afbaa34d324acb89122edff2a7']),
  Object.freeze(['backend/test/payment_domain.test.js', 'f8d92b32cd3d7c9eeadbaa9e02f2f3e179fa7901c764d970353fd0ea6273b718']),
  Object.freeze(['backend/test/postgres_foundation.integration.test.js', 'd2291f42be173042ce7d1e3276994d9624652a7c68f4f9b155089a649b01f103']),
  Object.freeze(['backend/src/psp_sandbox_readiness_gate.js', '81e80a617e90b4184e32fa4b7d2f8f7cb6243735b1c85f73b2e880b8b42c6979']),
  Object.freeze(['backend/test/psp_sandbox_readiness_gate.test.js', '575384b897d0b93693c6014e8109bda714ac924c9530f96cc034456780f090ea']),
  Object.freeze(['docs/operations/P0B_PSP_SANDBOX_E2E_RUNBOOK.md', '55ec008f8ad9b790ba2af6f708a01c13362a155991dc7eb6255d01918dcb3dde']),
  Object.freeze(['docs/evidence/p0b/pilot-go-no-go-dossier.json', '3566a46c018b7685adfe0f9df296c2060294f811deb5b61dd79ec818c25f27dd']),
]);

const expectedDriveSources = Object.freeze([
  Object.freeze(['1HQR2EWJg6FUcU41l5uwditfFzNoCe6Zx', '01_V5.2_CORE_SPECIFICATION.md', '2026-08-18T17:51:27.257Z']),
  Object.freeze(['1kKuZl9OJ4nb9F02E8fepTxY8O-GZBkn2', '02_V5.2_RECHTSMAPPE_PRIVATLAUNCH.pdf', '2026-08-18T17:51:36.056Z']),
  Object.freeze(['1H7tHdQ6XzfHs94AS4uISgY_7Bwwbk0pY', '04_SIT_GELD_STORNO_WIDERRUF_STREITFAELLE_V1.pdf', '2026-08-20T22:25:43.180Z']),
  Object.freeze(['1Vt-yIAjgqMOV8TcRrX5E8X74odRx3gEA', '08_SIT_SUPPORT_TESTKATALOG_PILOT_GATES_V1.pdf', '2026-08-20T22:26:56.186Z']),
  Object.freeze(['1j8cpz2uwZBZiu6RLXjPQfo6bAWotUNLN', '09_SIT_SUPPORT_SOURCE_OF_TRUTH_V1.md', '2026-08-20T22:27:16.931Z']),
]);

const expectedSupportProbes = Object.freeze([
  ...Array.from({ length: 22 }, (_, index) => `SUP-${String(index + 70).padStart(3, '0')}`),
  'SUP-162',
]);

function fail(message) {
  throw new Error(message);
}

function exact(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function source(root, path, overrides) {
  if (Object.hasOwn(overrides, path)) return Buffer.from(String(overrides[path]), 'utf8');
  try {
    return execFileSync('git', ['show', `${sourceBindingHead}:${path}`], {
      cwd: root,
      encoding: 'buffer',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    fail(`P0B PSP historical source is unavailable: ${path}`);
  }
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function assertIdentity(value) {
  if (value.schemaVersion !== 1
      || value.kind !== 'p0b-marketplace-psp-sandbox-e2e-evidence'
      || value.version !== 'P0B-PSP-2026-08-21.1'
      || value.authorizationToken !== 'P0B_NEXT_PSP_SANDBOX_E2E_ONLY'
      || value.preparedOn !== '2026-08-21'
      || value.state !== 'hold-provider-contract-credentials-and-sandbox-e2e') {
    fail('P0B PSP sandbox evidence identity or fail-closed state is invalid.');
  }
}

function assertSourceBindings(root, value, overrides) {
  const repo = value.sourceBindings?.repository;
  if (!Array.isArray(repo) || repo.length !== expectedRepoSources.length) {
    fail('P0B PSP repository source set is incomplete.');
  }
  expectedRepoSources.forEach(([path, hash], index) => {
    if (!exact(repo[index], { path, sha256: hash })
        || sha256(source(root, path, overrides)) !== hash) {
      fail(`P0B PSP repository source drift: ${path}`);
    }
  });
  const drive = value.sourceBindings?.drive;
  if (!Array.isArray(drive) || drive.length !== expectedDriveSources.length) {
    fail('P0B PSP Drive source set is incomplete.');
  }
  expectedDriveSources.forEach(([fileId, title, modifiedTime], index) => {
    if (!exact(drive[index], { fileId, title, modifiedTime })) {
      fail(`P0B PSP Drive source binding drift: ${title}`);
    }
  });
}

function assertObservedPreflight(value) {
  if (!exact(value.discovery, {
    driveQueries: ['PSP Vertrag', 'Stripe Connect', 'Zahlungsdienstleister Sandbox', 'Marketplace PSP'],
    standaloneExecutedPspContractFound: false,
    standaloneProviderSandboxAcceptanceFound: false,
    codeContainsStripeConnectAdapter: true,
    providerContractInferredFromCode: false,
  })) {
    fail('P0B PSP discovery result is missing or overstates provider evidence.');
  }
  if (!exact(value.localPreflight, {
    nonExampleEnvironmentFilesFound: [],
    providerCliOrEquivalentAvailable: false,
    processPaymentTransportConfigured: false,
    processLivemodeConfigured: false,
    testSecretKeyPresent: false,
    webhookSecretPresent: false,
    legalPspProviderNamePresent: false,
    legalPspProcessingRegionsPresent: false,
    legalPspDpaDatePresent: false,
    legalPspTransferMechanismPresent: false,
    valuesOrSecretsRecorded: false,
  })) {
    fail('P0B PSP local presence-only preflight is invalid.');
  }
}

function assertCurrentHold(value) {
  if (!exact(value.provider, {
    providerName: null,
    providerSelected: false,
    licensedMarketplaceProductVerified: false,
    contractEvidenceRef: null,
    productConfigurationEvidenceRef: null,
    sandboxAccountEvidenceRef: null,
    dpaEvidenceRef: null,
    processingRegionsEvidenceRef: null,
    transferMechanismEvidenceRef: null,
    professionalReviewEvidenceRef: null,
    dashboardIdentityVerified: false,
    testSecretKeyPresent: false,
    webhookSecretPresent: false,
  })) {
    fail('P0B PSP provider facts must remain explicitly unverified.');
  }
  if (!exact(value.environment, {
    transport: 'memory',
    livemode: false,
    testCredentialClass: null,
    webhookSecretConfigured: false,
    providerCliOrEquivalentAvailable: false,
    externalRunAuthorized: false,
  })) {
    fail('P0B PSP environment must remain memory-only and non-external.');
  }
  if (!Array.isArray(value.scenarios)
      || !exact(value.scenarios.map(({ id }) => id), pspSandboxScenarioIds)
      || value.scenarios.some((scenario) => !exact(scenario, {
        id: scenario.id,
        status: 'not-run',
        livemode: false,
        realMoneyUsed: false,
        evidenceRef: null,
      }))) {
    fail('P0B PSP provider scenarios must remain complete and not-run.');
  }
}

function assertEvaluation(value) {
  const evaluated = evaluatePspSandboxReadinessGate({
    provider: value.provider,
    environment: value.environment,
    scenarios: value.scenarios,
  });
  const { state: _state, ...expected } = evaluated;
  if (evaluated.state !== value.state || !exact(value.evaluation, expected)) {
    fail('P0B PSP recorded evaluation does not match the executable gate.');
  }
  if (evaluated.contractAndProviderFactsReady !== false
      || evaluated.sandboxEnvironmentReady !== false
      || evaluated.passedScenarioCount !== 0
      || evaluated.sandboxE2ePassed !== false
      || evaluated.realMoneyReady !== false) {
    fail('P0B PSP readiness is overstated.');
  }
  return evaluated;
}

function assertTechnicalAndBoundaries(value) {
  if (!exact(value.technicalEvidence, {
    focusedLocalTestsPassed: 37,
    paymentDomainTestsPassed: 10,
    readinessGateTestsPassed: 4,
    syntheticProviderContractUnitTestPassed: true,
    actualProviderRequestsPerformed: false,
    actualProviderObjectsCreated: false,
    providerDashboardChanged: false,
  }) || !exact(value.supportProbeRefs, expectedSupportProbes)) {
    fail('P0B PSP technical evidence or Support Packet binding is incomplete.');
  }
  for (const field of [
    'secretsRecorded',
    'realPaymentDataUsed',
    'externalProviderRequestPerformed',
    'externalProviderObjectCreated',
    'productionChanged',
    'cloudChanged',
    'paymentProviderChanged',
    'storeChanged',
    'publicActivationChanged',
    'realMoneyUsed',
  ]) {
    if (value.boundaries?.[field] !== false) fail(`P0B PSP boundary must remain false: ${field}`);
  }
  const serialized = JSON.stringify(value);
  if (/sk_(?:test|live)_[A-Za-z0-9]|whsec_[A-Za-z0-9]|BEGIN PRIVATE KEY|\/Users\//u.test(serialized)) {
    fail('P0B PSP evidence contains a credential or private filesystem path.');
  }
}

export function validateP0BPspSandboxE2e({
  root = defaultRoot,
  manifest = undefined,
  sourceOverrides = {},
} = {}) {
  const value = manifest ?? JSON.parse(source(root, manifestPath, sourceOverrides));
  assertIdentity(value);
  assertSourceBindings(root, value, sourceOverrides);
  assertObservedPreflight(value);
  assertCurrentHold(value);
  const evaluated = assertEvaluation(value);
  assertTechnicalAndBoundaries(value);
  return Object.freeze({
    version: value.version,
    state: value.state,
    repositorySources: value.sourceBindings.repository.length,
    driveSources: value.sourceBindings.drive.length,
    focusedLocalTestsPassed: value.technicalEvidence.focusedLocalTestsPassed,
    requiredScenarios: evaluated.requiredScenarioCount,
    providerScenariosPassed: evaluated.passedScenarioCount,
    contractAndProviderFactsReady: evaluated.contractAndProviderFactsReady,
    sandboxE2ePassed: evaluated.sandboxE2ePassed,
    realMoneyReady: evaluated.realMoneyReady,
  });
}

const isMain = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMain) {
  try {
    const result = validateP0BPspSandboxE2e();
    process.stdout.write(
      `P0B PSP sandbox gate valid: version=${result.version}, state=${result.state}, repoSources=${result.repositorySources}, driveSources=${result.driveSources}, focusedTests=${result.focusedLocalTestsPassed}, requiredScenarios=${result.requiredScenarios}, providerScenariosPassed=${result.providerScenariosPassed}, contractReady=${result.contractAndProviderFactsReady}, sandboxE2ePassed=${result.sandboxE2ePassed}, realMoneyReady=${result.realMoneyReady}\n`,
    );
  } catch (error) {
    process.stderr.write(`${error?.message ?? 'P0B PSP sandbox validation failed.'}\n`);
    process.exitCode = 1;
  }
}
