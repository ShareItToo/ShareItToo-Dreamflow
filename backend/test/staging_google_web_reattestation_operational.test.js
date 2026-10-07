import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createGoogleWebReadOnlyFetch, createGoogleWebRuntimeReader,
  createGoogleWebReattestationReaders } from '../ops/staging_google_web_reattestation_adapter.mjs';
import { reserveGoogleWebArtifacts } from '../ops/staging_google_web_reattestation_writer.mjs';
import { runGoogleWebReattestationCli } from '../ops/staging_google_web_reattestation_cli.mjs';
import { googleWebReattestationSourcePaths, googleWebReattestationReadSources,
  googleWebReattestationDigest as digest } from '../ops/staging_google_web_reattestation.mjs';
import { parseServiceCredential } from '../ops/staging_google_web_live_adapter.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const hash = (value) => createHash('sha256').update(value).digest('hex');
const now = Date.parse('2026-10-07T12:00:00.000Z');
const privateKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' });
const response = (value, status = 200) => ({ status, text: async () => JSON.stringify(value) });
function directory(t) {
  const result = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sit-google-operation-')));
  fs.chmodSync(result, 0o700); t.after(() => fs.rmSync(result, { recursive: true, force: true })); return result;
}
function fixture() {
  const projectId = 'synthetic-project'; const projectNumber = '123456789012';
  const webAppId = `1:${projectNumber}:web:${'a'.repeat(32)}`;
  const apiKeyId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const apiKey = ['AI', 'za', 'x'.repeat(35)].join('');
  const restrictions = { browserKeyRestrictions: { allowedReferrers: ['https://staging.shareittoo.com/*'] },
    apiTargets: [{ service: 'identitytoolkit.googleapis.com' }, { service: 'securetoken.googleapis.com' }] };
  const key = { name: `projects/${projectNumber}/locations/global/keys/synthetic-key`, uid: apiKeyId,
    displayName: 'Existing Web', restrictions, etag: 'synthetic-etag' };
  const app = { name: `projects/${projectId}/webApps/${webAppId}`, appId: webAppId, projectId,
    apiKeyId, displayName: 'Existing Web', state: 'ACTIVE' };
  const config = { name: `projects/${projectNumber}/config`, authorizedDomains: ['staging.shareittoo.com', 'localhost'] };
  const sdk = { projectId, appId: webAppId, projectNumber, messagingSenderId: projectNumber, apiKey, authDomain: `${projectId}.firebaseapp.com` };
  const configuration = { projectId, messagingSenderId: projectNumber, appId: webAppId, apiKey,
    authDomain: sdk.authDomain, backendProjectId: projectId, authorizedOrigin: 'https://staging.shareittoo.com' };
  const binding = { schemaVersion: 1, sourceCommit: 'a'.repeat(40), projectId, projectNumber, webAppId,
    firebaseAccountEmailSha256: hash('operator@example.invalid'),
    apiKey: { projectId, apiKeyId, keyFingerprint: hash(apiKey), restrictionsDigest: digest(restrictions) },
    apiKeyResourceName: key.name, runtimeContainerId: 'b'.repeat(64), runtimeCommit: 'c'.repeat(40),
    expectedSnapshotSha256: 'd'.repeat(64), configurationSha256: hash(JSON.stringify(configuration)), reviewEvidenceSha256: 'e'.repeat(64) };
  const serviceBytes = JSON.stringify({ type: 'service_account', project_id: projectId,
    client_email: `synthetic@${projectId}.iam.gserviceaccount.com`, private_key: privateKey, token_uri: 'https://oauth2.googleapis.com/token' });
  const user = { user: { email: 'operator@example.invalid' }, tokens: { access_token: 'synthetic-user-token', expires_at: now + 600000 } };
  const identity = { sub: 'synthetic-subject', email: 'operator@example.invalid', email_verified: true };
  const project = { projectId, projectNumber, lifecycleState: 'ACTIVE' };
  const discovery = { issuer: 'https://accounts.google.com', userinfo_endpoint: 'https://openidconnect.googleapis.com/v1/userinfo' };
  const runtime = { projectId, authEnabled: 'true', emulator: null,
    serviceCredential: { regular: true, symlink: false, nonempty: true }, appCommit: binding.runtimeCommit };
  const calls = []; const commands = [];
  const fetchImpl = async (input, init) => {
    const url = new URL(input); calls.push({ url: url.toString(), ...init }); const pathname = decodeURIComponent(url.pathname);
    if (url.hostname === 'accounts.google.com') return response(discovery);
    if (url.hostname === 'openidconnect.googleapis.com') return response(identity);
    if (url.hostname === 'oauth2.googleapis.com') return response({ access_token: 'synthetic-service-token', token_type: 'Bearer', expires_in: 3600 });
    if (url.hostname === 'cloudresourcemanager.googleapis.com') return response(project);
    if (url.hostname === 'serviceusage.googleapis.com') {
      const service = pathname.split('/').at(-1);
      return response({ name: `projects/${projectNumber}/services/${service}`, parent: `projects/${projectNumber}`, state: 'ENABLED', config: { name: service } });
    }
    if (url.hostname === 'identitytoolkit.googleapis.com') return response(pathname.endsWith('/config') ? config
      : { name: `projects/${projectNumber}/defaultSupportedIdpConfigs/google.com`, enabled: true });
    if (url.hostname === 'apikeys.googleapis.com') return response(pathname.endsWith('/keys') ? { keys: [key] }
      : pathname.endsWith('/keyString') ? { keyString: apiKey } : key);
    if (pathname.endsWith('/webApps')) return response({ apps: [app] });
    if (pathname.endsWith('/androidApps') || pathname.endsWith('/iosApps')) return response({ apps: [] });
    if (pathname.endsWith('/config')) return response(sdk);
    if (pathname.endsWith(webAppId)) return response(app);
    assert.fail(`unexpected synthetic endpoint ${url}`);
  };
  const execute = (command, args, options) => {
    commands.push({ command, args, options });
    if (args[0] === 'inspect') return [binding.runtimeContainerId, '/shareittoo-staging-api', true, 'true', binding.runtimeCommit].map(JSON.stringify).join('|');
    assert.equal(args[0], 'exec'); return JSON.stringify(runtime);
  };
  const readers = (overrides = {}) => createGoogleWebReattestationReaders({ binding,
    serviceCredential: parseServiceCredential(serviceBytes, projectId), userCredentialBytes: JSON.stringify(user), fetchImpl, execute, now: () => now, ...overrides });
  return { binding, calls, commands, user, identity, project, discovery, runtime, config, sdk, key, app,
    fetchImpl, execute, readers, serviceBytes };
}
async function operational(t) {
  const f = fixture(); const repositoryRoot = directory(t); const output = directory(t);
  for (const relative of googleWebReattestationSourcePaths) {
    fs.mkdirSync(path.dirname(path.join(repositoryRoot, relative)), { recursive: true });
    fs.copyFileSync(path.join(root, relative), path.join(repositoryRoot, relative));
  }
  const git = (...args) => execFileSync('git', args, { cwd: repositoryRoot, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  git('init', '-q'); git('add', '.'); git('-c', 'user.name=Synthetic', '-c', 'user.email=synthetic@example.invalid',
    '-c', 'commit.gpgsign=false', 'commit', '-qm', 'disposable source fixture');
  f.binding.sourceCommit = git('rev-parse', 'HEAD');
  f.binding.expectedSnapshotSha256 = digest((await f.readers().readSnapshot()).value);
  f.calls.length = 0; f.commands.length = 0;
  const write = (name, value) => { const file = path.join(output, name); fs.writeFileSync(file, value, { mode: 0o600 }); return file; };
  const bytes = JSON.stringify(f.binding);
  const argv = ['collect', '--binding', write('binding.json', bytes), '--binding-sha256', hash(bytes),
    '--service-credential-file', write('service.json', f.serviceBytes), '--user-credential-file', write('user.json', JSON.stringify(f.user)),
    '--output-dir', output, '--run-id', 'collect'];
  return { ...f, repositoryRoot, output, write, argv,
    dependencies: { repositoryRoot, fetchImpl: f.fetchImpl, execute: f.execute, now: () => now } };
}

test('source register covers the full operational relative-import closure', () => {
  for (const file of googleWebReattestationSourcePaths) {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    for (const match of text.matchAll(/(?:from\s+|import\s*)['"]([.][^'"]+)['"]/gu)) {
      assert.ok(googleWebReattestationSourcePaths.includes(path.posix.normalize(path.posix.join(path.posix.dirname(file), match[1]))), `${file}: ${match[1]}`);
    }
  }
});
test('complete method inventory reads existing state only and independently binds user/project', async () => {
  const f = fixture(); const readers = f.readers();
  assert.deepEqual(Object.keys(readers).sort(), ['readAccountIdentity', 'readSdkConfig', 'readSnapshot', 'readWebApp']);
  const account = await readers.readAccountIdentity(); await readers.readSnapshot();
  assert.deepEqual(f.calls.slice(0, 3).map((call) => call.url), [
    'https://accounts.google.com/.well-known/openid-configuration', 'https://openidconnect.googleapis.com/v1/userinfo',
    `https://cloudresourcemanager.googleapis.com/v1/projects/${f.binding.projectId}`]);
  assert.equal(Object.hasOwn(f.calls[0].headers, 'authorization'), false);
  assert.deepEqual(account.sources.slice(1), f.calls.slice(0, 3).map((call) => call.url));
  const request = { projectId: f.binding.projectId, appId: f.binding.webAppId };
  await readers.readWebApp(request); await readers.readSdkConfig(request);
  assert.equal(account.value.firebaseAccountEmailSha256, f.binding.firebaseAccountEmailSha256);
  assert.equal(JSON.stringify(account).includes('operator@example.invalid'), false);
  const userReads = f.calls.filter((call) => call.headers.authorization === 'Bearer synthetic-user-token');
  assert.deepEqual(userReads.map((call) => new URL(call.url).hostname), ['openidconnect.googleapis.com', 'cloudresourcemanager.googleapis.com']);
  assert.equal(f.calls.filter((call) => call.method !== 'GET').length, 1);
  assert.equal(f.calls.find((call) => call.method !== 'GET').url, 'https://oauth2.googleapis.com/token');
  const actualReads = new Set(f.calls.filter((call) => call.method === 'GET').map((call) => {
    const url = new URL(call.url); url.searchParams.delete('pageSize'); return decodeURIComponent(url.toString());
  }));
  const expectedReads = new Set(Object.keys(readers).flatMap((method) => googleWebReattestationReadSources(method, f.binding))
    .filter((source) => source.startsWith('https://')));
  assert.deepEqual([...actualReads].sort(), [...expectedReads].sort());
  assert.ok(f.calls.every((call) => call.redirect === 'error' && call.credentials === 'omit'));
  assert.deepEqual(f.commands.map((call) => call.args[0]), ['inspect', 'exec', 'inspect']);
  assert.ok(f.commands.every((call) => call.command === 'docker' && call.args[1] === f.binding.runtimeContainerId && call.options.timeout === 10000));
  const probe = f.commands[1].args.at(-1); assert.equal(probe.includes('readFile'), false);
});
for (const [name, mutate] of [
  ['email mismatch', (f) => { f.identity.email = 'other@example.invalid'; }],
  ['unverified email', (f) => { f.identity.email_verified = false; }],
  ['missing email scope', (f) => { delete f.identity.email; }],
  ['missing subject', (f) => { delete f.identity.sub; }],
  ['different project', (f) => { f.project.projectId = 'other-project'; }],
  ['different project number', (f) => { f.project.projectNumber = '999999999999'; }],
  ['inactive project', (f) => { f.project.lifecycleState = 'DELETE_REQUESTED'; }],
  ['untrusted discovery issuer', (f) => { f.discovery.issuer = 'https://evil.invalid'; }],
  ['userinfo endpoint substitution', (f) => { f.discovery.userinfo_endpoint = 'https://evil.invalid'; }],
]) test(`operator proof rejects ${name} without service-account fallback`, async () => {
  const f = fixture(); mutate(f);
  await assert.rejects(f.readers().readAccountIdentity(), { message: 'google_web_read_only_adapter_denied' });
  assert.ok(f.calls.every((call) => !call.url.includes('oauth2.googleapis.com')));
});
test('expired/mismatched local operator is rejected before any transport', () => {
  const f = fixture(); f.user.tokens.expires_at = now;
  assert.throws(() => f.readers()); assert.equal(f.calls.length, 0);
});

for (const method of ['POST', 'PATCH', 'PUT', 'DELETE', 'HEAD', 'OPTIONS', 'CONNECT', 'TRACE', 'get', '']) {
  test(`network guard rejects provider ${method || 'empty'} method before transport`, async () => {
    const f = fixture(); const fetch = createGoogleWebReadOnlyFetch(f.binding, () => assert.fail('forbidden transport'));
    for (const url of [
      `https://firebase.googleapis.com/v1beta1/projects/${f.binding.projectNumber}/webApps`,
      `https://identitytoolkit.googleapis.com/admin/v2/projects/${f.binding.projectId}/config`,
      `https://apikeys.googleapis.com/v2/${f.binding.apiKeyResourceName}`,
    ]) await assert.rejects(fetch(url, { method, headers: { accept: 'application/json', authorization: 'Bearer synthetic' } }), { message: 'google_web_read_only_adapter_denied' });
  });
}
for (const url of [
  'https://evil.invalid/v1/userinfo', 'http://openidconnect.googleapis.com/v1/userinfo',
  'https://user:pass@openidconnect.googleapis.com/v1/userinfo', 'https://openidconnect.googleapis.com:444/v1/userinfo',
  'https://openidconnect.googleapis.com/v1/userinfo?access_token=never', 'https://openidconnect.googleapis.com/v1/userinfo#fragment',
  'https://firebase.googleapis.com/v1beta1/projects/999999999999/webApps?showDeleted=true&pageSize=100',
  'https://firebase.googleapis.com/v1beta1/projects/123456789012/webApps?showDeleted=false&pageSize=100',
  'https://firebase.googleapis.com/v1beta1/projects/123456789012/webApps?showDeleted=true&pageSize=100&updateMask=x',
  'https://firebase.googleapis.com/v1beta1/projects/123456789012/webApps?showDeleted=true&pageSize=100&pageSize=100',
  'https://firebase.googleapis.com/v1beta1/projects/123456789012/webApps?showDeleted=true',
  'https://firebase.googleapis.com/v1beta1/operations/unbound',
  'https://apikeys.googleapis.com/v2/projects/123456789012/locations/global/keys/other/keyString',
]) test(`network guard denies unbound URL ${url}`, async () => {
  await assert.rejects(createGoogleWebReadOnlyFetch(fixture().binding, () => assert.fail('forbidden transport'))(url,
    { method: 'GET', headers: { accept: 'application/json', authorization: 'Bearer synthetic' } }));
});
test('network guard allows bounded pagination and only JWT token exchange; no redirect escape', async () => {
  const calls = []; const fetch = createGoogleWebReadOnlyFetch(fixture().binding, async (...args) => { calls.push(args); return response({}); });
  const url = 'https://firebase.googleapis.com/v1beta1/projects/123456789012/webApps?showDeleted=true&pageSize=100&pageToken=next';
  const headers = { accept: 'application/json', authorization: 'Bearer synthetic' };
  await fetch(url, { method: 'GET', headers, redirect: 'follow', credentials: 'include' });
  assert.equal(calls[0][1].redirect, 'error');
  assert.equal(calls[0][1].credentials, 'omit');
  for (const body of ['grant_type=refresh_token&refresh_token=secret', 'grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=x',
    'grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=a.b.c&extra=1']) {
    await assert.rejects(fetch('https://oauth2.googleapis.com/token', { method: 'POST', body,
      headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' } }));
  }
  await assert.rejects(fetch('https://openidconnect.googleapis.com/v1/userinfo', { method: 'GET', body: '{}' }));
  for (const override of [{ headers: { ...headers, host: 'evil.invalid' } },
    { headers: { ...headers, 'x-http-method-override': 'DELETE' } }, { headers: { ...headers, Authorization: 'Bearer other' } },
    { headers: { ...headers, 'content-type': 'application/json' } }, { dispatcher: {} }, { agent: {} }]) {
    await assert.rejects(fetch(url, { method: 'GET', headers, ...override }));
  }
  await assert.rejects(fetch('https://accounts.google.com/.well-known/openid-configuration', { method: 'GET', headers }));
  assert.equal(calls.length, 1);
});
for (const [name, mutate] of [
  ['runtime project', (f) => { f.runtime.projectId = 'foreign'; }],
  ['runtime source', (f) => { f.runtime.appCommit = 'd'.repeat(40); }],
  ['auth off', (f) => { f.runtime.authEnabled = 'false'; }],
  ['emulator', (f) => { f.runtime.emulator = 'localhost'; }],
  ['mount symlink', (f) => { f.runtime.serviceCredential.symlink = true; }],
]) test(`runtime reader rejects ${name}`, () => {
  const f = fixture(); mutate(f); assert.throws(() => createGoogleWebRuntimeReader(f.binding, f.execute)(f.binding.projectId));
});
test('runtime reader detects canonical-container replacement across readback', () => {
  const f = fixture(); let inspections = 0;
  const execute = (...args) => { const text = f.execute(...args); return args[1][0] === 'inspect' && ++inspections === 2 ? text.replace('/shareittoo-staging-api', '/other') : text; };
  assert.throws(() => createGoogleWebRuntimeReader(f.binding, execute)(f.binding.projectId));
});

test('writer produces exclusive exact 0600 artifacts, refuses reuse and retains original bytes', (t) => {
  const output = directory(t); const options = { directory: output, runId: 'one', kinds: ['candidate', 'journal'], repositoryRoot: root };
  const writer = reserveGoogleWebArtifacts(options);
  const files = writer.write({ candidate: '{"pending":true}', journal: '{"mutations":0}' }); writer.close();
  assert.equal(files.length, 2);
  for (const file of files) { assert.equal(fs.statSync(file.path).mode & 0o777, 0o600); assert.equal(hash(fs.readFileSync(file.path)), file.sha256); }
  assert.throws(() => reserveGoogleWebArtifacts(options));
  assert.equal(fs.readFileSync(files[0].path, 'utf8'), '{"pending":true}');
  assert.throws(() => writer.write({ candidate: '{}', journal: '{}' }));
});
for (const variant of ['unsafe-mode', 'missing-dir', 'symlink-parent', 'inside-repository', 'path-traversal', 'unknown-kind', 'existing-symlink', 'existing-hardlink']) {
  test(`writer rejects ${variant}`, (t) => {
    const output = directory(t); const options = { directory: output, runId: 'one', kinds: ['readiness'], repositoryRoot: root };
    if (variant === 'unsafe-mode') fs.chmodSync(output, 0o755);
    if (variant === 'missing-dir') options.directory = path.join(output, 'missing');
    if (variant === 'symlink-parent') { const link = path.join(directory(t), 'link'); fs.symlinkSync(output, link); options.directory = link; }
    if (variant === 'inside-repository') options.repositoryRoot = output;
    if (variant === 'path-traversal') options.runId = '../escape';
    if (variant === 'unknown-kind') options.kinds = ['credential'];
    if (variant === 'existing-symlink' || variant === 'existing-hardlink') {
      const target = path.join(output, 'target'); fs.writeFileSync(target, 'keep');
      fs[variant === 'existing-symlink' ? 'symlinkSync' : 'linkSync'](target, path.join(output, 'one.readiness.json'));
    }
    assert.throws(() => reserveGoogleWebArtifacts(options), { message: 'google_web_protected_writer_denied' });
  });
}
test('writer rejects noncanonical JSON, partial shapes and raced permission changes', (t) => {
  for (const variant of ['json', 'shape', 'mode', 'hardlink']) {
    const output = directory(t); const writer = reserveGoogleWebArtifacts({ directory: output, runId: 'x', kinds: ['readiness'], repositoryRoot: root });
    const values = { readiness: '{}' };
    if (variant === 'json') values.readiness = '{ }';
    if (variant === 'shape') values.extra = '{}';
    if (variant === 'mode') fs.chmodSync(output, 0o755);
    if (variant === 'hardlink') fs.linkSync(path.join(output, 'x.readiness.json'), path.join(output, 'extra'));
    assert.throws(() => writer.write(values)); writer.close();
  }
});

test('operational collect is sanitized; separate process composes exact independently returned decision', async (t) => {
  const f = await operational(t); const result = await runGoogleWebReattestationCli(f.argv, f.dependencies);
  assert.equal(result.status, 'pending-independent-review');
  assert.equal(JSON.stringify(result).includes(f.sdk.apiKey), false);
  assert.equal(JSON.stringify(result).includes('token'), false);
  const candidateFile = result.files.find((file) => file.kind === 'candidate'); const journal = result.files.find((file) => file.kind === 'journal');
  const candidate = JSON.parse(fs.readFileSync(candidateFile.path, 'utf8')); const r = candidate.readiness;
  const decision = { schemaVersion: 1, kind: 'sit-google-web-prerequisite-activation-decision', evidenceClass: 'independent-release-review',
    syntheticFixture: false, decision: 'approved', sourceCommit: r.sourceCommit, prerequisiteJournalSha256: r.prerequisiteJournalSha256,
    prerequisiteFinalRecordSha256: r.prerequisiteFinalRecordSha256, configurationSha256: candidate.configurationSha256,
    readinessSha256: candidate.readinessSha256, projectId: r.projectId, projectNumber: r.projectNumber, webAppId: r.webAppId,
    authorizedDomain: r.authorizedDomain, firebaseProviderId: r.firebaseProviderId,
    decidedAtUtc: new Date(now).toISOString(), validUntilUtc: new Date(now + 60000).toISOString() };
  const decisionBytes = JSON.stringify(decision);
  const argv = ['compose', '--candidate', candidateFile.path, '--candidate-sha256', candidateFile.sha256,
    '--journal', journal.path, '--journal-sha256', journal.sha256, '--decision', f.write('decision.json', decisionBytes),
    '--decision-sha256', hash(decisionBytes), '--output-dir', f.output, '--run-id', 'composed'];
  const script = `import {runGoogleWebReattestationCli} from ${JSON.stringify(new URL('../ops/staging_google_web_reattestation_cli.mjs', import.meta.url).href)};
    const input=JSON.parse(process.argv[2]);const result=await runGoogleWebReattestationCli(input.argv,{repositoryRoot:input.root,now:()=>input.now,
      fetchImpl:()=>{throw Error('no network during compose')},execute:()=>{throw Error('no Docker during compose')}});process.stdout.write(JSON.stringify(result));`;
  const composed = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script, process.execPath,
    JSON.stringify({ argv, root: f.repositoryRoot, now })], { encoding: 'utf8' }));
  assert.equal(composed.status, 'readiness-composed-not-activated');
  assert.equal(JSON.parse(fs.readFileSync(composed.files[0].path, 'utf8')).activationEligible, true);
  assert.equal(f.calls.filter((call) => call.method === 'POST').length, 1);
  const before = f.calls.length; argv[argv.indexOf('--run-id') + 1] = 'rejected';
  argv[argv.indexOf('--decision-sha256') + 1] = '0'.repeat(64);
  await assert.rejects(runGoogleWebReattestationCli(argv, f.dependencies)); assert.equal(f.calls.length, before);
});
test('collect accepts explicitly inherited existing credential descriptors without chmod', async (t) => {
  const f = await operational(t); const descriptors = [];
  t.after(() => descriptors.forEach((fd) => fs.closeSync(fd)));
  for (const prefix of ['service-credential', 'user-credential']) {
    const index = f.argv.indexOf(`--${prefix}-file`); const file = f.argv[index + 1]; fs.chmodSync(file, 0o640);
    const fd = fs.openSync(file, 'r'); descriptors.push(fd); f.argv[index] = `--${prefix}-fd`; f.argv[index + 1] = String(fd);
  }
  const result = await runGoogleWebReattestationCli(f.argv, f.dependencies);
  assert.equal(result.status, 'pending-independent-review');
  assert.equal(fs.statSync(path.join(f.output, 'service.json')).mode & 0o777, 0o640);
});
test('executable CLI emits only sanitized failure text with no input echo', () => {
  const result = spawnSync(process.execPath, [path.join(root, 'backend/ops/staging_google_web_reattestation_cli.mjs'),
    'collect', '--user-token', 'synthetic-never-print'], { encoding: 'utf8' });
  assert.equal(result.status, 1); assert.equal(result.stdout, '');
  assert.equal(result.stderr, 'google_web_reattestation_cli_denied\n');
});
for (const variant of ['unknown-flag', 'duplicate-flag', 'missing-input', 'credential-in-argv', 'both-credential-sources', 'binding-hash', 'source-drift', 'expired-user', 'output-collision']) {
  test(`CLI collect fails closed for ${variant}`, async (t) => {
    const f = await operational(t);
    if (variant === 'unknown-flag') f.argv.push('--execute', 'true');
    if (variant === 'duplicate-flag') f.argv.push('--run-id', 'second');
    if (variant === 'missing-input') f.argv.splice(1, 2);
    if (variant === 'credential-in-argv') f.argv.push('--user-token', 'never');
    if (variant === 'both-credential-sources') f.argv.push('--user-credential-fd', '3');
    if (variant === 'binding-hash') f.argv[f.argv.indexOf('--binding-sha256') + 1] = '0'.repeat(64);
    if (variant === 'source-drift') fs.appendFileSync(path.join(f.repositoryRoot, googleWebReattestationSourcePaths[1]), '\n// drift');
    if (variant === 'expired-user') { f.user.tokens.expires_at = now; fs.writeFileSync(path.join(f.output, 'user.json'), JSON.stringify(f.user)); }
    if (variant === 'output-collision') f.write('collect.journal.json', '{"keep":true}');
    await assert.rejects(runGoogleWebReattestationCli(f.argv, f.dependencies), { message: 'google_web_reattestation_cli_denied' });
    assert.equal(f.calls.length, 0); assert.equal(f.commands.length, 0);
  });
}
