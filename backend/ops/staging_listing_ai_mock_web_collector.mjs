import crypto from 'node:crypto';
import { assertStagingMockListingAiProfile, parseListingAiEnvironment } from './staging_listing_ai_mock_profile.mjs';
import { LISTING_AI_MOCK_DISCLOSURE_TEXT, LISTING_AI_MOCK_DISCLOSURE_VERSION } from '../../tool/staging_listing_ai_mock_web_readiness.mjs';
import { listingAiCapability, readListingAiGatewayConfiguration } from '../src/listing_ai_gateway_config.js';

const ORIGIN = 'https://staging.shareittoo.com';
const CAPABILITY_URL = `${ORIGIN}/api/v1/blue-ocean/listing-drafts/capabilities`;
const MODEL = 'listing-ai-mock-v1';
const fail = () => { throw new Error('staging_listing_ai_mock_web_not_verified'); };
const check = (value) => { if (!value) fail(); };
const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
const hashPattern = /^[a-f0-9]{64}$/u;
const isHash = (value) => typeof value === 'string' && hashPattern.test(value);
const commitPattern = /^[a-f0-9]{40}$/u;
const plain = (value) => value !== null && typeof value === 'object'
  && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const exact = (value, keys) => plain(value)
  && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const iso = (value) => new Date(value).toISOString();

const API_CAPABILITY_KEYS = Object.freeze([
  'available', 'provider', 'mode', 'disclosureVersion', 'disclosureText', 'disclosureHash',
  'policyRevision', 'configRevision', 'budgetScope', 'lifetimeBudgetCents',
  'stagingSmokeBudgetCents', 'stagingSmokeActivationId', 'supportedClientVersion', 'imageLimit',
]);

function projectConfiguration(runtime, environmentEntries) {
  const environment = parseListingAiEnvironment(environmentEntries);
  assertStagingMockListingAiProfile(environment, { deploymentEnvironment: 'test' });
  const gatewayConfiguration = readListingAiGatewayConfiguration(environment, { deploymentEnvironment: 'test' });
  check(runtime.environment === 'staging' && commitPattern.test(runtime.runtimeCommit)
    && /^sha256:[a-f0-9]{64}$/u.test(runtime.imageDigest)
    && gatewayConfiguration.provider === 'mock' && gatewayConfiguration.model === MODEL
    && gatewayConfiguration.budgetCents === 0 && gatewayConfiguration.externalProviderExecutionAllowed === false
    && gatewayConfiguration.automaticPublicationAllowed === false && gatewayConfiguration.productionEligible === false);
  const configuration = { environment: 'staging', provider: gatewayConfiguration.provider, model: gatewayConfiguration.model,
    budgetCents: gatewayConfiguration.budgetCents,
    externalProviderExecutionAllowed: gatewayConfiguration.externalProviderExecutionAllowed,
    automaticPublicationAllowed: gatewayConfiguration.automaticPublicationAllowed,
    productionEligible: gatewayConfiguration.productionEligible,
    runtimeCommit: runtime.runtimeCommit, imageDigest: runtime.imageDigest };
  return { configuration, gatewayConfiguration };
}

function validateCapability(raw, { runtime, configurationSha256, clientVersion,
  gatewayConfiguration, readAtUtc }) {
  const expected = listingAiCapability(gatewayConfiguration);
  check(exact(raw, API_CAPABILITY_KEYS)
    && Object.keys(expected).length === API_CAPABILITY_KEYS.length
    && API_CAPABILITY_KEYS.every((key) => Object.is(raw[key], expected[key]))
    && raw.available === true && raw.provider === 'mock' && raw.mode === 'mock'
    && raw.disclosureVersion === LISTING_AI_MOCK_DISCLOSURE_VERSION
    && raw.disclosureText === LISTING_AI_MOCK_DISCLOSURE_TEXT
    && isHash(raw.disclosureHash) && sha(raw.disclosureText) === raw.disclosureHash
    && raw.configRevision === gatewayConfiguration.configRevision
    && raw.budgetScope === 'lifetime' && raw.lifetimeBudgetCents === 0
    && raw.stagingSmokeBudgetCents === 0 && raw.stagingSmokeActivationId === null
    && raw.supportedClientVersion === clientVersion && raw.imageLimit === 4);
  return { authenticatedReadback: true, available: raw.available, provider: raw.provider, mode: raw.mode,
    model: gatewayConfiguration.model, budgetCents: gatewayConfiguration.budgetCents,
    externalProviderExecutionAllowed: gatewayConfiguration.externalProviderExecutionAllowed,
    automaticPublicationAllowed: gatewayConfiguration.automaticPublicationAllowed,
    productionEligible: gatewayConfiguration.productionEligible, supportedClientVersion: raw.supportedClientVersion,
    runtimeCommit: runtime.runtimeCommit, imageDigest: runtime.imageDigest,
    disclosureVersion: raw.disclosureVersion, disclosureText: raw.disclosureText,
    disclosureHash: raw.disclosureHash, configRevision: raw.configRevision,
    configurationSha256, readAtUtc };
}

/** Read-only collector. Runtime/config readers must be bound to the promoted Staging API container. */
export function createStagingListingAiMockWebCollector({ token, sourceCommit, clientVersion,
  runtimeReader, fetchImpl = globalThis.fetch, now = Date.now } = {}) {
  check(typeof token === 'string' && /^[\x21-\x7e]{16,8192}$/u.test(token)
    && commitPattern.test(sourceCommit ?? '') && /^\d+\.\d+\.\d+\+\d+$/u.test(clientVersion ?? '')
    && typeof runtimeReader === 'function' && typeof fetchImpl === 'function' && typeof now === 'function');

  const readCapability = async (expectedRuntime) => {
    check(exact(expectedRuntime, ['environment', 'runtimeCommit', 'imageDigest', 'environmentEntries'])
      && expectedRuntime.environment === 'staging' && commitPattern.test(expectedRuntime.runtimeCommit)
      && /^sha256:[a-f0-9]{64}$/u.test(expectedRuntime.imageDigest)
      && Array.isArray(expectedRuntime.environmentEntries));
    const runtime = { environment: expectedRuntime.environment, runtimeCommit: expectedRuntime.runtimeCommit,
      imageDigest: expectedRuntime.imageDigest };
    const { configuration, gatewayConfiguration } = projectConfiguration(runtime, expectedRuntime.environmentEntries);
    const configurationSha256 = sha(JSON.stringify(configuration));
    const responseAt = now();
    let response;
    try {
      response = await fetchImpl(CAPABILITY_URL, { method: 'GET', headers: {
        accept: 'application/json', authorization: `Bearer ${token}`,
      }, redirect: 'error', credentials: 'omit', signal: AbortSignal.timeout(8000) });
      check(response?.status === 200 && typeof response.text === 'function');
      const bodyText = await response.text();
      check(Buffer.byteLength(bodyText) <= 16384 && !bodyText.includes(token));
      const body = JSON.parse(bodyText);
      const readAtUtc = new Date(now()).toISOString();
      const capability = validateCapability(body, { runtime, configurationSha256,
        clientVersion, gatewayConfiguration, readAtUtc });
      check(readAtUtc >= new Date(responseAt).toISOString());
      return { configuration, configurationSha256, capability };
    } catch { fail(); }
  };

  return Object.freeze({ async collect() {
    try {
      const collectedAt = now();
      const firstRuntime = runtimeReader();
      check(exact(firstRuntime, ['environment', 'runtimeCommit', 'imageDigest', 'environmentEntries'])
        && Array.isArray(firstRuntime.environmentEntries));
      const result = await readCapability(firstRuntime);
      const finalRuntime = runtimeReader();
      check(exact(finalRuntime, ['environment', 'runtimeCommit', 'imageDigest', 'environmentEntries'])
        && finalRuntime.environment === firstRuntime.environment
        && finalRuntime.runtimeCommit === firstRuntime.runtimeCommit
        && finalRuntime.imageDigest === firstRuntime.imageDigest
        && JSON.stringify(finalRuntime.environmentEntries) === JSON.stringify(firstRuntime.environmentEntries));
      const collectedAtUtc = iso(Math.floor(collectedAt / 1000) * 1000);
      const validUntilUtc = iso(Date.parse(collectedAtUtc) + 15 * 60_000);
      const evidence = { schemaVersion: 1, kind: 'sit-staging-listing-ai-mock-web-readiness',
        evidenceClass: 'authenticated-staging-mock-capability', syntheticFixture: false,
        web: { sourceCommit, clientVersion },
        runtime: { environment: 'staging', runtimeCommit: firstRuntime.runtimeCommit,
          imageDigest: firstRuntime.imageDigest },
        configuration: result.configuration, configurationSha256: result.configurationSha256,
        capability: result.capability, capabilitySha256: sha(JSON.stringify(result.capability)),
        collectedAtUtc, validUntilUtc };
      const json = JSON.stringify(evidence);
      const bytes = Buffer.from(json, 'utf8');
      check(!bytes.includes(Buffer.from(token)) && bytes.length <= 16384
        && now() >= collectedAt && now() < Date.parse(validUntilUtc));
      return Object.freeze({ evidence: Object.freeze(evidence), json, bytes, sha256: sha(bytes) });
    } catch { fail(); }
  } });
}

export const STAGING_LISTING_AI_MOCK_WEB_CAPABILITY_URL = CAPABILITY_URL;
