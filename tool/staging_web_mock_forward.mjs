import { LISTING_AI_MOCK_WEB_PROFILE } from './staging_listing_ai_mock_web_readiness.mjs';
import { TARGET, validateArtifact } from './staging_web_contract.mjs';

// This is an additional narrow entry point. The ordinary Web deploy remains
// available for its existing independently reviewed provider profiles.
export function validateMockForwardCandidate(artifact, manifestHash, source) {
  const manifest = validateArtifact(artifact, manifestHash, source, { mode: 'candidate' });
  if (manifest.target !== TARGET || manifest.api !== `${TARGET}/api/v1`
    || manifest.profile?.SIT_RELEASE_CHANNEL !== 'internal'
    || manifest.profile?.SIT_BLUE_OCEAN_LISTING_ASSISTANT !== 'true'
    || manifest.profile?.SIT_STAGE_A_NON_BINDING_PILOT !== 'false'
    || manifest.profile?.SIT_STAGE_A_PILOT_ID !== ''
    || manifest.listingAiWebProfileVersion !== LISTING_AI_MOCK_WEB_PROFILE) {
    throw new Error('mock_forward_profile_required');
  }
  const readiness = JSON.parse(manifest.profile.SIT_BLUE_OCEAN_LISTING_ASSISTANT_READINESS_JSON);
  const configuration = readiness.configuration;
  const capability = readiness.capability;
  if (configuration.environment !== 'staging' || configuration.provider !== 'mock'
    || configuration.model !== 'listing-ai-mock-v1' || configuration.budgetCents !== 0
    || configuration.externalProviderExecutionAllowed !== false
    || configuration.automaticPublicationAllowed !== false
    || configuration.productionEligible !== false
    || capability.provider !== 'mock' || capability.mode !== 'mock'
    || capability.model !== 'listing-ai-mock-v1' || capability.budgetCents !== 0
    || capability.externalProviderExecutionAllowed !== false
    || capability.automaticPublicationAllowed !== false
    || capability.productionEligible !== false) {
    throw new Error('mock_forward_safety_contract');
  }
  // The shared readiness consumer owns shape, digest, expiry, source and
  // disclosure checks; validateArtifact binds those claims to sealed bytes.
  return manifest;
}
