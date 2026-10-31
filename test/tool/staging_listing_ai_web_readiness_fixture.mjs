import crypto from 'node:crypto';

const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');

export function syntheticListingAiWebEvidence(sourceCommit, clientVersion,
  { now = new Date(), overrides = {} } = {}) {
  const collectedAt = new Date(new Date(now).getTime() - 60_000);
  const configuration = {
    environment: 'staging', pilotId: 'heilbronn_wave0',
    runtimeCommit: 'b'.repeat(40), imageDigest: `sha256:${sha('runtime-image')}`,
    promotionKind: 'green-staging-106-106',
    promotionReceiptSha256: sha('106-to-106-promotion-receipt'),
    promotedAtUtc: new Date(collectedAt.getTime() - 10 * 60_000).toISOString(),
    provider: 'openai', model: 'gpt-4o-mini-2024-07-18', budgetCents: 10_000,
    budgetScope: 'lifetime', stagingSmokeBudgetCents: 500,
    stagingSmokeActivationId: '11111111-1111-4111-8111-111111111111',
    runMaxProviderCalls: 5,
    externalExecutionApproved: true, automaticPublicationAllowed: false,
    providerSecretMetadataValidated: true,
    providerSecretMetadataReceiptSha256: sha('credential metadata validator receipt'),
    providerSecretMode: '0640', providerSecretOwnerUid: 0, providerSecretGroupGid: 65532,
    providerSecretRegularFile: true, providerSecretNonSymlink: true,
    providerSecretOutsideRepository: true, providerSecretReadOnlyMount: true,
    rollbackToMockVerified: true, rollbackToMockProofSha256: sha('rollback to mock proof'),
  };
  const configurationSha256 = sha(JSON.stringify(configuration));
  const capability = {
    authenticatedReadback: true, available: true, provider: 'openai', mode: 'external',
    budgetScope: 'lifetime', lifetimeBudgetCents: configuration.budgetCents,
    stagingSmokeBudgetCents: configuration.stagingSmokeBudgetCents,
    stagingSmokeActivationId: configuration.stagingSmokeActivationId,
    supportedClientVersion: clientVersion, imageLimit: 4,
    disclosureVersion: 'listing-ai-disclosure-v1', disclosureHash: sha('disclosure'),
    configRevision: `cfg-${sha('config').slice(0, 16)}`, configurationSha256,
    readAtUtc: new Date(collectedAt.getTime() + 50_000).toISOString(),
  };
  const capabilitySha256 = sha(JSON.stringify(capability));
  const evidence = {
    schemaVersion: 1, kind: 'sit-staging-listing-ai-web-readiness',
    evidenceClass: 'verified-promoted-runtime-authenticated-capability-and-independent-gemini-decision',
    syntheticFixture: false, activationDecision: 'approved-independent-gemini-review',
    activationEligible: true,
    web: { sourceCommit, clientVersion },
    configuration, configurationSha256, capability, capabilitySha256,
    collectedAtUtc: collectedAt.toISOString(),
    validUntilUtc: new Date(collectedAt.getTime() + 30 * 60_000).toISOString(),
    geminiDecision: {
      schemaVersion: 1, kind: 'sit-staging-listing-ai-web-decision',
      evidenceClass: 'independent-gemini-release-review', reviewerRole: 'gemini-independent',
      decision: 'approve-external-web-listing-ai', gateId: 'SIT-WEB-LISTINGAI-20261025',
      sourceCommit, clientVersion, runtimeCommit: configuration.runtimeCommit,
      imageDigest: configuration.imageDigest,
      promotionReceiptSha256: configuration.promotionReceiptSha256,
      capabilitySha256, configurationSha256,
      decisionEvidenceSha256: sha('independent Gemini decision evidence'),
      decidedAtUtc: new Date(collectedAt.getTime() + 55_000).toISOString(),
      validUntilUtc: new Date(collectedAt.getTime() + 25 * 60_000).toISOString(),
    },
    ...overrides,
  };
  evidence.geminiDecisionSha256 = sha(JSON.stringify(evidence.geminiDecision));
  return { evidence, digest: sha(JSON.stringify(evidence)) };
}
