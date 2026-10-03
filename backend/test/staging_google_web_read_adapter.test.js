import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { createStagingGoogleWebReadAdapter as create } from '../ops/staging_google_web_read_adapter.mjs';

// Independent deterministic oracle for synthetic public-key/config fingerprints,
// not a password verifier; intentionally byte-compatible with the read contract.
const sha = (v) => createHash('sha256').update(v).digest('hex');
const canonical = (v) => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).sort().map((key) => [key, canonical(v[key])])) : v;
const digest = (v) => sha(JSON.stringify(canonical(v)));
function fixture() {
  const projectId = 'synthetic-fixture'; const projectNumber = '123456789012';
  const apiKeyId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const publicKey = ['AI', 'za', 'x'.repeat(35)].join('');
  const restrictions = { browserKeyRestrictions: { allowedReferrers: ['https://synthetic.example.invalid/*'] },
    apiTargets: [{ service: 'identitytoolkit.googleapis.com' }] };
  const key = { name: `projects/${projectNumber}/locations/global/keys/synthetic-resource-id`, uid: apiKeyId,
    displayName: 'synthetic', restrictions, etag: 'synthetic-etag', annotations: { purpose: 'synthetic' } };
  // appId is opaque per the official schema, unlike the runner's narrower policy.
  const appId = 'synthetic:opaque:web-app';
  const app = { name: `projects/${projectId}/webApps/${appId}`, appId, projectId, apiKeyId, state: 'ACTIVE', etag: 'synthetic-app-etag' };
  const deleted = { ...app, name: `projects/${projectId}/webApps/deleted-app`, appId: 'deleted-app', state: 'DELETED' };
  const sdk = { projectId, projectNumber, messagingSenderId: projectNumber, appId, apiKey: publicKey,
    authDomain: `${projectId}.firebaseapp.com`, measurementId: 'synthetic-measurement', storageBucket: 'synthetic-bucket' };
  const config = { name: `projects/${projectId}/config`, authorizedDomains: ['localhost', 'synthetic.example.invalid'],
    notification: { sendEmail: { smtp: { password: ['synthetic', 'only'].join('-') } } },
    client: { apiKey: publicKey }, signIn: { email: { enabled: true } } };
  const calls = [];
  const webResource = `/v1beta1/projects/${projectNumber}/webApps`;
  const keyResource = `/v2/projects/${projectNumber}/locations/global/keys`;
  const responses = new Map([
    [webResource, { apps: [app], nextPageToken: 'synthetic-page' }],
    [`${webResource}?synthetic-page`, { apps: [deleted] }],
    [`${webResource}/${encodeURIComponent(appId)}`, app],
    [`${webResource}/${encodeURIComponent(appId)}/config`, sdk],
    [`/admin/v2/projects/${projectId}/config`, config],
    [keyResource, { keys: [key] }], [`/v2/${key.name}`, key], [`/v2/${key.name}/keyString`, { keyString: publicKey }],
  ]);
  for (const serviceName of ['identitytoolkit.googleapis.com', 'securetoken.googleapis.com']) {
    const name = `projects/${projectNumber}/services/${serviceName}`;
    responses.set(`/v1/${name}`, { name, parent: `projects/${projectNumber}`, state: 'ENABLED',
      config: { name: serviceName, title: 'Synthetic service', apis: [{ name: 'synthetic.Api', methods: [{ name: 'SyntheticMethod' }] }],
        documentation: { summary: 'synthetic private detail' }, quota: { limits: [{ name: 'synthetic-limit', defaultLimit: '100' }] },
        authentication: { rules: [{ selector: 'synthetic.Selector' }] }, usage: { rules: [] },
        endpoints: [{ name: serviceName }], monitoredResources: [{ type: 'synthetic_type' }], monitoring: { consumerDestinations: [] } } });
  }
  const transport = async (request) => {
    calls.push(request);
    assert.equal(request.method, 'GET'); assert.ok(request.signal instanceof AbortSignal);
    const resource = request.resource + (request.query.pageToken ? `?${request.query.pageToken}` : '');
    assert.ok(responses.has(resource), 'only exact fixture resources may be requested');
    return structuredClone(responses.get(resource));
  };
  const binding = { projectId, projectNumber,
    apiKey: { projectId, apiKeyId, keyFingerprint: sha(publicKey), restrictionsDigest: digest(restrictions) } };
  const adapter = create({ ...binding, transport });
  return { adapter, binding, transport, responses, calls, app, deleted, sdk, key, config, publicKey, webResource, keyResource,
    request: { projectId, appId } };
}

test('only six read methods exist, no default transport, no execution side effects or mutation entrypoint', () => {
  const f = fixture(); assert.equal(f.calls.length, 0);
  assert.deepEqual(Object.keys(f.adapter).sort(), ['readApiKeyInventory', 'readProjectConfig', 'readRequiredAuthServices', 'readSdkConfig', 'readWebApp', 'readWebAppsInventory']);
  assert.equal(Object.isFrozen(f.adapter), true);
  assert.throws(() => create(f.binding), { message: 'read_binding_invalid' });
  const source = fs.readFileSync(new URL('../ops/staging_google_web_read_adapter.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\b(?:fetch|console|process)\s*[.(]|node:(?:fs|https?|net|child_process)|\b(?:POST|PATCH|DELETE)\b/u);
});
test('two exact services.get reads prove separate necessary conditions, never key compatibility or sufficiency', async () => {
  const f = fixture(); const result = await f.adapter.readRequiredAuthServices();
  assert.deepEqual(result, { projectNumber: f.binding.projectNumber,
    services: ['identitytoolkit.googleapis.com', 'securetoken.googleapis.com'].map((serviceName) => ({ serviceName, state: 'ENABLED',
      configDigest: digest(f.responses.get(`/v1/projects/${f.binding.projectNumber}/services/${serviceName}`).config) })),
    scope: 'auth-service-enablement-only', keyCompatibility: 'not_assessed' });
  assert.equal(Object.hasOwn(result, 'webCompatible'), false);
  assert.deepEqual(f.calls.map(({ method, service, resource, query }) => ({ method, service, resource, query })),
    result.services.map(({ serviceName }) => ({ method: 'GET', service: 'serviceusage',
      resource: `/v1/projects/${f.binding.projectNumber}/services/${serviceName}`, query: {} })));
  assert.equal(JSON.stringify(result).includes('synthetic private detail'), false);
  assert.equal((await f.adapter.readApiKeyInventory()).apiKey.webCompatible, false);
});
test('documented nested service config details are digest-bound, with order-independent objects and no raw output', async () => {
  const f = fixture(); const before = await f.adapter.readRequiredAuthServices();
  const value = f.responses.get(`/v1/projects/${f.binding.projectNumber}/services/securetoken.googleapis.com`);
  value.config = Object.fromEntries(Object.entries(value.config).reverse());
  assert.deepEqual(await f.adapter.readRequiredAuthServices(), before);
  value.config.quota.limits[0].defaultLimit = '101';
  const after = await f.adapter.readRequiredAuthServices();
  assert.equal(after.services[0].configDigest, before.services[0].configDigest);
  assert.notEqual(after.services[1].configDigest, before.services[1].configDigest);
  assert.equal(JSON.stringify(after).includes('synthetic-limit'), false);
});
for (const serviceName of ['identitytoolkit.googleapis.com', 'securetoken.googleapis.com']) {
  for (const variant of ['disabled', 'unspecified', 'missingState', 'numericState', 'foreignProject', 'foreignParent', 'foreignService',
    'missingConfig', 'wrongConfigName', 'unknownResponseField', 'unknownConfigField', 'nullConfig', 'arrayConfig', 'invalidArray', 'invalidObject', 'invalidTitle']) {
    test(`services.get rejects ${serviceName}: ${variant}`, async () => {
      const f = fixture(); const value = f.responses.get(`/v1/projects/${f.binding.projectNumber}/services/${serviceName}`);
      if (variant === 'disabled') value.state = 'DISABLED';
      if (variant === 'unspecified') value.state = 'STATE_UNSPECIFIED';
      if (variant === 'missingState') delete value.state;
      if (variant === 'numericState') value.state = 2;
      if (variant === 'foreignProject') value.name = value.name.replace(f.binding.projectNumber, '999999999999');
      if (variant === 'foreignParent') value.parent = 'projects/999999999999';
      if (variant === 'foreignService') value.name = value.name.replace(serviceName, 'foreign.googleapis.com');
      if (variant === 'missingConfig') delete value.config;
      if (variant === 'wrongConfigName') value.config.name = 'foreign.googleapis.com';
      if (variant === 'unknownResponseField') value.extra = 'unexpected';
      if (variant === 'unknownConfigField') value.config.extra = 'unexpected';
      if (variant === 'nullConfig') value.config = null;
      if (variant === 'arrayConfig') value.config = [];
      if (variant === 'invalidArray') value.config.apis = [null];
      if (variant === 'invalidObject') value.config.quota = [];
      if (variant === 'invalidTitle') value.config.title = 42;
      await assert.rejects(f.adapter.readRequiredAuthServices(), (error) => ['service_enablement_invalid', 'service_config_invalid'].includes(error.message));
      assert.equal(f.calls.length, serviceName === 'identitytoolkit.googleapis.com' ? 1 : 2);
    });
  }
}
test('minimal service configs are sufficient for enablement only, not full config or key readiness', async () => {
  const f = fixture();
  for (const serviceName of ['identitytoolkit.googleapis.com', 'securetoken.googleapis.com']) {
    f.responses.get(`/v1/projects/${f.binding.projectNumber}/services/${serviceName}`).config = { name: serviceName };
  }
  assert.equal((await f.adapter.readRequiredAuthServices()).keyCompatibility, 'not_assessed');
});
test('second service transport failure or timeout returns no partial proof and exposes no transport details', async () => {
  const f = fixture();
  for (const timeout of [false, true]) {
    let calls = 0; let lastRequest;
    const adapter = create({ ...f.binding, timeoutMs: 5, transport: async (request) => {
      calls++; lastRequest = request;
      if (calls === 1) return f.transport(request);
      if (timeout) return new Promise(() => {});
      throw Error(`/synthetic/private/transport ${f.publicKey}`);
    } });
    await assert.rejects(adapter.readRequiredAuthServices(), (error) => error.message === 'read_operation_failed'
      && !String(error.stack).includes(f.publicKey) && !String(error.stack).includes('/synthetic/private/transport') && !Object.hasOwn(error, 'cause'));
    assert.equal(calls, 2); assert.equal(lastRequest.signal.aborted, timeout);
  }
});
test('ACTIVE and DELETED pages are exhaustive, ordered and bound; all requests retain showDeleted', async () => {
  const f = fixture(); const result = await f.adapter.readWebAppsInventory();
  assert.deepEqual(result.webApps.map((v) => v.state), ['DELETED', 'ACTIVE']);
  assert.deepEqual(result.webAppsInventory, { showDeleted: true, exhausted: true, nextPageToken: '' });
  assert.deepEqual(f.calls.map((v) => v.query), [{ showDeleted: true, pageSize: 100 }, { showDeleted: true, pageSize: 100, pageToken: 'synthetic-page' }]);
  assert.ok(f.calls.every((v) => v.service === 'firebase' && v.resource === f.webResource));
  assert.equal(JSON.stringify(result).includes('synthetic-page'), false);
});
test('empty pages with a token are followed; absent repeated fields and empty final token are accepted', async () => {
  const f = fixture(); f.responses.set(f.webResource, { nextPageToken: 'synthetic-page' });
  f.responses.set(`${f.webResource}?synthetic-page`, { nextPageToken: '' });
  assert.deepEqual((await f.adapter.readWebAppsInventory()).webApps, []); assert.equal(f.calls.length, 2);
});
for (const variant of ['cycle', 'duplicate', 'foreignProject', 'foreignName', 'state', 'keyUid', 'nullApps', 'unknownField', 'badToken', 'nullToken']) {
  test(`Web app inventory fails closed: ${variant}`, async () => {
    const f = fixture(); const first = f.responses.get(f.webResource);
    if (variant === 'cycle') f.responses.set(`${f.webResource}?synthetic-page`, { nextPageToken: 'synthetic-page' });
    if (variant === 'duplicate') f.responses.set(`${f.webResource}?synthetic-page`, { apps: [f.app] });
    if (variant === 'foreignProject') f.app.projectId = 'foreign-project';
    if (variant === 'foreignName') f.app.name = f.app.name.replace(f.binding.projectId, 'foreign-project');
    if (variant === 'state') f.app.state = 'STATE_UNSPECIFIED';
    if (variant === 'keyUid') f.app.apiKeyId = 'resource-id-is-not-a-uid';
    if (variant === 'nullApps') first.apps = null;
    if (variant === 'unknownField') first.extra = 'unexpected';
    if (variant === 'badToken') first.nextPageToken = 123;
    if (variant === 'nullToken') first.nextPageToken = null;
    await assert.rejects(f.adapter.readWebAppsInventory(), /^(?:Error: )?(?:inventory_|web_app_)/u);
    assert.ok(f.calls.length <= 2);
  });
}
test('bounded pagination and total items fail instead of returning partial inventory', async () => {
  const f = fixture(); let calls = 0;
  const adapter = create({ ...f.binding, transport: async () => ({ nextPageToken: `page-${++calls}` }) });
  await assert.rejects(adapter.readWebAppsInventory(), { message: 'inventory_page_limit' }); assert.equal(calls, 100);
  f.responses.set(f.webResource, { apps: Array.from({ length: 1000 }, (_, i) => ({ ...f.app, appId: `app-${i}`, name: `projects/${f.binding.projectId}/webApps/app-${i}` })) });
  await assert.rejects(f.adapter.readWebAppsInventory(), { message: 'inventory_duplicate_or_limit' });
});
test('independent webApps.get and SDK config have exact runner projections; extra optional SDK fields do not escape', async () => {
  const f = fixture();
  assert.deepEqual(await f.adapter.readWebApp(f.request), { appId: f.app.appId, projectId: f.app.projectId, state: 'ACTIVE', apiKeyId: f.app.apiKeyId });
  const result = await f.adapter.readSdkConfig(f.request);
  assert.deepEqual(Object.keys(result), ['projectId', 'messagingSenderId', 'appId', 'apiKey', 'authDomain']);
  assert.equal(result.apiKey, f.publicKey);
  assert.equal(f.calls.length, 3); assert.ok(f.calls.at(-1).resource.endsWith('/config'));
  assert.equal(f.calls.filter((v) => !v.resource.endsWith('/config')).length, 2);
});
for (const field of ['projectId', 'projectNumber', 'messagingSenderId', 'appId', 'apiKey', 'authDomain', 'unexpected']) {
  test(`SDK config rejects drift: ${field}`, async () => {
    const f = fixture(); f.sdk[field] = 'synthetic-drift';
    await assert.rejects(f.adapter.readSdkConfig(f.request), { message: 'sdk_config_binding_invalid' });
  });
}
test('SDK fails before config fetch for wrong key or deleted app; foreign input makes no transport call', async () => {
  for (const change of [{ apiKeyId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }, { state: 'DELETED' }]) {
    const f = fixture(); Object.assign(f.app, change);
    await assert.rejects(f.adapter.readSdkConfig(f.request), { message: 'sdk_app_key_mismatch' }); assert.equal(f.calls.length, 1);
  }
  const f = fixture(); await assert.rejects(f.adapter.readWebApp({ ...f.request, projectId: 'foreign-project' }), /web_app_request_invalid/);
  assert.equal(f.calls.length, 0);
});
test('project config binds every unrelated field without disclosing raw config or inventing revision/CAS', async () => {
  const f = fixture(); const before = await f.adapter.readProjectConfig();
  assert.deepEqual(Object.keys(before), ['authorizedDomains', 'authConfigDigest']);
  f.config.authorizedDomains.push('additional.example.invalid');
  assert.equal((await f.adapter.readProjectConfig()).authConfigDigest, before.authConfigDigest);
  f.config.newUnknownSetting = { nested: true };
  assert.notEqual((await f.adapter.readProjectConfig()).authConfigDigest, before.authConfigDigest);
  assert.equal(JSON.stringify(before).includes(f.publicKey), false);
  assert.equal(JSON.stringify(before).includes(f.config.notification.sendEmail.smtp.password), false);
  f.config.name = 'projects/foreign-project/config'; await assert.rejects(f.adapter.readProjectConfig(), /project_config_invalid/);
});
test('explicit null and duplicate domains are not silently treated as an empty configuration', async () => {
  for (const value of [null, ['duplicate.invalid', 'duplicate.invalid']]) {
    const f = fixture(); f.config.authorizedDomains = value;
    await assert.rejects(f.adapter.readProjectConfig(), { message: 'project_config_invalid' });
  }
});
test('key UID is distinct from resource ID; list/get/getKeyString bind full inventory and restrictions without compatibility claim', async () => {
  const f = fixture(); const result = await f.adapter.readApiKeyInventory();
  assert.equal(result.apiKey.apiKeyId, f.key.uid); assert.notEqual(f.key.uid, f.key.name.split('/').at(-1));
  assert.equal(result.apiKey.keyFingerprint, sha(f.publicKey));
  assert.equal(result.apiKey.keyFingerprint, 'd5f8bee883f72b92679865bf327e27cb37e5a077eff372a25c3d9ee399bd0adf');
  assert.equal(result.apiKey.restrictionsDigest, digest(f.key.restrictions));
  assert.equal(result.keyInventoryDigest, digest([f.key]));
  assert.equal(result.apiKey.exists, true); assert.equal(result.apiKey.webCompatible, false);
  assert.equal(result.keyCompatibility, 'not_assessed');
  assert.deepEqual(result.keyInventory, { showDeleted: true, exhausted: true, nextPageToken: '' });
  assert.deepEqual(f.calls.map((v) => v.resource), [f.keyResource, `/v2/${f.key.name}`, `/v2/${f.key.name}/keyString`]);
  assert.equal(JSON.stringify(result).includes(f.publicKey), false);
  assert.equal(JSON.stringify(f.calls).includes(f.publicKey), false);
  assert.equal(JSON.stringify(result).includes('allowedReferrers'), false);
});
for (const variant of ['foreignProject', 'duplicateUid', 'duplicateName', 'deleted', 'absent', 'drift', 'restrictions', 'fingerprint', 'rawMetadataKey', 'restrictionUnion', 'unknownRestriction']) {
  test(`key inventory refuses unsafe binding: ${variant}`, async () => {
    const f = fixture(); const keys = f.responses.get(f.keyResource).keys;
    if (variant === 'foreignProject') f.key.name = f.key.name.replace(f.binding.projectNumber, '999999999999');
    if (variant === 'duplicateUid') keys.push({ ...f.key });
    if (variant === 'duplicateName') keys.push({ ...f.key, uid: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' });
    if (variant === 'deleted') f.key.deleteTime = '2026-01-01T00:00:00Z';
    if (variant === 'absent') keys.length = 0;
    if (variant === 'drift') f.responses.set(`/v2/${f.key.name}`, { ...f.key, etag: 'changed' });
    if (variant === 'restrictions') f.key.restrictions.browserKeyRestrictions.allowedReferrers.push('https://foreign.example.invalid/*');
    if (variant === 'fingerprint') f.responses.set(`/v2/${f.key.name}/keyString`, { keyString: 'synthetic-wrong-key' });
    if (variant === 'rawMetadataKey') f.key.keyString = f.publicKey;
    if (variant === 'restrictionUnion') f.key.restrictions.serverKeyRestrictions = { allowedIps: ['192.0.2.1'] };
    if (variant === 'unknownRestriction') f.key.restrictions.futurePolicy = true;
    await assert.rejects(f.adapter.readApiKeyInventory()); assert.ok(f.calls.length <= 3);
  });
}
test('key inventory paginates deleted entries too; unrelated key metadata changes its digest', async () => {
  const f = fixture(); const other = { ...f.key, uid: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    name: f.key.name.replace('synthetic-resource-id', 'other-resource'), deleteTime: '2026-01-01T00:00:00Z' };
  f.responses.get(f.keyResource).nextPageToken = 'next-key-page';
  f.responses.set(`${f.keyResource}?next-key-page`, { keys: [other] });
  const before = await f.adapter.readApiKeyInventory(); other.annotations = { purpose: 'changed' };
  assert.notEqual((await f.adapter.readApiKeyInventory()).keyInventoryDigest, before.keyInventoryDigest);
  assert.ok(f.calls.filter((v) => v.resource === f.keyResource).every((v) => v.query.showDeleted === true));
});
test('transport errors, malformed objects and timeout are sanitized without retry or leaking key/path/error details', async () => {
  const f = fixture();
  for (const response of [() => { throw Error(f.publicKey); }, () => { throw { code: 'key_metadata_invalid', message: f.publicKey }; },
    () => ({ get apps() { throw Error('/private/synthetic'); } }), () => ({ apps: [new Date()] })]) {
    let calls = 0; const adapter = create({ ...f.binding, transport: () => { calls++; return response(); } });
    await assert.rejects(adapter.readWebAppsInventory(), (error) => ['read_operation_failed', 'read_response_invalid'].includes(error.message)
      && !String(error.stack).includes(f.publicKey) && !Object.hasOwn(error, 'cause'));
    assert.equal(calls, 1);
  }
  let request; const adapter = create({ ...f.binding, timeoutMs: 5, transport: (value) => { request = value; return new Promise(() => {}); } });
  await assert.rejects(adapter.readWebAppsInventory(), { message: 'read_operation_failed' }); assert.equal(request.signal.aborted, true);
});
