import crypto from 'node:crypto';
import {
  GOOGLE_WEB_AUTH_APIS, GOOGLE_WEB_CURRENT_ORIGINS,
} from '../../tool/staging_google_web_current_readback.mjs';

const hash = value => crypto.createHash('sha256').update(value).digest('hex');
export const fixtureOperatorHash = 'ab40c92847d70810d0da6d819491307bbaf5989e3d835ee0eb1b3d4443bad776';
export function syntheticGoogleCurrentEvidence(source, version = '1.2.3+20261026', now = new Date()) {
  const time = new Date(now);
  const config = {
    projectId: 'staging-shareittoo', messagingSenderId: '123456789012',
    appId: `1:123456789012:web:${'a'.repeat(32)}`,
    apiKey: ['AI', 'za', 'x'.repeat(35)].join(''),
    authDomain: 'staging-shareittoo.firebaseapp.com',
    backendProjectId: 'staging-shareittoo', authorizedOrigin: 'https://staging.shareittoo.com',
  };
  const configurationSha256 = hash(JSON.stringify(config));
  const service = {
    schemaVersion: 1, kind: 'sit-google-web-service-account-readback',
    evidenceClass: 'direct-firebase-management-identity-toolkit-and-runtime-readback',
    syntheticFixture: false,
    readAtUtc: new Date(time.getTime() - 60_000).toISOString(),
    validUntilUtc: new Date(time.getTime() + 60 * 60_000).toISOString(),
    projectId: config.projectId, projectState: 'ACTIVE', webAppId: config.appId,
    webAppPresent: true, publicWebConfig: config,
    authorizedDomains: ['staging.shareittoo.com', 'staging-shareittoo.firebaseapp.com'],
    googleProviderEnabled: true, appleProviderEnabled: false, facebookProviderEnabled: false,
    firebaseAuthEnabled: true, firebaseEmulatorEnabled: false,
    runtime: { service: '/shareittoo-staging-api', identity: 'c'.repeat(64),
      environment: 'staging', projectId: config.projectId, green: true, running: true,
      commit: 'c904aed9f58691176a30aadb222f0cb3635f167e',
      image: `ghcr.io/shareittoo/shareittoo-api@sha256:${'b'.repeat(64)}` },
  };
  const serviceAccountReadbackSha256 = hash(JSON.stringify(service));
  const serviceUsageBinding = {
    schemaVersion: 1, kind: 'sit-google-web-service-usage-binding',
    evidenceClass: 'direct-google-cloud-console-service-usage-binding', syntheticFixture: false,
    projectId: config.projectId, projectNumber: config.messagingSenderId,
    readAtUtc: new Date(time.getTime() - 70_000).toISOString(),
    validUntilUtc: new Date(time.getTime() + 30 * 60_000).toISOString(),
    consoleReadbackSha256: hash('synthetic-service-usage-console-proof'),
    serviceReadbackSha256: serviceAccountReadbackSha256,
  };
  const consoleRead = {
    schemaVersion: 1, kind: 'sit-google-web-cloud-console-api-key-readback',
    evidenceClass: 'direct-google-cloud-console-readback', syntheticFixture: false,
    readAtUtc: new Date(time.getTime() - 30_000).toISOString(),
    validUntilUtc: new Date(time.getTime() + 60 * 60_000).toISOString(),
    projectId: config.projectId, operatorAccountEmailSha256: fixtureOperatorHash,
    apiKeyResourceId: 'projects/123456789012/locations/global/keys/64e7f44b-32c2-4188-92b4-7983349ceeb6',
    apiKeySha256: hash(config.apiKey), apiRestrictions: [...GOOGLE_WEB_AUTH_APIS],
    websiteRestrictions: [...GOOGLE_WEB_CURRENT_ORIGINS],
  };
  const cloudConsoleReadbackSha256 = hash(JSON.stringify(consoleRead));
  const decision = {
    schemaVersion: 1, kind: 'sit-google-web-sol-release-decision',
    evidenceClass: 'independent-sol-release-review', syntheticFixture: false,
    decision: 'approved', sourceCommit: source, buildVersion: version,
    serviceAccountReadbackSha256, cloudConsoleReadbackSha256, configurationSha256,
    projectId: config.projectId, webAppId: config.appId,
    apiKeyResourceId: consoleRead.apiKeyResourceId,
    decidedAtUtc: time.toISOString(), validUntilUtc: new Date(time.getTime() + 30 * 60_000).toISOString(),
  };
  const envelope = {
    schemaVersion: 2, kind: 'sit-google-web-current-readback',
    evidenceClass: 'direct-authoritative-provider-runtime-and-console-readback',
    syntheticFixture: false, sourceCommit: source, buildVersion: version,
    configuration: config, configurationSha256,
    serviceAccountReadback: service, serviceAccountReadbackSha256,
    serviceUsageBinding, serviceUsageBindingSha256: hash(JSON.stringify(serviceUsageBinding)),
    cloudConsoleReadback: consoleRead, cloudConsoleReadbackSha256,
    decision, decisionSha256: hash(JSON.stringify(decision)),
  };
  const bytes = Buffer.from(JSON.stringify(envelope));
  return { envelope, bytes, digest: hash(bytes), config, service, serviceUsageBinding,
    consoleRead, decision, now: time };
}
