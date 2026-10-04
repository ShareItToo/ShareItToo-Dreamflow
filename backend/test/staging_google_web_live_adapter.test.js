import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { createStagingGoogleWebLiveAdapter as create, parseFirebaseUserCredential,
  parseServiceCredential, readPrivateInput, runStagingGoogleWebLiveCli,
  stagingGoogleWebLiveCliErrorCode } from '../ops/staging_google_web_live_adapter.mjs';
import { prerequisiteSnapshotDigest } from '../ops/staging_google_web_prerequisites.mjs';

const sha = (value) => createHash('sha256').update(value).digest('hex');
const canonical = (value) => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value;
const digest = (value) => sha(JSON.stringify(canonical(value)));
const response = (body, status = 200) => ({ status, text: async () => JSON.stringify(body) });
const nowValue = Date.parse('2026-10-04T12:00:00.000Z');
const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
const ed = generateKeyPairSync('ed25519');
const privatePem = rsa.privateKey.export({ type: 'pkcs8', format: 'pem' });
const publicPem = ed.publicKey.export({ type: 'spki', format: 'pem' });
const publicFingerprint = sha(ed.publicKey.export({ type: 'spki', format: 'der' }));

function fixture() {
  const projectId = 'synthetic-project'; const projectNumber = '123456789012';
  const apiKeyId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const publicKey = ['AI', 'za', 'x'.repeat(35)].join('');
  const restrictions = { browserKeyRestrictions: { allowedReferrers: ['https://staging.shareittoo.com/*'] },
    apiTargets: [{ service: 'identitytoolkit.googleapis.com' }, { service: 'securetoken.googleapis.com' }] };
  const key = { name: `projects/${projectNumber}/locations/global/keys/synthetic-key`, uid: apiKeyId,
    displayName: 'Staging Web', restrictions, etag: 'key-etag' };
  const config = { name: `projects/${projectNumber}/config`, authorizedDomains: [`${projectId}.firebaseapp.com`, 'localhost'],
    signIn: { email: { enabled: true } }, updateTime: '2026-10-04T11:00:00Z' };
  const binding = { projectId, projectNumber, origin: 'https://staging.shareittoo.com',
    displayName: 'ShareItToo Staging Web', baselineDigest: 'b'.repeat(64),
    firebaseAccountEmailSha256: sha('contact@shareittoo.com'),
    domainLeaseVerifier: { algorithm: 'Ed25519', publicKeySha256: publicFingerprint },
    apiKey: { projectId, apiKeyId, keyFingerprint: sha(publicKey), restrictionsDigest: digest(restrictions) } };
  const serviceCredentialBytes = JSON.stringify({ type: 'service_account', project_id: projectId,
    client_email: `synthetic@${projectId}.iam.gserviceaccount.com`, private_key: privatePem,
    token_uri: 'https://oauth2.googleapis.com/token' });
  const serviceCredential = parseServiceCredential(serviceCredentialBytes, projectId);
  const userCredential = { authorization: 'Bearer private-user-token' };
  const calls = [];
  let operationReads = 0;
  const fetchImpl = async (urlValue, init) => {
    const url = new URL(urlValue); calls.push({ url: url.toString(), method: init.method, headers: init.headers, body: init.body });
    if (url.origin === 'https://oauth2.googleapis.com') return response({ access_token: 'private-service-token', expires_in: 3600, token_type: 'Bearer' });
    const pathname = url.pathname;
    if (init.method === 'GET' && url.origin === 'https://cloudresourcemanager.googleapis.com'
      && pathname === `/v1/projects/${projectId}`) return response({ projectId, projectNumber, lifecycleState: 'ACTIVE' });
    if (init.method === 'GET' && pathname.endsWith('/services/identitytoolkit.googleapis.com')) return response({
      name: `projects/${projectNumber}/services/identitytoolkit.googleapis.com`, parent: `projects/${projectNumber}`,
      state: 'ENABLED', config: { name: 'identitytoolkit.googleapis.com' } });
    if (init.method === 'GET' && pathname.endsWith('/services/securetoken.googleapis.com')) return response({
      name: `projects/${projectNumber}/services/securetoken.googleapis.com`, parent: `projects/${projectNumber}`,
      state: 'ENABLED', config: { name: 'securetoken.googleapis.com' } });
    if (init.method === 'GET' && pathname.endsWith(`/projects/${projectNumber}/webApps`)) return response({ apps: [] });
    if (init.method === 'GET' && pathname.endsWith(`/projects/${projectNumber}/androidApps`)) return response({ apps: [{ appId: 'android-app', state: 'ACTIVE' }] });
    if (init.method === 'GET' && pathname.endsWith(`/projects/${projectNumber}/iosApps`)) return response({ apps: [{ appId: 'ios-app', state: 'ACTIVE' }] });
    if (init.method === 'GET' && pathname.endsWith(`/projects/${projectNumber}/locations/global/keys`)) return response({ keys: [key] });
    if (init.method === 'GET' && pathname.endsWith(`/v2/${key.name}`)) return response(key);
    if (init.method === 'GET' && pathname.endsWith(`/v2/${key.name}/keyString`)) return response({ keyString: publicKey });
    if (init.method === 'GET' && pathname.endsWith(`/projects/${projectId}/config`)) return response(config);
    if (init.method === 'GET' && pathname.endsWith(`/projects/${projectId}/defaultSupportedIdpConfigs/google.com`)) return response({
      name: `projects/${projectNumber}/defaultSupportedIdpConfigs/google.com`, enabled: true, clientId: 'private-client-id' });
    if (init.method === 'POST' && pathname.endsWith(`/projects/${projectId}/webApps`)) return response({ name: 'operations/synthetic-create' });
    if (init.method === 'GET' && pathname.endsWith('/operations/synthetic-create')) {
      operationReads++;
      return operationReads < 2 ? response({ name: 'operations/synthetic-create' }) : response({ name: 'operations/synthetic-create', done: true,
        response: { appId: `1:${projectNumber}:web:${'a'.repeat(32)}`, projectId } });
    }
    if (init.method === 'PATCH' && pathname.endsWith(`/projects/${projectId}/config`)) return response({ ...config,
      authorizedDomains: JSON.parse(init.body).authorizedDomains });
    return response({ error: 'unmapped fixture request' }, 404);
  };
  const runtimeReader = () => ({ backendProjectId: projectId, authEnabled: true, emulatorEnabled: false,
    runtimeDigest: 'd'.repeat(64) });
  const makeLease = (revision) => {
    const unsigned = { schemaVersion: 1, kind: 'sit-google-web-domain-all-writer-exclusion', projectId,
      baselineRevision: revision, baselineDigest: binding.baselineDigest, host: 'staging.shareittoo.com',
      operation: 'authorizedDomains.append', leaseId: 'synthetic-lease', issuedAt: '2026-10-04T11:59:00.000Z',
      expiresAt: '2026-10-04T12:04:00.000Z', allWritersExcluded: true };
    return JSON.stringify({ ...unsigned,
      signature: sign(null, Buffer.from(JSON.stringify(canonical(unsigned))), ed.privateKey).toString('base64url') });
  };
  const adapter = (extra = {}) => create({ binding, serviceCredential, userCredential, fetchImpl, runtimeReader,
    now: () => nowValue, delay: async () => {}, operationPollDelayMs: 0, ...extra });
  return { adapter, binding, serviceCredential, serviceCredentialBytes, userCredential, fetchImpl, runtimeReader,
    calls, config, key, publicKey, makeLease };
}

test('private input accepts only owner-only absolute files or explicitly inherited regular descriptors', (t) => {
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sit-live-adapter-')));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.chmodSync(directory, 0o700); const file = path.join(directory, 'credential.json');
  fs.writeFileSync(file, '{"synthetic":true}', { mode: 0o600 });
  assert.equal(readPrivateInput({ file }), '{"synthetic":true}');
  const fd = fs.openSync(file, 'r'); t.after(() => fs.closeSync(fd));
  assert.equal(readPrivateInput({ fd }), '{"synthetic":true}');
  assert.throws(() => readPrivateInput({ file, fd }), { message: 'private_input_invalid' });
  fs.chmodSync(file, 0o640);
  assert.throws(() => readPrivateInput({ file }), { message: 'private_input_invalid' });
  assert.equal(readPrivateInput({ fd }), '{"synthetic":true}');
});

test('Firebase user credential ignores path-keyed activeAccounts and selects the one hash-bound global/additional account', () => {
  const source = { activeAccounts: { '/Users/operator/projects/shareittoo': 'other@example.invalid' },
    user: { email: 'other@example.invalid' }, tokens: { access_token: 'other-private-token', expires_at: nowValue + 600_000 },
    additionalAccounts: [{ user: { email: ' Contact@ShareItToo.com ' },
      tokens: { access_token: 'private-access-token', expires_at: nowValue + 600_000 } }] };
  const value = parseFirebaseUserCredential(JSON.stringify(source), sha('contact@shareittoo.com'), () => nowValue);
  assert.deepEqual(value, { authorization: 'Bearer private-access-token' });
  assert.equal(JSON.stringify(value).includes('contact@shareittoo.com'), false);
  source.additionalAccounts[0].tokens.expires_at = nowValue;
  assert.throws(() => parseFirebaseUserCredential(JSON.stringify(source), sha('contact@shareittoo.com'), () => nowValue),
    (error) => error.message === 'user_access_token_expired' && !error.stack.includes('private-access-token'));
});

test('Firebase user inventory rejects zero, duplicate and malformed accounts without exposing emails', () => {
  const expected = sha('contact@shareittoo.com');
  for (const source of [
    { additionalAccounts: [] },
    { user: { email: 'contact@shareittoo.com' }, tokens: {}, additionalAccounts: [
      { user: { email: ' CONTACT@shareittoo.com ' }, tokens: {} },
    ] },
    { additionalAccounts: [{ user: { email: 'malformed' }, tokens: {} }] },
  ]) {
    assert.throws(() => parseFirebaseUserCredential(JSON.stringify(source), expected, () => nowValue),
      (error) => !error.stack.includes('contact@shareittoo.com'));
  }
});

test('snapshot independently reads services, exhaustive app inventories, exact key, provider, config and runtime', async () => {
  const f = fixture(); const snapshot = await f.adapter().readSnapshot();
  assert.equal(snapshot.complete, true); assert.equal(snapshot.googleEnabled, true);
  assert.equal(snapshot.apiKey.webCompatible, true); assert.deepEqual(snapshot.webApps, []);
  assert.deepEqual(snapshot.webAppsInventory, { showDeleted: true, exhausted: true, nextPageToken: '' });
  assert.equal(snapshot.revision, digest(f.config)); assert.equal(snapshot.runtimeDigest, 'd'.repeat(64));
  assert.equal(snapshot.otherAppsDigest.length, 64); assert.equal(snapshot.providerConfigDigest.length, 64);
  assert.equal(f.calls.filter((call) => call.url.startsWith('https://oauth2.googleapis.com/')).length, 1);
  const reads = f.calls.filter((call) => call.method === 'GET');
  assert.equal(reads[0].url, `https://cloudresourcemanager.googleapis.com/v1/projects/${f.binding.projectId}`);
  assert.equal(reads[1].url, `https://identitytoolkit.googleapis.com/admin/v2/projects/${f.binding.projectId}/config`);
  assert.equal(reads.filter((call) => call.url.startsWith('https://cloudresourcemanager.googleapis.com/')).length, 1);
  for (const kind of ['webApps', 'androidApps', 'iosApps']) {
    const call = f.calls.find((item) => new URL(item.url).pathname.endsWith(kind));
    assert.equal(new URL(call.url).searchParams.get('showDeleted'), 'true');
  }
  assert.equal(JSON.stringify(snapshot).includes('private'), false);
});

for (const variant of ['foreignProject', 'foreignNumber', 'missingNumber', 'malformedNumber']) {
  test(`snapshot fails before provider and numeric inventory reads for Resource Manager ${variant}`, async () => {
    const f = fixture(); const visited = [];
    const adapter = f.adapter({ fetchImpl: async (url, init) => {
      const parsed = new URL(url); visited.push(parsed.origin);
      if (parsed.origin === 'https://cloudresourcemanager.googleapis.com') {
        const project = { projectId: f.binding.projectId, projectNumber: f.binding.projectNumber, lifecycleState: 'ACTIVE' };
        if (variant === 'foreignProject') project.projectId = 'foreign-project';
        if (variant === 'foreignNumber') project.projectNumber = '999999999999';
        if (variant === 'missingNumber') delete project.projectNumber;
        if (variant === 'malformedNumber') project.projectNumber = '12345678901x';
        return response(project);
      }
      return f.fetchImpl(url, init);
    } });
    await assert.rejects(adapter.readSnapshot(), { message: 'live_adapter_operation_failed' });
    assert.deepEqual(visited, ['https://oauth2.googleapis.com', 'https://cloudresourcemanager.googleapis.com']);
  });
}

for (const target of ['provider', 'rawConfig']) {
  for (const number of ['synthetic-project', '999999999999', '12345678901x', undefined]) {
    test(`snapshot rejects ${target} resource not using the verified numeric project: ${number}`, async () => {
      const f = fixture(); let configReads = 0;
      const adapter = f.adapter({ fetchImpl: async (url, init) => {
        const parsed = new URL(url);
        const isConfig = parsed.origin === 'https://identitytoolkit.googleapis.com' && parsed.pathname.endsWith('/config');
        if (isConfig) configReads++;
        if ((target === 'provider' && parsed.pathname.endsWith('/defaultSupportedIdpConfigs/google.com'))
          || (target === 'rawConfig' && isConfig && configReads === 2)) {
          const suffix = target === 'provider' ? 'defaultSupportedIdpConfigs/google.com' : 'config';
          return response({ ...(target === 'provider' ? { enabled: true } : f.config),
            name: number === undefined ? undefined : `projects/${number}/${suffix}` });
        }
        return f.fetchImpl(url, init);
      } });
      await assert.rejects(adapter.readSnapshot(), { message: target === 'provider' ? 'google_provider_not_ready' : 'auth_config_invalid' });
      assert.equal(f.calls.some((call) => call.method === 'PATCH' || call.url.includes('/webApps') && call.method === 'POST'), false);
    });
  }
}

test('create uses the user credential once, exact displayName/apiKeyId, and never retries an unknown outcome', async () => {
  const f = fixture(); const adapter = f.adapter();
  assert.deepEqual(await adapter.createWebApp({ projectId: f.binding.projectId, apiKeyId: f.binding.apiKey.apiKeyId,
    displayName: 'ShareItToo Staging Web' }), { name: 'operations/synthetic-create' });
  const createCall = f.calls.find((call) => call.method === 'POST' && call.url.includes('/webApps'));
  assert.equal(createCall.headers.authorization, f.userCredential.authorization);
  assert.deepEqual(JSON.parse(createCall.body), { displayName: 'ShareItToo Staging Web', apiKeyId: f.binding.apiKey.apiKeyId });
  let attempts = 0; const privateValue = 'private-user-token';
  const broken = f.adapter({ fetchImpl: async (url, init) => {
    if (new URL(url).origin === 'https://oauth2.googleapis.com') return response({ access_token: 'service-token', expires_in: 3600, token_type: 'Bearer' });
    attempts++; throw Error(`${privateValue} /secret/path`);
  } });
  await assert.rejects(broken.createWebApp({ projectId: f.binding.projectId, apiKeyId: f.binding.apiKey.apiKeyId,
    displayName: 'ShareItToo Staging Web' }), (error) => error.message === 'live_transport_failed'
      && !error.stack.includes(privateValue) && !error.stack.includes('/secret/path'));
  assert.equal(attempts, 1);
});

test('operation polling is bounded and read-only; ready response is project-bound', async () => {
  const f = fixture(); const adapter = f.adapter();
  const result = await adapter.readOperation({ name: 'operations/synthetic-create', projectId: f.binding.projectId });
  assert.equal(result.done, true); assert.equal(result.failed, false);
  assert.equal(f.calls.filter((call) => call.url.includes('/operations/synthetic-create')).length, 2);
  const pending = f.adapter({ operationPolls: 2, fetchImpl: async (url) => new URL(url).origin === 'https://oauth2.googleapis.com'
    ? response({ access_token: 'service-token', expires_in: 3600, token_type: 'Bearer' })
    : response({ name: 'operations/synthetic-create' }) });
  assert.deepEqual(await pending.readOperation({ name: 'operations/synthetic-create', projectId: f.binding.projectId }),
    { name: 'operations/synthetic-create', done: false, appId: '', failed: false });
});

test('signed all-writer lease binds project, baseline, revision, expiry, host and exact guarded patch', async () => {
  const f = fixture(); const revision = digest(f.config); const leaseBytes = f.makeLease(revision);
  const adapter = f.adapter({ leaseBytes, leasePublicKeyBytes: publicPem });
  const guard = await adapter.acquireDomainGuard({ projectId: f.binding.projectId, revision });
  assert.equal(guard.kind, 'exclusive'); assert.equal(guard.allWritersExcluded, true);
  await adapter.patchAuthorizedDomains({ projectId: f.binding.projectId, updateMask: 'authorizedDomains',
    authorizedDomains: [...f.config.authorizedDomains, 'staging.shareittoo.com'], guard });
  const patch = f.calls.find((call) => call.method === 'PATCH');
  assert.equal(patch.headers.authorization, 'Bearer private-service-token');
  assert.equal(new URL(patch.url).searchParams.get('updateMask'), 'authorizedDomains');
  const bad = JSON.parse(leaseBytes); bad.baselineRevision = 'foreign-revision';
  await assert.rejects(f.adapter({ leaseBytes: JSON.stringify(bad), leasePublicKeyBytes: publicPem })
    .acquireDomainGuard({ projectId: f.binding.projectId, revision }), /domain_lease_invalid|domain_lease_signature_invalid/u);
});

test('adapter exposes exact runner methods and neither credentials nor signing capability', () => {
  const keys = Object.keys(fixture().adapter()).sort();
  assert.deepEqual(keys, ['acquireDomainGuard', 'createWebApp', 'patchAuthorizedDomains', 'readOperation',
    'readSdkConfig', 'readSnapshot', 'readWebApp']);
});

test('CLI defaults to provider-read-only preflight and does not require user credential or lease', async (t) => {
  const f = fixture(); const snapshot = await f.adapter().readSnapshot();
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sit-live-cli-')));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true })); fs.chmodSync(directory, 0o700);
  const bindingFile = path.join(directory, 'binding.json'); const serviceFile = path.join(directory, 'service.json');
  const journalFile = path.join(directory, 'journal.jsonl'); const configFile = path.join(directory, 'config.json');
  const root = path.resolve(new URL('../../', import.meta.url).pathname);
  const sourceCommit = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const runnerDigest = sha(fs.readFileSync(new URL('../ops/staging_google_web_prerequisites.mjs', import.meta.url)));
  const binding = { ...f.binding, schemaVersion: 3, sourceCommit, runnerDigest,
    baselineDigest: prerequisiteSnapshotDigest(snapshot) };
  binding.gate = { id: 'SIT-GOOGLE-WEB-PREREQ-01', decision: 'pending', sourceCommit, runnerDigest,
    firebaseAccountEmailSha256: binding.firebaseAccountEmailSha256,
    baselineDigest: binding.baselineDigest, evidenceDigest: 'e'.repeat(64), expiresAt: '2026-10-04T12:10:00.000Z' };
  fs.writeFileSync(bindingFile, JSON.stringify(binding), { mode: 0o600 });
  fs.writeFileSync(serviceFile, f.serviceCredentialBytes, { mode: 0o600 });
  f.calls.length = 0;
  const result = await runStagingGoogleWebLiveCli(['--binding', bindingFile, '--journal', journalFile,
    '--config', configFile, '--service-credential-file', serviceFile],
  { fetchImpl: f.fetchImpl, runtimeReader: f.runtimeReader, now: () => nowValue });
  assert.equal(result.status, 'preflight-passed-no-mutation');
  assert.equal(fs.existsSync(journalFile), false); assert.equal(fs.existsSync(configFile), false);
  assert.equal(f.calls.some((call) => call.method === 'PATCH'
    || (call.method === 'POST' && call.url.includes('/webApps'))), false);
});

test('CLI error classification never echoes an untrusted lowercase secret-shaped message', () => {
  const code = stagingGoogleWebLiveCliErrorCode(new Error('private_secret_token'));
  assert.equal(code, 'google_web_prerequisite_failed'); assert.equal(code.includes('private_secret_token'), false);
  let branded;
  try { readPrivateInput({}); } catch (error) { branded = error; }
  assert.equal(stagingGoogleWebLiveCliErrorCode(branded), 'private_input_invalid');
});
