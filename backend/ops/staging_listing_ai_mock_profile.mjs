const profile = 'staging-mock-v1';
const fail = (code) => { throw new Error(`staging_listing_ai_mock_${code}`); };
const requireValue = (condition, code) => { if (!condition) fail(code); };

export function parseListingAiEnvironment(entries) {
  requireValue(Array.isArray(entries), 'environment_shape');
  const values = Object.create(null);
  for (const entry of entries) {
    requireValue(typeof entry === 'string' && /^[A-Z_][A-Z0-9_]*=/u.test(entry), 'environment_shape');
    const index = entry.indexOf('='); const name = entry.slice(0, index);
    requireValue(!Object.hasOwn(values, name), 'environment_duplicate');
    values[name] = entry.slice(index + 1);
  }
  return values;
}
export function assertStagingMockListingAiProfile(values, { deploymentEnvironment } = {}) {
  requireValue(values && typeof values === 'object' && !Array.isArray(values), 'environment_shape');
  requireValue(values.SIT_STAGING_LISTING_AI_PROFILE === profile, 'profile');
  requireValue(values.SIT_LISTING_AI_PROVIDER === 'mock'
    && values.SIT_LISTING_AI_MODEL === 'listing-ai-mock-v1'
    && values.SIT_LISTING_AI_BUDGET_CENTS === '0'
    && values.SIT_LISTING_AI_STAGING_SMOKE_BUDGET_CENTS === '0'
    && values.SIT_LISTING_AI_STAGING_SMOKE_ACTIVATION_ID === ''
    && values.SIT_LISTING_AI_EXTERNAL_EXECUTION_APPROVED === '0'
    && (values.OPENAI_API_KEY === undefined || values.OPENAI_API_KEY === '')
    && (values.OPENAI_API_KEY_FILE === undefined || values.OPENAI_API_KEY_FILE === ''), 'provider_boundary');
  requireValue(values.SIT_STAGING_PILOT_ID === 'heilbronn_wave0'
    && values.SIT_STAGING_ACCESS_GATE_ENABLED === 'true'
    && typeof values.SIT_STAGING_ALLOWED_USER_IDS === 'string' && values.SIT_STAGING_ALLOWED_USER_IDS.trim() !== ''
    && values.SIT_STAGING_COMPOSE_PROJECT === 'sit-green',
  'private_staging_boundary');
  const actualEnvironment = values.DEPLOYMENT_ENVIRONMENT;
  requireValue(actualEnvironment === 'test'
    && (!deploymentEnvironment || actualEnvironment === deploymentEnvironment), 'deployment_environment');
  return Object.freeze({ profile, provider: 'mock', model: 'listing-ai-mock-v1', budgetCents: 0,
    stagingSmokeBudgetCents: 0, stagingSmokeActivationId: null, externalProviderExecutionAllowed: false,
    automaticPublicationAllowed: false, productionEligible: false, syntheticOnly: true });
}
