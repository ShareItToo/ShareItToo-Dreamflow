import crypto from 'node:crypto';

import {
  bindGoogleWebReadiness,
  GOOGLE_WEB_TARGET,
} from '../../tool/staging_google_web_readiness.mjs';

const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');

export function syntheticGoogleConfig(overrides = {}) {
  return {
    projectId: 'synthetic-sit-fixture',
    messagingSenderId: '123456789012',
    appId: `1:123456789012:web:${'a'.repeat(32)}`,
    apiKey: ['AI', 'za', 'x'.repeat(35)].join(''),
    authDomain: 'synthetic-sit-fixture.firebaseapp.com',
    backendProjectId: 'synthetic-sit-fixture',
    authorizedOrigin: GOOGLE_WEB_TARGET,
    ...overrides,
  };
}

export function syntheticGoogleEvidence(source, {
  configuration = syntheticGoogleConfig(),
  now = new Date(),
  readiness: readinessOverrides = {},
  decision: decisionOverrides = {},
  envelope: envelopeOverrides = {},
} = {}) {
  const clock = new Date(now);
  clock.setUTCMilliseconds(0);
  const configurationSha256 = hash(JSON.stringify(configuration));
  const readiness = {
    sourceCommit: source,
    prerequisiteRunnerSha256: hash('runner'),
    firebaseAccountEmailSha256: hash('account'),
    gateEvidenceSha256: hash('gate'),
    baselineSha256: hash('baseline'),
    projectId: configuration.projectId,
    projectNumber: configuration.messagingSenderId,
    backendProjectId: configuration.backendProjectId,
    webAppId: configuration.appId,
    authorizedDomain: 'staging.shareittoo.com',
    firebaseProviderId: 'google.com',
    firebaseProviderEnabled: true,
    firebaseAuthEnabled: true,
    firebaseEmulatorEnabled: false,
    finalSnapshotSha256: hash('final-snapshot'),
    finalRevisionSha256: hash('final-revision'),
    authConfigReadbackSha256: hash('auth-config'),
    providerConfigReadbackSha256: hash('provider-config'),
    webAppReadbackSha256: hash('web-app'),
    authorizedDomainsReadbackSha256: hash('domains'),
    keyInventoryReadbackSha256: hash('key-inventory'),
    otherAppsReadbackSha256: hash('other-apps'),
    runtimeReadbackSha256: hash('runtime'),
    prerequisiteJournalSha256: hash('journal'),
    prerequisiteFinalRecordSha256: hash('final-record'),
    collectedAtUtc: new Date(clock.getTime() - 60_000).toISOString(),
    validUntilUtc: new Date(clock.getTime() + 60 * 60_000).toISOString(),
    ...readinessOverrides,
  };
  const readinessSha256 = hash(JSON.stringify(readiness));
  const decision = {
    schemaVersion: 1,
    kind: 'sit-google-web-prerequisite-activation-decision',
    evidenceClass: 'independent-release-review',
    syntheticFixture: false,
    decision: 'approved',
    sourceCommit: readiness.sourceCommit,
    prerequisiteJournalSha256: readiness.prerequisiteJournalSha256,
    prerequisiteFinalRecordSha256: readiness.prerequisiteFinalRecordSha256,
    configurationSha256,
    readinessSha256,
    projectId: readiness.projectId,
    projectNumber: readiness.projectNumber,
    webAppId: readiness.webAppId,
    authorizedDomain: readiness.authorizedDomain,
    firebaseProviderId: readiness.firebaseProviderId,
    decidedAtUtc: clock.toISOString(),
    validUntilUtc: new Date(clock.getTime() + 30 * 60_000).toISOString(),
    ...decisionOverrides,
  };
  const envelope = {
    schemaVersion: 2,
    kind: 'sit-google-web-prerequisite-readiness-candidate',
    evidenceClass: 'verified-prerequisite-journal-and-independent-decision',
    syntheticFixture: false,
    activationDecision: 'approved-independent-review',
    activationEligible: true,
    configuration,
    configurationSha256,
    readiness,
    readinessSha256,
    decision,
    decisionSha256: hash(JSON.stringify(decision)),
    ...envelopeOverrides,
  };
  const bytes = JSON.stringify(envelope);
  return { envelope, bytes, evidenceDigest: hash(bytes), now: clock };
}

export function syntheticGoogleBinding(source, options = {}) {
  const evidence = syntheticGoogleEvidence(source, options);
  return bindGoogleWebReadiness(evidence.envelope, evidence.evidenceDigest, {
    now: evidence.now,
    expectedSource: source,
  });
}
