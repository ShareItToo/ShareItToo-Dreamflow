import crypto from 'node:crypto';
import { readGoogleWebProtectedBytes } from './staging_google_web_readiness.mjs';

export const GOOGLE_WEB_PROFILE_V3 = 'staging-google-web-current-readback-v3';
export const GOOGLE_WEB_CURRENT_ORIGINS = Object.freeze([
  'https://staging.shareittoo.com/*',
  'https://shareittoo-staging.firebaseapp.com/*',
  'https://shareittoo-staging.web.app/*',
]);
export const GOOGLE_WEB_AUTH_APIS = Object.freeze([
  'Cloud Datastore API', 'Cloud Firestore API', 'Cloud Logging API', 'Cloud SQL Admin API',
  'Cloud Storage for Firebase API', 'FCM Registration API', 'Firebase AI Logic API',
  'Firebase App Check API', 'Firebase App Distribution API', 'Firebase App Hosting API',
  'Firebase App Testers API', 'Firebase Hosting API', 'Firebase In-App Messaging API',
  'Firebase Installations API', 'Firebase Management API', 'Firebase ML API',
  'Firebase Phone Number Verification API', 'Firebase Realtime Database Management API',
  'Firebase Remote Config API', 'Firebase Remote Config Realtime API', 'Firebase Rules API',
  'Firebase SQL Connect API', 'Identity Toolkit API', 'ML Kit API', 'Token Service API',
].sort());

const envelopeKeysV1 = Object.freeze([
  'schemaVersion', 'kind', 'evidenceClass', 'syntheticFixture', 'sourceCommit',
  'buildVersion', 'configuration', 'configurationSha256', 'serviceAccountReadback',
  'serviceAccountReadbackSha256', 'cloudConsoleReadback', 'cloudConsoleReadbackSha256',
  'decision', 'decisionSha256',
]);
const envelopeKeysV2 = Object.freeze([
  ...envelopeKeysV1.slice(0, 10), 'serviceUsageBinding', 'serviceUsageBindingSha256',
  ...envelopeKeysV1.slice(10),
]);
const configurationKeys = Object.freeze([
  'projectId', 'messagingSenderId', 'appId', 'apiKey', 'authDomain',
  'backendProjectId', 'authorizedOrigin',
]);
const runtimeKeys = Object.freeze(['service', 'identity', 'environment', 'projectId', 'green', 'running', 'commit', 'image']);
const serviceAccountKeys = Object.freeze([
  'schemaVersion', 'kind', 'evidenceClass', 'syntheticFixture', 'readAtUtc',
  'validUntilUtc', 'projectId', 'projectState', 'webAppId', 'webAppPresent',
  'publicWebConfig', 'authorizedDomains', 'googleProviderEnabled', 'appleProviderEnabled',
  'facebookProviderEnabled', 'firebaseAuthEnabled', 'firebaseEmulatorEnabled', 'runtime',
]);
const consoleKeys = Object.freeze([
  'schemaVersion', 'kind', 'evidenceClass', 'syntheticFixture', 'readAtUtc',
  'validUntilUtc', 'projectId', 'operatorAccountEmailSha256', 'apiKeyResourceId', 'apiKeySha256',
  'apiRestrictions', 'websiteRestrictions',
]);
const decisionKeys = Object.freeze([
  'schemaVersion', 'kind', 'evidenceClass', 'syntheticFixture', 'decision',
  'sourceCommit', 'buildVersion', 'serviceAccountReadbackSha256',
  'cloudConsoleReadbackSha256', 'configurationSha256', 'projectId', 'webAppId',
  'apiKeyResourceId', 'decidedAtUtc', 'validUntilUtc',
]);
const serviceUsageBindingKeys = Object.freeze([
  'schemaVersion', 'kind', 'evidenceClass', 'syntheticFixture', 'projectId',
  'projectNumber', 'readAtUtc', 'validUntilUtc', 'consoleReadbackSha256',
  'serviceReadbackSha256',
]);
const bindingKeys = Object.freeze([
  'profileContractVersion', 'config', 'configDigest', 'readinessJson', 'readinessDigest',
  'decisionJson', 'decisionDigest', 'evidenceDigest', 'serviceAccountReadbackSha256',
  'cloudConsoleReadbackSha256', 'validatedAtUtc',
]);
const hashPattern = /^[a-f0-9]{64}$/u;
const sourcePattern = /^[a-f0-9]{40}$/u;
const apiKeyResourcePattern = /^projects\/[0-9]{6,20}\/locations\/global\/keys\/[A-Za-z0-9_-]{16,64}$/u;
const imagePattern = /^ghcr\.io\/shareittoo\/shareittoo-api@sha256:[a-f0-9]{64}$/u;
const runtimeIdentityPattern = /^[a-f0-9]{64}$/u;
const approvedOperatorAccountEmailSha256 = 'ab40c92847d70810d0da6d819491307bbaf5989e3d835ee0eb1b3d4443bad776';
const maximumAgeMs = 2 * 60 * 60 * 1000;
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const check = (value, code) => { if (!value) throw new Error(code); };
const ordered = (value, keys) => Object.fromEntries(keys.map(key => [key, value[key]]));
function exact(value, keys, code) {
  check(value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype
    && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)), code);
}
function timestamp(value, code) {
  check(typeof value === 'string', code);
  const ms = Date.parse(value);
  check(Number.isFinite(ms) && new Date(ms).toISOString() === value, code);
  return ms;
}
function digestObject(value, digest, keys, code) {
  exact(value, keys, code);
  const canonical = JSON.stringify(ordered(value, keys));
  check(JSON.stringify(value) === canonical && hashPattern.test(digest ?? '')
    && sha256(canonical) === digest, code);
  return canonical;
}
function sortedExact(actual, expected, code) {
  check(Array.isArray(actual) && actual.every(item => typeof item === 'string')
    && JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort())
    && new Set(actual).size === actual.length, code);
}
function configIsValid(config) {
  exact(config, configurationKeys, 'google_web_current_config');
  return Object.values(config).every(value => typeof value === 'string')
    && /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/u.test(config.projectId)
    && /^[0-9]{6,20}$/u.test(config.messagingSenderId)
    && new RegExp(`^1:${config.messagingSenderId}:web:[a-f0-9]{16,64}$`, 'u').test(config.appId)
    && /^AIza[A-Za-z0-9_-]{35}$/u.test(config.apiKey)
    && config.authDomain === `${config.projectId}.firebaseapp.com`
    && config.backendProjectId === config.projectId
    && config.authorizedOrigin === 'https://staging.shareittoo.com';
}
function bindEvidence(evidence, evidenceDigest, { now = new Date(), expectedSource, expectedVersion } = {}) {
  const evidenceKeys = evidence?.schemaVersion === 2 ? envelopeKeysV2 : envelopeKeysV1;
  exact(evidence, evidenceKeys, 'google_web_current_shape');
  exact(evidence.configuration, configurationKeys, 'google_web_current_shape');
  check(JSON.stringify(evidence) === JSON.stringify(ordered({ ...evidence,
    configuration: ordered(evidence.configuration, configurationKeys),
    serviceAccountReadback: ordered(evidence.serviceAccountReadback ?? {}, serviceAccountKeys),
    cloudConsoleReadback: ordered(evidence.cloudConsoleReadback ?? {}, consoleKeys),
    ...(evidence.schemaVersion === 2 ? {
      serviceUsageBinding: ordered(evidence.serviceUsageBinding ?? {}, serviceUsageBindingKeys),
    } : {}),
    decision: ordered(evidence.decision ?? {}, decisionKeys),
  }, evidenceKeys)), 'google_web_current_canonical');
  check(hashPattern.test(evidenceDigest ?? '') && sha256(JSON.stringify(evidence)) === evidenceDigest,
    'google_web_current_digest');
  check((evidence.schemaVersion === 1 || evidence.schemaVersion === 2)
    && evidence.kind === 'sit-google-web-current-readback'
    && evidence.evidenceClass === 'direct-authoritative-provider-runtime-and-console-readback'
    && evidence.syntheticFixture === false && sourcePattern.test(evidence.sourceCommit)
    && evidence.sourceCommit === expectedSource && evidence.buildVersion === expectedVersion
    && /^\d+\.\d+\.\d+\+\d+$/u.test(evidence.buildVersion), 'google_web_current_identity');
  check(configIsValid(evidence.configuration), 'google_web_current_config');
  const configurationJson = JSON.stringify(ordered(evidence.configuration, configurationKeys));
  check(hashPattern.test(evidence.configurationSha256)
    && sha256(configurationJson) === evidence.configurationSha256, 'google_web_current_config_digest');

  const service = evidence.serviceAccountReadback;
  const serviceJson = digestObject(service, evidence.serviceAccountReadbackSha256,
    serviceAccountKeys, 'google_web_current_service_readback');
  const serviceAt = timestamp(service.readAtUtc, 'google_web_current_service_time');
  const serviceUntil = timestamp(service.validUntilUtc, 'google_web_current_service_time');
  check(service.schemaVersion === 1 && service.kind === 'sit-google-web-service-account-readback'
    && service.evidenceClass === 'direct-firebase-management-identity-toolkit-and-runtime-readback'
    && service.syntheticFixture === false && service.projectId === evidence.configuration.projectId
    && service.projectState === 'ACTIVE' && service.webAppId === evidence.configuration.appId
    && service.webAppPresent === true && Array.isArray(service.authorizedDomains)
    && JSON.stringify(service.publicWebConfig) === configurationJson
    && service.authorizedDomains.includes('staging.shareittoo.com')
    && service.googleProviderEnabled === true
    && typeof service.appleProviderEnabled === 'boolean'
    && typeof service.facebookProviderEnabled === 'boolean'
    && service.firebaseAuthEnabled === true
    && service.firebaseEmulatorEnabled === false && serviceUntil > serviceAt
    && serviceUntil - serviceAt <= maximumAgeMs, 'google_web_current_service_readback');
  exact(service.runtime, runtimeKeys, 'google_web_current_runtime');
  check(service.runtime.service === '/shareittoo-staging-api'
    && typeof service.runtime.identity === 'string' && runtimeIdentityPattern.test(service.runtime.identity)
    && service.runtime.environment === 'staging' && service.runtime.projectId === evidence.configuration.projectId
    && service.runtime.green === true && service.runtime.running === true
    && sourcePattern.test(service.runtime.commit) && imagePattern.test(service.runtime.image),
  'google_web_current_runtime');

  if (evidence.schemaVersion === 2) {
    const usage = evidence.serviceUsageBinding;
    const usageJson = digestObject(usage, evidence.serviceUsageBindingSha256,
      serviceUsageBindingKeys, 'google_web_current_service_usage_binding');
    const usageAt = timestamp(usage.readAtUtc, 'google_web_current_service_usage_time');
    const usageUntil = timestamp(usage.validUntilUtc, 'google_web_current_service_usage_time');
    check(usage.schemaVersion === 1 && usage.kind === 'sit-google-web-service-usage-binding'
      && usage.evidenceClass === 'direct-google-cloud-console-service-usage-binding'
      && usage.syntheticFixture === false && usage.projectId === evidence.configuration.projectId
      && usage.projectNumber === evidence.configuration.messagingSenderId
      && hashPattern.test(usage.consoleReadbackSha256 ?? '')
      && usage.serviceReadbackSha256 === evidence.serviceAccountReadbackSha256
      && usageAt <= serviceAt && usageUntil > usageAt
      && usageUntil - usageAt <= maximumAgeMs,
    'google_web_current_service_usage_binding');
    check(now.getTime() >= usageAt && now.getTime() < usageUntil,
      'google_web_current_expired');
    check(usageJson.length > 0, 'google_web_current_service_usage_binding');
  }

  const consoleRead = evidence.cloudConsoleReadback;
  const consoleJson = digestObject(consoleRead, evidence.cloudConsoleReadbackSha256,
    consoleKeys, 'google_web_current_console_readback');
  const consoleAt = timestamp(consoleRead.readAtUtc, 'google_web_current_console_time');
  const consoleUntil = timestamp(consoleRead.validUntilUtc, 'google_web_current_console_time');
  check(consoleRead.schemaVersion === 1 && consoleRead.kind === 'sit-google-web-cloud-console-api-key-readback'
    && consoleRead.evidenceClass === 'direct-google-cloud-console-readback'
    && consoleRead.syntheticFixture === false && consoleRead.projectId === evidence.configuration.projectId
    && consoleRead.operatorAccountEmailSha256 === approvedOperatorAccountEmailSha256
    && apiKeyResourcePattern.test(consoleRead.apiKeyResourceId)
    && consoleRead.apiKeyResourceId.startsWith(`projects/${evidence.configuration.messagingSenderId}/`)
    && consoleRead.apiKeySha256 === sha256(evidence.configuration.apiKey)
    && consoleUntil > consoleAt && consoleUntil - consoleAt <= maximumAgeMs,
  'google_web_current_console_readback');
  sortedExact(consoleRead.apiRestrictions, GOOGLE_WEB_AUTH_APIS, 'google_web_current_api_restrictions');
  sortedExact(consoleRead.websiteRestrictions, GOOGLE_WEB_CURRENT_ORIGINS, 'google_web_current_website_restrictions');

  const decision = evidence.decision;
  const decisionJson = digestObject(decision, evidence.decisionSha256, decisionKeys,
    'google_web_current_decision');
  const decidedAt = timestamp(decision.decidedAtUtc, 'google_web_current_decision_time');
  const decisionUntil = timestamp(decision.validUntilUtc, 'google_web_current_decision_time');
  check(decision.schemaVersion === 1 && decision.kind === 'sit-google-web-sol-release-decision'
    && decision.evidenceClass === 'independent-sol-release-review' && decision.syntheticFixture === false
    && decision.decision === 'approved' && decision.sourceCommit === evidence.sourceCommit
    && decision.buildVersion === evidence.buildVersion
    && decision.serviceAccountReadbackSha256 === evidence.serviceAccountReadbackSha256
    && decision.cloudConsoleReadbackSha256 === evidence.cloudConsoleReadbackSha256
    && decision.configurationSha256 === evidence.configurationSha256
    && decision.projectId === service.projectId && decision.webAppId === service.webAppId
    && decision.apiKeyResourceId === consoleRead.apiKeyResourceId && decisionUntil > decidedAt
    && decisionUntil - decidedAt <= maximumAgeMs && decisionUntil <= serviceUntil
    && decisionUntil <= consoleUntil, 'google_web_current_decision');
  const nowMs = timestamp(new Date(now).toISOString(), 'google_web_current_clock');
  check(nowMs >= serviceAt && nowMs < serviceUntil && nowMs >= consoleAt && nowMs < consoleUntil
    && nowMs >= decidedAt && nowMs < decisionUntil, 'google_web_current_expired');
  const binding = Object.freeze({
    profileContractVersion: GOOGLE_WEB_PROFILE_V3,
    config: Object.freeze({ ...evidence.configuration }),
    configDigest: evidence.configurationSha256,
    readinessJson: JSON.stringify(evidence),
    readinessDigest: evidenceDigest,
    decisionJson,
    decisionDigest: evidence.decisionSha256,
    evidenceDigest,
    serviceAccountReadbackSha256: evidence.serviceAccountReadbackSha256,
    cloudConsoleReadbackSha256: evidence.cloudConsoleReadbackSha256,
    validatedAtUtc: new Date(nowMs).toISOString(),
  });
  check(serviceJson.length > 0 && consoleJson.length > 0, 'google_web_current_readback');
  return binding;
}

export function bindGoogleWebCurrentReadback(evidence, evidenceDigest, options = {}) {
  return bindEvidence(evidence, evidenceDigest, options);
}

export function validateGoogleWebCurrentReadbackBinding(binding,
  { freshAt = null, expectedSource, expectedVersion } = {}) {
  exact(binding, bindingKeys, 'google_web_current_binding_shape');
  check(binding.profileContractVersion === GOOGLE_WEB_PROFILE_V3, 'google_web_current_binding_profile');
  let evidence;
  try { evidence = JSON.parse(binding.readinessJson); } catch { throw new Error('google_web_current_json'); }
  const rebound = bindEvidence(evidence, binding.evidenceDigest, {
    now: new Date(binding.validatedAtUtc), expectedSource, expectedVersion,
  });
  check(JSON.stringify(rebound) === JSON.stringify(binding), 'google_web_current_binding_mismatch');
  if (freshAt !== null) {
    check(evidence.schemaVersion === 2, 'google_web_current_service_usage_binding_required');
    bindEvidence(evidence, binding.evidenceDigest, { now: freshAt, expectedSource, expectedVersion });
  }
  return rebound;
}

export function readGoogleWebCurrentReadback(file, evidenceDigest,
  { now = new Date(), expectedSource, expectedVersion } = {}) {
  const bytes = readGoogleWebProtectedBytes(file);
  try {
    check(hashPattern.test(evidenceDigest ?? '') && sha256(bytes) === evidenceDigest,
      'google_web_current_digest');
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const evidence = JSON.parse(text);
    check(JSON.stringify(evidence) === text, 'google_web_current_canonical');
    return bindEvidence(evidence, evidenceDigest, { now, expectedSource, expectedVersion });
  } catch (error) {
    if (/^google_web_current_[a-z_]+$/u.test(error?.message ?? '')) throw error;
    throw new Error('google_web_current_json');
  } finally { bytes.fill(0); }
}
