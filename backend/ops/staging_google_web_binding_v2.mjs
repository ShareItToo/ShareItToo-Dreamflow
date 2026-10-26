// Read-only, dependency-injected v2 binding composer. It deliberately does not
// change the v1 reattestation schema or perform network/Docker work itself.
// Production wiring must supply authenticated bounded readers; the sealed
// observations are validated and the resulting bytes can be persisted by the
// companion CLI only after all checks pass.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const GOOGLE_WEB_BINDING_V2_SOURCE_PATHS = Object.freeze([
  'backend/ops/staging_google_web_binding_v2.mjs',
  'backend/ops/staging_google_web_binding_v2_adapter.mjs',
  'backend/ops/staging_google_web_binding_v2_cli.mjs',
  'backend/ops/staging_google_web_binding_v2_writer.mjs',
  'backend/ops/staging_google_web_reattestation_v2.mjs',
  'backend/ops/staging_google_web_reattestation_v2_cli.mjs',
  'backend/ops/staging_google_web_reattestation_adapter.mjs',
  'backend/ops/staging_google_web_reattestation_cli.mjs',
  'backend/ops/staging_google_web_reattestation.mjs',
  'backend/ops/staging_google_web_reattestation_writer.mjs',
  'backend/ops/staging_google_web_live_adapter.mjs',
  'backend/ops/staging_google_web_read_adapter.mjs',
  'backend/ops/staging_google_web_prerequisites.mjs',
  'tool/staging_web_contract.mjs', 'tool/staging_google_web_current_readback.mjs',
  'tool/staging_google_web_readiness.mjs',
  'tool/staging_listing_ai_web_readiness.mjs', 'tool/staging_apple_web_readiness.mjs',
  'tool/staging_facebook_web_readiness.mjs', 'tool/staging_password_enrollment_web_readiness.mjs',
]);
const PROJECT_ID = 'shareittoo-staging';
const PROJECT_NUMBER = '214007794438';
const WEB_APP_ID = '1:214007794438:web:aefec13f9f030f46eaac87';
const ORIGIN = 'https://staging.shareittoo.com';
const HOST = 'staging.shareittoo.com';
const digestPattern = /^[a-f0-9]{64}$/u;
const commitPattern = /^[a-f0-9]{40}$/u;
const imageIdPattern = /^sha256:[a-f0-9]{64}$/u;
const check = (v) => { if (!v) throw new Error('google_web_binding_v2_denied'); };
const plain = (v) => v !== null && Object.getPrototypeOf(v) === Object.prototype;
const exact = (v, fields) => plain(v) && Object.keys(v).sort().join('|') === [...fields].sort().join('|');
// This hashes source bytes and already-sanitized evidence for integrity; API-key identifiers are omitted from redundant read digests and are bound separately.
// codeql[js/insufficient-password-hash]
const hash = (v) => createHash('sha256').update(v).digest('hex');
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (plain(value)) return Object.fromEntries(Object.keys(value).sort().map((k) => [k, canonical(value[k])]));
  return value;
}
export const googleWebBindingV2Digest = (value) => hash(JSON.stringify(canonical(value)));
function readEvidenceValue(name, value) {
  // API-key identifiers/fingerprints/config digests are independently bound by the exact checks and top-level binding; omit these redundant values from read digests.
  if (!['webApp', 'sdkConfig', 'apiKeyInventory'].includes(name)) return value;
  const keyFields = name === 'sdkConfig' ? new Set(['apiKeyId', 'keyFingerprint', 'configurationSha256']) : new Set(['apiKeyId']);
  return Object.fromEntries(Object.entries(value).filter(([key]) => !keyFields.has(key)));
}

function sourceInventory(repositoryRoot, sourceCommit) {
  const own = fileURLToPath(import.meta.url);
  check(path.resolve(repositoryRoot) === repositoryRoot && fs.realpathSync(repositoryRoot) === repositoryRoot
    && execFileSync('git', ['-C', repositoryRoot, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim() === repositoryRoot
    && execFileSync('git', ['-C', repositoryRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() === sourceCommit);
  return GOOGLE_WEB_BINDING_V2_SOURCE_PATHS.map((locator) => {
    const committed = execFileSync('git', ['-C', repositoryRoot, 'show', `${sourceCommit}:${locator}`]);
    const current = fs.readFileSync(path.join(repositoryRoot, locator));
    check(committed.equals(current));
    if (locator === GOOGLE_WEB_BINDING_V2_SOURCE_PATHS[0]) check(fs.realpathSync(own) === own && fs.readFileSync(own).equals(current));
    return { locator, commit: sourceCommit, sha256: hash(current) };
  });
}

/** Readers are invoked sequentially and each must return {value, sources}.
 * The injected transport must be a fixed allowlist GET-only reader; the caller
 * can use the exact URL list below to construct its network guard. */
export const GOOGLE_WEB_BINDING_V2_READS = Object.freeze([
  'serviceProjectIdentity', 'userAccountIdentity', 'webApp', 'sdkConfig', 'apiKeyInventory', 'runtime', 'providerSnapshot',
]);
export function googleWebBindingV2ReadSources() {
  return Object.freeze([
    `https://cloudresourcemanager.googleapis.com/v1/projects/${PROJECT_ID}`,
    'https://accounts.google.com/.well-known/openid-configuration',
    'https://openidconnect.googleapis.com/v1/userinfo',
    `https://cloudresourcemanager.googleapis.com/v1/projects/${PROJECT_ID}`,
    `https://firebase.googleapis.com/v1beta1/projects/${PROJECT_NUMBER}/webApps/${WEB_APP_ID}`,
    `https://firebase.googleapis.com/v1beta1/projects/${PROJECT_NUMBER}/webApps/${WEB_APP_ID}/config`,
    `https://firebase.googleapis.com/v1beta1/projects/${PROJECT_NUMBER}/webApps?showDeleted=true&pageSize=100`,
    `https://firebase.googleapis.com/v1beta1/projects/${PROJECT_NUMBER}/androidApps?showDeleted=true&pageSize=100`,
    `https://firebase.googleapis.com/v1beta1/projects/${PROJECT_NUMBER}/iosApps?showDeleted=true&pageSize=100`,
    `https://apikeys.googleapis.com/v2/projects/${PROJECT_NUMBER}/locations/global/keys?showDeleted=true&pageSize=100`,
    `https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT_ID}/config`,
    `https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT_ID}/defaultSupportedIdpConfigs/google.com`,
    'docker://shareittoo-staging-api',
  ]);
}
function sourceSet(name, keyName = '') {
  const app = `https://firebase.googleapis.com/v1beta1/projects/${PROJECT_NUMBER}/webApps/${WEB_APP_ID}`;
  const commonProject = `https://cloudresourcemanager.googleapis.com/v1/projects/${PROJECT_ID}`;
  const keyPath = keyName ? `https://apikeys.googleapis.com/v2/${keyName}` : '';
  const sets = {
    serviceProjectIdentity: [commonProject],
    userAccountIdentity: ['https://accounts.google.com/.well-known/openid-configuration', 'https://openidconnect.googleapis.com/v1/userinfo', commonProject],
    webApp: [app], sdkConfig: [app, `${app}/config`],
    apiKeyInventory: [`https://firebase.googleapis.com/v1beta1/projects/${PROJECT_NUMBER}/webApps/${WEB_APP_ID}`,
      `https://apikeys.googleapis.com/v2/projects/${PROJECT_NUMBER}/locations/global/keys?showDeleted=true&pageSize=100`, keyPath, `${keyPath}/keyString`],
    providerSnapshot: [commonProject, `https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT_ID}/config`,
      `https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT_ID}/defaultSupportedIdpConfigs/google.com`,
      `https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT_ID}/defaultSupportedIdpConfigs/facebook.com`,
      `https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT_ID}/defaultSupportedIdpConfigs/apple.com`,
      `https://serviceusage.googleapis.com/v1/projects/${PROJECT_NUMBER}/services/identitytoolkit.googleapis.com`,
      `https://serviceusage.googleapis.com/v1/projects/${PROJECT_NUMBER}/services/securetoken.googleapis.com`,
      `https://firebase.googleapis.com/v1beta1/projects/${PROJECT_NUMBER}/webApps?showDeleted=true&pageSize=100`,
      `https://firebase.googleapis.com/v1beta1/projects/${PROJECT_NUMBER}/androidApps?showDeleted=true&pageSize=100`,
      `https://firebase.googleapis.com/v1beta1/projects/${PROJECT_NUMBER}/iosApps?showDeleted=true&pageSize=100`,
      `https://apikeys.googleapis.com/v2/projects/${PROJECT_NUMBER}/locations/global/keys?showDeleted=true&pageSize=100`,
      `https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT_ID}/defaultSupportedIdpConfigs/facebook.com`,
      `https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT_ID}/defaultSupportedIdpConfigs/apple.com`],
    runtime: ['docker://shareittoo-staging-api'],
  };
  return sets[name];
}
export const googleWebBindingV2ExpectedSources = (name, keyName) => sourceSet(name, keyName);
function normalizedSource(value) {
  if (value.startsWith('docker://')) return value;
  const url = new URL(value); if (url.searchParams.has('pageToken')) url.searchParams.delete('pageToken');
  url.searchParams.sort(); return url.href;
}

export async function collectGoogleWebBindingV2({ readers, repositoryRoot, sourceCommit, runtimeCommit,
  runtimeImageId, runtimeRepoDigest, reviewEvidenceSha256 } = {}) {
  try {
    check(exact(readers, GOOGLE_WEB_BINDING_V2_READS) && GOOGLE_WEB_BINDING_V2_READS.every((k) => typeof readers[k] === 'function'));
    check(commitPattern.test(sourceCommit ?? '') && commitPattern.test(runtimeCommit ?? '')
      && imageIdPattern.test(runtimeImageId ?? '') && /^.+@sha256:[a-f0-9]{64}$/u.test(runtimeRepoDigest ?? '')
      && digestPattern.test(reviewEvidenceSha256 ?? ''));
    const inventory = sourceInventory(repositoryRoot, sourceCommit);
    const observed = {};
    for (const name of GOOGLE_WEB_BINDING_V2_READS) observed[name] = await readers[name]();
    for (const name of GOOGLE_WEB_BINDING_V2_READS) {
      const item = observed[name];
      check(exact(item, ['method', 'value', 'sources']) && item.method === 'GET' && Array.isArray(item.sources));
      const expected = sourceSet(name, observed.apiKeyInventory?.value?.resourceName);
      const expectedUnique = expected?.map(normalizedSource).filter((url, index, values) => values.indexOf(url) === index) ?? [];
      check(expected && item.sources.length >= expectedUnique.length && item.sources.every((url) => typeof url === 'string')
        && new Set(item.sources.map(normalizedSource)).size === expectedUnique.length
        && expectedUnique.every((url) => item.sources.map(normalizedSource).includes(url)));
    }
    const svc = observed.serviceProjectIdentity.value;
    check(exact(svc, ['projectId', 'projectNumber', 'lifecycleState', 'serviceAccountEmailSha256'])
      && svc.projectId === PROJECT_ID && svc.projectNumber === PROJECT_NUMBER && svc.lifecycleState === 'ACTIVE'
      && digestPattern.test(svc.serviceAccountEmailSha256));
    const user = observed.userAccountIdentity.value;
    check(exact(user, ['projectId', 'projectNumber', 'firebaseAccountEmailSha256', 'proofSha256'])
      && user.projectId === PROJECT_ID && user.projectNumber === PROJECT_NUMBER
      && digestPattern.test(user.firebaseAccountEmailSha256) && digestPattern.test(user.proofSha256));
    const app = observed.webApp.value;
    check(exact(app, ['appId', 'projectId', 'state', 'apiKeyId', 'origin']) && app.appId === WEB_APP_ID
      && app.projectId === PROJECT_ID && app.state === 'ACTIVE' && app.origin === ORIGIN
      && /^[a-f0-9-]{36}$/u.test(app.apiKeyId));
    const sdk = observed.sdkConfig.value;
    check(exact(sdk, ['projectId', 'projectNumber', 'appId', 'apiKeyId', 'keyFingerprint', 'configurationSha256', 'origin'])
      && sdk.projectId === PROJECT_ID && sdk.projectNumber === PROJECT_NUMBER && sdk.appId === WEB_APP_ID
      && sdk.apiKeyId === app.apiKeyId && sdk.origin === ORIGIN && digestPattern.test(sdk.keyFingerprint)
      && digestPattern.test(sdk.configurationSha256));
    const key = observed.apiKeyInventory.value;
    check(exact(key, ['complete', 'apiKeyId', 'resourceName', 'keyMatchesSdkConfig', 'restrictionsDigest', 'webCompatible'])
      && key.complete === true && key.apiKeyId === app.apiKeyId && key.keyMatchesSdkConfig === true
      && /^projects\/214007794438\/locations\/global\/keys\/[A-Za-z0-9_-]{1,200}$/u.test(key.resourceName)
      && digestPattern.test(key.restrictionsDigest) && key.webCompatible === true);
    const provider = observed.providerSnapshot.value;
    check(exact(provider, ['complete', 'projectId', 'projectNumber', 'authEnabled', 'googleEnabled', 'facebookEnabled', 'appleEnabled',
      'stagingAuthorized', 'webAppInventoryComplete', 'apiKeyInventoryComplete', 'snapshotSha256', 'configurationSha256'])
      && provider.complete === true && provider.projectId === PROJECT_ID && provider.projectNumber === PROJECT_NUMBER
      && provider.authEnabled === true && provider.googleEnabled === true && provider.facebookEnabled === false
      && provider.appleEnabled === false && provider.stagingAuthorized === true && provider.webAppInventoryComplete === true
      && provider.apiKeyInventoryComplete === true && digestPattern.test(provider.snapshotSha256)
      && digestPattern.test(provider.configurationSha256) && provider.configurationSha256 === sdk.configurationSha256);
    const runtime = observed.runtime.value;
    check(exact(runtime, ['containerId', 'name', 'running', 'green', 'revision', 'imageId', 'repoDigests', 'runtimeDigest'])
      && digestPattern.test(runtime.containerId) && runtime.name === '/shareittoo-staging-api' && runtime.running === true
      && runtime.green === true && runtime.revision === runtimeCommit && runtime.imageId === runtimeImageId
      && Array.isArray(runtime.repoDigests) && runtime.repoDigests.includes(runtimeRepoDigest) && digestPattern.test(runtime.runtimeDigest));
    const binding = { kind: 'sit-google-web-reattestation-binding', schemaVersion: 2,
      sourceCommit, sourceInventory: inventory, projectId: PROJECT_ID, projectNumber: PROJECT_NUMBER,
      webAppId: WEB_APP_ID, origin: ORIGIN, serviceAccountEmailSha256: svc.serviceAccountEmailSha256,
      firebaseAccountEmailSha256: user.firebaseAccountEmailSha256, firebaseUserIdentityProofSha256: user.proofSha256,
      apiKey: { apiKeyId: key.apiKeyId, keyFingerprint: sdk.keyFingerprint, restrictionsDigest: key.restrictionsDigest },
      apiKeyResourceName: key.resourceName, expectedSnapshotSha256: provider.snapshotSha256,
      configurationSha256: provider.configurationSha256, reviewEvidenceSha256,
      runtimeContainerId: runtime.containerId, runtimeCommit, runtimeImageId, runtimeRepoDigest,
      readEvidence: Object.fromEntries(GOOGLE_WEB_BINDING_V2_READS.map((name) => [name,
        googleWebBindingV2Digest({ ...observed[name], value: readEvidenceValue(name, observed[name].value) })])) };
    const bytes = Buffer.from(`${JSON.stringify(canonical(binding))}\n`, 'utf8');
    return { binding, bytes, sha256: hash(bytes) };
  } catch { throw new Error('google_web_binding_v2_denied'); }
}
