import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluatePspSandboxReadinessGate,
  pspSandboxScenarioIds,
} from '../src/psp_sandbox_readiness_gate.js';

const provider = Object.freeze({
  providerSelected: true,
  licensedMarketplaceProductVerified: true,
  contractEvidenceRef: 'evidence://contract/approved',
  productConfigurationEvidenceRef: 'evidence://product/configuration',
  sandboxAccountEvidenceRef: 'evidence://sandbox/account',
  dpaEvidenceRef: 'evidence://privacy/dpa',
  processingRegionsEvidenceRef: 'evidence://privacy/regions',
  transferMechanismEvidenceRef: 'evidence://privacy/transfer',
  professionalReviewEvidenceRef: 'evidence://legal/review',
  dashboardIdentityVerified: true,
  testSecretKeyPresent: true,
  webhookSecretPresent: true,
});

const environment = Object.freeze({
  transport: 'stripe',
  livemode: false,
  testCredentialClass: 'test',
  webhookSecretConfigured: true,
  providerCliOrEquivalentAvailable: true,
  externalRunAuthorized: true,
});

function scenarios(status = 'passed') {
  return pspSandboxScenarioIds.map((id) => ({
    id,
    status,
    livemode: false,
    realMoneyUsed: false,
    evidenceRef: `evidence://sandbox/${id}`,
  }));
}

test('fails closed with no external provider facts or scenario evidence', () => {
  const result = evaluatePspSandboxReadinessGate({
    environment: {
      transport: 'memory',
      livemode: false,
      testCredentialClass: null,
      webhookSecretConfigured: false,
      providerCliOrEquivalentAvailable: false,
      externalRunAuthorized: false,
    },
    scenarios: pspSandboxScenarioIds.map((id) => ({
      id,
      status: 'not-run',
      livemode: false,
      realMoneyUsed: false,
      evidenceRef: null,
    })),
  });

  assert.equal(result.state, 'hold-provider-contract-credentials-and-sandbox-e2e');
  assert.equal(result.contractAndProviderFactsReady, false);
  assert.equal(result.sandboxEnvironmentReady, false);
  assert.equal(result.passedScenarioCount, 0);
  assert.equal(result.sandboxE2ePassed, false);
  assert.equal(result.realMoneyReady, false);
});

test('accepts complete synthetic gate inputs without ever authorizing real money', () => {
  const result = evaluatePspSandboxReadinessGate({ provider, environment, scenarios: scenarios() });
  assert.equal(result.state, 'sandbox-e2e-passed-awaiting-later-release-gates');
  assert.equal(result.contractAndProviderFactsReady, true);
  assert.equal(result.sandboxEnvironmentReady, true);
  assert.equal(result.passedScenarioCount, pspSandboxScenarioIds.length);
  assert.equal(result.sandboxE2ePassed, true);
  assert.equal(result.realMoneyReady, false);
});

test('rejects duplicate, incomplete or credential-like evidence references', () => {
  const incomplete = scenarios();
  incomplete.pop();
  incomplete.push({ ...incomplete[0] });
  incomplete[0].evidenceRef = 'sk_test_not_evidence';
  const result = evaluatePspSandboxReadinessGate({ provider, environment, scenarios: incomplete });

  assert.equal(result.duplicateScenarioIds, true);
  assert.equal(result.passedScenarioCount < pspSandboxScenarioIds.length, true);
  assert.equal(result.sandboxE2ePassed, false);
});

test('detects a provider-pass claim made before the environment is ready', () => {
  const result = evaluatePspSandboxReadinessGate({
    provider: {},
    environment: { ...environment, transport: 'memory', externalRunAuthorized: false },
    scenarios: scenarios(),
  });
  assert.equal(result.providerScenarioClaimWithoutReadyEnvironment, true);
  assert.equal(result.sandboxE2ePassed, false);
});
