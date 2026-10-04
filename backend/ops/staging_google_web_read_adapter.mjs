// Read-only response seam; no CLI, network client, credentials, writes or logging.
// Official REST schemas checked 2026-10-03: Firebase Management v1beta1 WebApp,
// WebAppConfig; Identity Platform v2 Config; Google Cloud API Keys v2 Key;
// Service Usage v1 services.get / Service (documented 2025-11-11).
// This is NOT a complete runner adapter: provider/runtime/other-app attestations,
// key compatibility approval and any authorizedDomains CAS/lease remain external.
import { createHash } from 'node:crypto';

const trusted = new WeakSet();
function fail(code) { const error = new Error(code); trusted.add(error); throw error; }
function check(ok, code = 'read_response_invalid') { if (!ok) fail(code); }
const plain = (v) => v !== null && Object.getPrototypeOf(v) === Object.prototype;
const text = (v) => typeof v === 'string' && v.length > 0 && v.length <= 4096;
const hash = (v) => createHash('sha256').update(v).digest('hex');
function canonical(v, depth = 0) {
  check(depth <= 24);
  if (v === null || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v))) return v;
  if (typeof v === 'string') { check(v.length <= 1024 * 1024); return v; }
  if (Array.isArray(v)) { check(v.length <= 10000); return v.map((item) => canonical(item, depth + 1)); }
  check(plain(v));
  return Object.fromEntries(Object.keys(v).sort().map((key) => [key, canonical(v[key], depth + 1)]));
}
const digest = (v) => hash(JSON.stringify(canonical(v)));
const fields = (v, allowed) => plain(v) && Object.keys(v).every((key) => allowed.includes(key));
const strings = (v) => Array.isArray(v) && v.every(text) && new Set(v).size === v.length;
const repeated = (value, key) => Object.hasOwn(value, key) ? value[key] : [];
const uid = (v) => typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(v);

function restrictions(value = {}) {
  const clients = ['browserKeyRestrictions', 'serverKeyRestrictions', 'androidKeyRestrictions', 'iosKeyRestrictions'];
  check(fields(value, ['apiTargets', ...clients]) && clients.filter((key) => Object.hasOwn(value, key)).length <= 1);
  if (Object.hasOwn(value, 'apiTargets')) {
    check(Array.isArray(value.apiTargets));
    for (const target of value.apiTargets) check(fields(target, ['service', 'methods']) && text(target.service)
      && (!Object.hasOwn(target, 'methods') || strings(target.methods)));
  }
  for (const [key, member] of [['browserKeyRestrictions', 'allowedReferrers'], ['serverKeyRestrictions', 'allowedIps'], ['iosKeyRestrictions', 'allowedBundleIds']]) {
    if (Object.hasOwn(value, key)) check(fields(value[key], [member]) && strings(repeated(value[key], member)));
  }
  if (Object.hasOwn(value, 'androidKeyRestrictions')) {
    const client = value.androidKeyRestrictions;
    check(fields(client, ['allowedApplications']) && Array.isArray(repeated(client, 'allowedApplications')));
    for (const app of repeated(client, 'allowedApplications')) check(fields(app, ['sha1Fingerprint', 'packageName']) && text(app.sha1Fingerprint) && text(app.packageName));
  }
  return value;
}

export function createStagingGoogleWebReadAdapter({ projectId, projectNumber, apiKey,
  origin = 'https://staging.shareittoo.com', transport, timeoutMs = 10000 } = {}) {
  check(typeof projectId === 'string' && /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/u.test(projectId)
    && typeof projectNumber === 'string' && /^[0-9]{6,20}$/u.test(projectNumber)
    && fields(apiKey, ['apiKeyId', 'projectId', 'keyFingerprint', 'restrictionsDigest'])
    && apiKey.projectId === projectId && uid(apiKey.apiKeyId)
    && /^[a-f0-9]{64}$/u.test(apiKey.keyFingerprint) && /^[a-f0-9]{64}$/u.test(apiKey.restrictionsDigest)
    && origin === 'https://staging.shareittoo.com'
    && typeof transport === 'function' && Number.isInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 30000, 'read_binding_invalid');
  apiKey = structuredClone(apiKey);
  const safe = (fn) => async (...args) => {
    try { return await fn(...args); }
    catch (error) { if (trusted.has(error)) throw error; throw new Error('read_operation_failed'); }
  };
  async function get(service, resource, query = {}) {
    const controller = new AbortController(); let timer;
    try {
      const raw = await Promise.race([
        Promise.resolve().then(() => transport(Object.freeze({ method: 'GET', service, resource,
          query: Object.freeze(query), signal: controller.signal }))),
        new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('timeout')); }, timeoutMs); }),
      ]);
      const value = canonical(raw);
      check(plain(value) && JSON.stringify(value).length <= 1024 * 1024);
      return value;
    } finally { clearTimeout(timer); }
  }
  function app(value, expected) {
    check(fields(value, ['name', 'appId', 'displayName', 'projectId', 'appUrls', 'webId', 'apiKeyId', 'state', 'expireTime', 'etag'])
      && text(value.appId) && (!expected || value.appId === expected)
      && value.projectId === projectId && value.name === `projects/${projectId}/webApps/${value.appId}`
      && uid(value.apiKeyId) && ['ACTIVE', 'DELETED'].includes(value.state), 'web_app_invalid');
    return { appId: value.appId, projectId, state: value.state, apiKeyId: value.apiKeyId,
      displayName: value.displayName ?? '' };
  }
  function appRequest(value) {
    check(fields(value, ['projectId', 'appId']) && value.projectId === projectId && text(value.appId), 'web_app_request_invalid');
    return `projects/${projectNumber}/webApps/${encodeURIComponent(value.appId)}`;
  }
  async function pages(service, resource, field, normalize, identity) {
    const records = []; const tokens = new Set(); const ids = new Set(); let token = '';
    for (let page = 0; page < 100; page++) {
      const response = await get(service, resource, { showDeleted: true, pageSize: 100, ...(token ? { pageToken: token } : {}) });
      check(fields(response, [field, 'nextPageToken']) && Array.isArray(repeated(response, field)), 'inventory_page_invalid');
      for (const raw of repeated(response, field)) {
        const value = normalize(raw); const id = identity(value);
        check(!ids.has(id) && records.length < 999, 'inventory_duplicate_or_limit'); ids.add(id); records.push(value);
      }
      token = Object.hasOwn(response, 'nextPageToken') ? response.nextPageToken : '';
      check(typeof token === 'string' && token.length <= 4096, 'inventory_token_invalid');
      if (!token) return records.sort((a, b) => identity(a) < identity(b) ? -1 : 1);
      check(!tokens.has(token), 'inventory_token_cycle'); tokens.add(token);
    }
    fail('inventory_page_limit');
  }
  const readWebApp = async (request) => app(await get('firebase', `/v1beta1/${appRequest(request)}`), request.appId);
  function key(value) {
    check(fields(value, ['name', 'uid', 'displayName', 'createTime', 'updateTime', 'deleteTime', 'annotations', 'restrictions', 'etag', 'serviceAccountEmail'])
      && typeof value.name === 'string' && new RegExp(`^projects/${projectNumber}/locations/global/keys/[A-Za-z0-9_-]{1,200}$`, 'u').test(value.name)
      && uid(value.uid) && (!Object.hasOwn(value, 'deleteTime') || typeof value.deleteTime === 'string'), 'key_metadata_invalid');
    restrictions(value.restrictions);
    return value; // Internal only: the public result contains digests, never raw metadata.
  }
  return Object.freeze({
    readRequiredAuthServices: safe(async () => {
      const services = [];
      for (const serviceName of ['identitytoolkit.googleapis.com', 'securetoken.googleapis.com']) {
        const name = `projects/${projectNumber}/services/${serviceName}`;
        const value = await get('serviceusage', `/v1/${name}`);
        check(fields(value, ['name', 'parent', 'config', 'state']) && value.name === name
          && value.parent === `projects/${projectNumber}` && value.state === 'ENABLED', 'service_enablement_invalid');
        const config = value.config;
        check(config !== undefined && fields(config, ['name', 'title', 'apis', 'documentation', 'quota', 'authentication', 'usage', 'endpoints', 'monitoredResources', 'monitoring'])
          && config.name === serviceName && (!Object.hasOwn(config, 'title') || typeof config.title === 'string'), 'service_config_invalid');
        for (const field of ['apis', 'endpoints', 'monitoredResources']) {
          if (Object.hasOwn(config, field)) check(Array.isArray(config[field]) && config[field].every(plain), 'service_config_invalid');
        }
        for (const field of ['documentation', 'quota', 'authentication', 'usage', 'monitoring']) {
          if (Object.hasOwn(config, field)) check(plain(config[field]), 'service_config_invalid');
        }
        // Nested documented configuration is opaque, but every byte-semantic
        // JSON field is digest-bound. This is neither API-key compatibility
        // nor an atomic project snapshot, and it never enables a service.
        services.push({ serviceName, state: 'ENABLED', configDigest: digest(config) });
      }
      return { projectNumber, services, scope: 'auth-service-enablement-only', keyCompatibility: 'not_assessed' };
    }),
    readWebAppsInventory: safe(async () => ({
      webApps: await pages('firebase', `/v1beta1/projects/${projectNumber}/webApps`, 'apps', app, (v) => v.appId),
      webAppsInventory: { showDeleted: true, exhausted: true, nextPageToken: '' },
    })),
    readWebApp: safe(readWebApp),
    readSdkConfig: safe(async (request) => {
      const resource = appRequest(request); const observed = await readWebApp(request);
      check(observed.state === 'ACTIVE' && observed.apiKeyId === apiKey.apiKeyId, 'sdk_app_key_mismatch');
      const value = await get('firebase', `/v1beta1/${resource}/config`);
      check(fields(value, ['projectId', 'appId', 'databaseURL', 'storageBucket', 'locationId', 'apiKey', 'authDomain', 'messagingSenderId', 'measurementId', 'projectNumber'])
        && Object.values(value).every((v) => typeof v === 'string') && value.projectId === projectId
        && value.projectNumber === projectNumber && value.messagingSenderId === projectNumber && value.appId === request.appId
        && value.authDomain === `${projectId}.firebaseapp.com` && text(value.apiKey) && hash(value.apiKey) === apiKey.keyFingerprint, 'sdk_config_binding_invalid');
      return Object.fromEntries(['projectId', 'messagingSenderId', 'appId', 'apiKey', 'authDomain'].map((key) => [key, value[key]]));
    }),
    readProjectConfig: safe(async () => {
      // Identity Toolkit returns numeric resource names. Bind that number to
      // the requested project through Resource Manager before trusting it.
      const project = await get('cloudresourcemanager', `/v1/projects/${projectId}`);
      check(project.projectId === projectId && typeof project.projectNumber === 'string'
        && /^[1-9][0-9]{5,19}$/u.test(project.projectNumber)
        && project.projectNumber === projectNumber && project.lifecycleState === 'ACTIVE',
      'project_identity_invalid');
      const value = await get('identitytoolkit', `/admin/v2/projects/${projectId}/config`);
      check(value.name === `projects/${project.projectNumber}/config` && strings(repeated(value, 'authorizedDomains'))
        && repeated(value, 'authorizedDomains').every((v) => /^[a-z0-9.-]+$/u.test(v)), 'project_config_invalid');
      const { authorizedDomains = [], ...unrelated } = value;
      // Exclude only the intended field; unknown/new fields remain digest-bound.
      // No ETag/revision or CAS proof is invented from this digest.
      return { authorizedDomains, authConfigDigest: digest(unrelated) };
    }),
    readApiKeyInventory: safe(async () => {
      const inventory = await pages('apikeys', `/v2/projects/${projectNumber}/locations/global/keys`, 'keys', key, (v) => v.uid);
      check(new Set(inventory.map((v) => v.name)).size === inventory.length, 'key_name_duplicate');
      const selected = inventory.find((v) => v.uid === apiKey.apiKeyId);
      check(selected && !selected.deleteTime, 'existing_key_missing_or_deleted');
      const observed = key(await get('apikeys', `/v2/${selected.name}`));
      check(digest(observed) === digest(selected), 'key_readback_drift');
      const restrictionsDigest = digest(restrictions(observed.restrictions));
      check(restrictionsDigest === apiKey.restrictionsDigest, 'key_restrictions_mismatch');
      const value = await get('apikeys', `/v2/${selected.name}/keyString`);
      check(fields(value, ['keyString']) && text(value.keyString) && hash(value.keyString) === apiKey.keyFingerprint, 'key_fingerprint_mismatch');
      const allowedReferrers = observed.restrictions?.browserKeyRestrictions?.allowedReferrers ?? [];
      const apiTargets = observed.restrictions?.apiTargets;
      const unrestrictedTargets = new Set((apiTargets ?? [])
        .filter((target) => !Object.hasOwn(target, 'methods')).map((target) => target.service));
      const webCompatible = allowedReferrers.includes(`${origin}/*`)
        && (!apiTargets || ['identitytoolkit.googleapis.com', 'securetoken.googleapis.com']
          .every((service) => unrestrictedTargets.has(service)));
      // keys.lookupKey is intentionally unnecessary: name+UID are independently
      // checked via list/get. Do not send keyString in a query URL.
      return { apiKey: { ...apiKey, exists: true, webCompatible }, keyInventoryDigest: digest(inventory),
        keyCompatibility: webCompatible ? 'verified-browser-origin-and-auth-services' : 'incompatible',
        keyInventory: { showDeleted: true, exhausted: true, nextPageToken: '' } };
    }),
  });
}
