const requiredProviderFacts = Object.freeze([
  'providerSelected',
  'licensedMarketplaceProductVerified',
  'contractEvidenceRef',
  'productConfigurationEvidenceRef',
  'sandboxAccountEvidenceRef',
  'dpaEvidenceRef',
  'processingRegionsEvidenceRef',
  'transferMechanismEvidenceRef',
  'professionalReviewEvidenceRef',
  'dashboardIdentityVerified',
  'testSecretKeyPresent',
  'webhookSecretPresent',
]);

export const pspSandboxScenarioIds = Object.freeze([
  'connected_owner_onboarding_and_capabilities',
  'authorization_capture_and_decline',
  'signed_webhook_replay_and_state_mapping',
  'separate_rent_and_fee_refund',
  'partial_payout_hold_and_undisputed_release',
  'chargeback_and_payout_block',
  'reconciliation_and_financial_documents',
  'idempotent_retry_and_provider_db_mismatch',
]);

function evidenceRef(value) {
  return typeof value === 'string'
    && value.length >= 12
    && value.length <= 240
    && !/\s|secret|password|token|sk_(?:test|live)_|whsec_/iu.test(value);
}

function providerFactPresent(provider, key) {
  if (key.endsWith('EvidenceRef')) return evidenceRef(provider?.[key]);
  return provider?.[key] === true;
}

function scenarioPassed(scenario) {
  return scenario?.status === 'passed'
    && scenario?.livemode === false
    && scenario?.realMoneyUsed === false
    && evidenceRef(scenario?.evidenceRef);
}

export function evaluatePspSandboxReadinessGate({
  provider = {},
  environment = {},
  scenarios = [],
} = {}) {
  const missingProviderFacts = requiredProviderFacts.filter(
    (key) => !providerFactPresent(provider, key),
  );
  const contractAndProviderFactsReady = missingProviderFacts.length === 0;
  const sandboxEnvironmentReady = contractAndProviderFactsReady
    && environment.transport === 'stripe'
    && environment.livemode === false
    && environment.testCredentialClass === 'test'
    && environment.webhookSecretConfigured === true
    && environment.providerCliOrEquivalentAvailable === true
    && environment.externalRunAuthorized === true;

  const scenarioMap = new Map(scenarios.map((scenario) => [scenario?.id, scenario]));
  const missingScenarioIds = pspSandboxScenarioIds.filter((id) => !scenarioMap.has(id));
  const duplicateScenarioIds = scenarios.length !== scenarioMap.size;
  const passedScenarioCount = pspSandboxScenarioIds.reduce(
    (count, id) => count + (scenarioPassed(scenarioMap.get(id)) ? 1 : 0),
    0,
  );
  const providerScenarioClaimWithoutReadyEnvironment = passedScenarioCount > 0
    && !sandboxEnvironmentReady;
  const sandboxE2ePassed = sandboxEnvironmentReady
    && missingScenarioIds.length === 0
    && duplicateScenarioIds === false
    && scenarios.length === pspSandboxScenarioIds.length
    && passedScenarioCount === pspSandboxScenarioIds.length;

  return Object.freeze({
    state: sandboxE2ePassed
      ? 'sandbox-e2e-passed-awaiting-later-release-gates'
      : 'hold-provider-contract-credentials-and-sandbox-e2e',
    missingProviderFacts: Object.freeze(missingProviderFacts),
    contractAndProviderFactsReady,
    sandboxEnvironmentReady,
    requiredScenarioCount: pspSandboxScenarioIds.length,
    passedScenarioCount,
    missingScenarioIds: Object.freeze(missingScenarioIds),
    duplicateScenarioIds,
    providerScenarioClaimWithoutReadyEnvironment,
    sandboxE2ePassed,
    realMoneyReady: false,
  });
}
