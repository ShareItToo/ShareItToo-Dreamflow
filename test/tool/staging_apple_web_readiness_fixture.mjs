// SYNTHETIC CONTRACT FIXTURES ONLY. These emulate external evidence shapes;
// false flags below exercise production validation and are not real readbacks.
import { sha256, TARGET } from '../../tool/staging_web_contract.mjs';
import { bindAppleWebReadiness } from '../../tool/staging_apple_web_readiness.mjs';
import { syntheticGoogleConfig } from './staging_google_web_readiness_fixture.mjs';
export function syntheticAppleEvidence(source, { now = new Date(), config = {}, readiness = {}, backend = {}, decision = {}, envelope = {} } = {}) {
  const clock = new Date(now); clock.setUTCMilliseconds(0);
  const at = (offset) => new Date(clock.getTime() + offset).toISOString().replace('.000Z', 'Z');
  const c = { ...syntheticGoogleConfig(), clientId: 'com.shareittoo.synthetic.web',
    redirectUri: `${TARGET}/auth/apple/callback`, ...config };
  const configurationSha256 = sha256(JSON.stringify(c));
  const r = {
    schemaVersion: 2, provider: 'apple', platform: 'web_direct',
    origin: TARGET, apiBaseUrl: `${TARGET}/api/v1`,
    backendFirebaseProjectId: c.backendProjectId, webAppConfigSha256: configurationSha256,
    callbackUrl: c.redirectUri, firebaseProviderEnabled: true, firebaseAppleOAuthConfigured: true,
    appleServicesIdSha256: sha256(c.clientId), firebaseAppleServicesIdSha256: sha256(c.clientId),
    backendAppleServicesIdSha256: sha256(c.clientId),
    backendAppleOwnershipConfigured: true, backendAppleAcquisitionEnabled: true,
    appleTeamIdSha256: sha256('synthetic-team'), firebaseAppleTeamIdSha256: sha256('synthetic-team'),
    appleKeyIdSha256: sha256('synthetic-key'), firebaseAppleKeyIdSha256: sha256('synthetic-key'),
    applePrimaryAppSignInEnabled: true, appleServicesIdBoundToPrimaryApp: true,
    appleSigningKeyEnabled: true, appleRedirectDomainSha256: sha256('staging.shareittoo.com'),
    backendAppleRedirectUriSha256: sha256(c.redirectUri), appleRedirectDomainVerified: true,
    appleReturnUrlVerified: true, scope: 'private_pilot',
    audience: 'existing_allowlisted_accounts_only', audienceVerified: true,
    providerReadbackSha256: sha256('synthetic-provider'), observedAtUtc: at(-60_000),
    validUntilUtc: at(3_600_000), ...readiness,
  };
  const readinessSha256 = sha256(JSON.stringify(r));
  const b = {
    schemaVersion: 1, evidenceClass: 'verified-runtime-readback', syntheticFixture: false,
    sourceCommit: source, runtimeCommit: source, runtimeImageSha256: sha256('synthetic-image'),
    firebaseProjectId: c.backendProjectId, webAppId: c.appId, apiBaseUrl: r.apiBaseUrl,
    appleServicesIdSha256: sha256(c.clientId), appleRedirectUriSha256: sha256(c.redirectUri),
    appleTeamIdSha256: r.appleTeamIdSha256, appleKeyIdSha256: r.appleKeyIdSha256,
    revocationEnabled: true, revocationConfigured: true,
    revocationSigningKeySource: 'file', revocationEncryptionKeySource: 'file',
    protectedSecretFilesVerified: true, ownershipConfigured: true, acquisitionEnabled: true,
    ownershipProtocolVersion: 2, ownershipProfileSha256: sha256('synthetic-profile'),
    existingAccountsOnly: true, allowlistEnforced: true, allowlistSha256: sha256('synthetic-allowlist'),
    firebaseAuthEnabled: true, firebaseEmulatorEnabled: false,
    collectorIdentitySha256: sha256('synthetic-collector'),
    appleProviderReadbackSha256: sha256('synthetic-apple'),
    firebaseProviderReadbackSha256: sha256('synthetic-firebase'),
    firebaseWebAppReadbackSha256: sha256('synthetic-app'),
    runtimeReadbackSha256: sha256('synthetic-runtime'), observedAtUtc: at(-60_000),
    validUntilUtc: at(3_600_000), ...backend,
  };
  const backendSha256 = sha256(JSON.stringify(b));
  const d = {
    schemaVersion: 1, kind: 'sit-apple-web-activation-decision',
    evidenceClass: 'independent-release-review', syntheticFixture: false, decision: 'approved',
    sourceCommit: source, configurationSha256, readinessSha256, backendSha256,
    collectorIdentitySha256: b.collectorIdentitySha256,
    reviewerIdentitySha256: sha256('synthetic-independent-reviewer'),
    reviewEvidenceSha256: sha256('synthetic-review'), decidedAtUtc: at(-30_000),
    validUntilUtc: at(1_800_000), ...decision,
  };
  const value = {
    schemaVersion: 1, kind: 'sit-apple-web-release-readiness',
    evidenceClass: 'provider-runtime-readback-and-independent-decision',
    syntheticFixture: false, activationEligible: true,
    configuration: c, configurationSha256, readiness: r, readinessSha256,
    backend: b, backendSha256, decision: d, decisionSha256: sha256(JSON.stringify(d)),
    ...envelope,
  };
  const bytes = JSON.stringify(value);
  return { value, bytes, digest: sha256(bytes), now: clock };
}
export function syntheticAppleBinding(source, options = {}) {
  const e = syntheticAppleEvidence(source, options);
  return bindAppleWebReadiness(e.value, e.digest, { now: e.now, expectedSource: source });
}
