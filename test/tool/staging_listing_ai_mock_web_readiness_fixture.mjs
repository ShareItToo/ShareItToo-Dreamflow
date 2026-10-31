import crypto from 'node:crypto';
import { LISTING_AI_MOCK_DISCLOSURE_TEXT, LISTING_AI_MOCK_DISCLOSURE_VERSION } from '../../tool/staging_listing_ai_mock_web_readiness.mjs';

const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');

export function syntheticListingAiMockWebEvidence(sourceCommit, clientVersion, { now = new Date(), overrides = {} } = {}) {
  const collected = new Date(new Date(now).getTime() - 30_000);
  const runtime = { environment: 'staging', runtimeCommit: 'b'.repeat(40), imageDigest: `sha256:${sha('mock-image')}` };
  const configuration = { environment: 'staging', provider: 'mock', model: 'listing-ai-mock-v1', budgetCents: 0,
    externalProviderExecutionAllowed: false, automaticPublicationAllowed: false, productionEligible: false,
    runtimeCommit: runtime.runtimeCommit, imageDigest: runtime.imageDigest };
  const configurationSha256 = sha(JSON.stringify(configuration));
  const disclosureText = LISTING_AI_MOCK_DISCLOSURE_TEXT;
  const capability = { authenticatedReadback: true, available: true, provider: 'mock', mode: 'mock',
    model: 'listing-ai-mock-v1', budgetCents: 0, externalProviderExecutionAllowed: false,
    automaticPublicationAllowed: false, productionEligible: false, supportedClientVersion: clientVersion,
    runtimeCommit: runtime.runtimeCommit, imageDigest: runtime.imageDigest,
    disclosureVersion: LISTING_AI_MOCK_DISCLOSURE_VERSION, disclosureText, disclosureHash: sha(disclosureText),
    configRevision: `mock-${sha('mock-config').slice(0, 16)}`, configurationSha256,
    readAtUtc: new Date(collected.getTime() + 10_000).toISOString() };
  const evidence = { schemaVersion: 1, kind: 'sit-staging-listing-ai-mock-web-readiness',
    evidenceClass: 'authenticated-staging-mock-capability', syntheticFixture: false,
    web: { sourceCommit, clientVersion }, runtime, configuration, configurationSha256,
    capability, capabilitySha256: sha(JSON.stringify(capability)),
    collectedAtUtc: collected.toISOString(), validUntilUtc: new Date(collected.getTime() + 10 * 60_000).toISOString(),
    ...overrides };
  return { evidence, digest: sha(JSON.stringify(evidence)) };
}
