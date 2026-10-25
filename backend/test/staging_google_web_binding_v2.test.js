import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { collectGoogleWebBindingV2, GOOGLE_WEB_BINDING_V2_READS, GOOGLE_WEB_BINDING_V2_SOURCE_PATHS,
  googleWebBindingV2ReadSources, googleWebBindingV2ExpectedSources } from '../ops/staging_google_web_binding_v2.mjs';
import { createGoogleWebBindingV2Readers } from '../ops/staging_google_web_binding_v2_adapter.mjs';
import { runGoogleWebBindingV2Cli } from '../ops/staging_google_web_binding_v2_cli.mjs';
import { runGoogleWebReattestationV2Cli } from '../ops/staging_google_web_reattestation_v2_cli.mjs';

function readStable(file) {
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_CLOEXEC);
  try {
    const before = fs.fstatSync(fd, { bigint: true });
    assert.equal(before.isFile(), true);
    const keys = ['dev', 'ino', 'mode', 'uid', 'gid', 'nlink', 'size', 'mtimeNs', 'ctimeNs'];
    const pathBefore = fs.lstatSync(file, { bigint: true });
    assert.deepEqual(keys.map((key) => pathBefore[key]), keys.map((key) => before[key]));
    const bytes = fs.readFileSync(fd);
    const after = fs.fstatSync(fd, { bigint: true });
    const pathAfter = fs.lstatSync(file, { bigint: true });
    assert.deepEqual(keys.map((key) => pathAfter[key]), keys.map((key) => after[key]));
    return { bytes, stat: before };
  } finally { fs.closeSync(fd); }
}
import { runGoogleWebReattestationCli } from '../ops/staging_google_web_reattestation_cli.mjs';
import { sha256, validateArtifact } from '../../tool/staging_web_contract.mjs';
import { syntheticListingAiWebEvidence } from '../../test/tool/staging_listing_ai_web_readiness_fixture.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const hash = (value = '') => createHash('sha256').update(value).digest('hex');
function fixture(t) {
  const repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sit-binding-v2-')));
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));
  for (const file of GOOGLE_WEB_BINDING_V2_SOURCE_PATHS) {
    fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true }); fs.copyFileSync(path.join(root, file), path.join(repo, file));
  }
  fs.writeFileSync(path.join(repo, 'pubspec.yaml'), 'version: 1.2.3+20261025\n');
  fs.writeFileSync(path.join(repo, '.gitignore'), 'build/\n');
  execFileSync('git', ['init', '-q'], { cwd: repo }); execFileSync('git', ['add', '.'], { cwd: repo });
  execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'fixture'], { cwd: repo });
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
  const values = {
    serviceProjectIdentity: { projectId: 'shareittoo-staging', projectNumber: '214007794438', lifecycleState: 'ACTIVE', serviceAccountEmailSha256: hash('svc@example.invalid') },
    userAccountIdentity: { projectId: 'shareittoo-staging', projectNumber: '214007794438', firebaseAccountEmailSha256: hash('operator@example.invalid'), proofSha256: hash('proof') },
    webApp: { appId: '1:214007794438:web:aefec13f9f030f46eaac87', projectId: 'shareittoo-staging', state: 'ACTIVE', apiKeyId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', origin: 'https://staging.shareittoo.com' },
    sdkConfig: { projectId: 'shareittoo-staging', projectNumber: '214007794438', appId: '1:214007794438:web:aefec13f9f030f46eaac87', apiKeyId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', keyFingerprint: hash('key'), configurationSha256: hash('config'), origin: 'https://staging.shareittoo.com' },
    apiKeyInventory: { complete: true, apiKeyId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', resourceName: 'projects/214007794438/locations/global/keys/staging-key', keyMatchesSdkConfig: true, restrictionsDigest: hash('restrictions'), webCompatible: true },
    providerSnapshot: { complete: true, projectId: 'shareittoo-staging', projectNumber: '214007794438', authEnabled: true, googleEnabled: true, facebookEnabled: false, appleEnabled: false, stagingAuthorized: true, webAppInventoryComplete: true, apiKeyInventoryComplete: true, snapshotSha256: hash('snapshot'), configurationSha256: hash('config') },
    runtime: { containerId: 'c'.repeat(64), name: '/shareittoo-staging-api', running: true, green: true, revision: 'b'.repeat(40), imageId: `sha256:${'d'.repeat(64)}`, repoDigests: [`registry.invalid/sit@sha256:${'e'.repeat(64)}`], runtimeDigest: hash('runtime') },
  };
  const readers = Object.fromEntries(GOOGLE_WEB_BINDING_V2_READS.map((name) => [name, async () => ({ method: 'GET', value: values[name], sources: googleWebBindingV2ExpectedSources(name, values.apiKeyInventory.resourceName) })]));
  return { repo, commit, values, readers, args: { readers, repositoryRoot: repo, sourceCommit: commit, runtimeCommit: 'b'.repeat(40), runtimeImageId: values.runtime.imageId, runtimeRepoDigest: values.runtime.repoDigests[0], reviewEvidenceSha256: hash('review') } };
}

test('v2 composes exact staging/provider/runtime binding without secrets', async (t) => {
  const f = fixture(t); const { binding } = await collectGoogleWebBindingV2(f.args);
  assert.equal(binding.schemaVersion, 2); assert.equal(binding.projectNumber, '214007794438');
  assert.equal(binding.webAppId, '1:214007794438:web:aefec13f9f030f46eaac87'); assert.equal(binding.runtimeImageId, f.values.runtime.imageId);
  assert.equal(JSON.stringify(binding).includes('private_key'), false);
});

test('source register contains the exact Docker pseudo-source and full relative-import closure', () => {
  assert.ok(googleWebBindingV2ReadSources().includes('docker://shareittoo-staging-api'));
  assert.ok(googleWebBindingV2ReadSources().every((url) => url.startsWith('https://') || url === 'docker://shareittoo-staging-api'));
  for (const file of GOOGLE_WEB_BINDING_V2_SOURCE_PATHS) {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    for (const match of text.matchAll(/(?:from\s+|import\s*)['"]([.][^'"]+)['"]/gu)) {
      assert.ok(GOOGLE_WEB_BINDING_V2_SOURCE_PATHS.includes(path.posix.normalize(path.posix.join(path.posix.dirname(file), match[1]))), `${file}: ${match[1]}`);
    }
  }
});

for (const [label, mutate] of [
  ['project mismatch', (v) => { v.serviceProjectIdentity.projectNumber = '1'; }],
  ['wrong app', (v) => { v.webApp.appId = 'bad'; }],
  ['wrong origin', (v) => { v.sdkConfig.origin = 'https://evil.invalid'; }],
  ['key restriction mismatch', (v) => { v.apiKeyInventory.webCompatible = false; }],
  ['Google disabled', (v) => { v.providerSnapshot.googleEnabled = false; }],
  ['Facebook enabled', (v) => { v.providerSnapshot.facebookEnabled = true; }],
  ['runtime revision mismatch', (v) => { v.runtime.revision = 'c'.repeat(40); }],
  ['image mismatch', (v) => { v.runtime.imageId = `sha256:${'f'.repeat(64)}`; }],
]) test(`v2 denies ${label}`, async (t) => {
  const f = fixture(t); mutate(f.values); await assert.rejects(collectGoogleWebBindingV2(f.args), { message: 'google_web_binding_v2_denied' });
});

test('v2 binding/collect composes through v1 review into schema-8 Google and Listing-AI web build', async (t) => {
  const f = fixture(t);
  const now = Date.now(); const privateKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' });
  const project = 'shareittoo-staging'; const number = '214007794438'; const appId = '1:214007794438:web:aefec13f9f030f46eaac87';
  const keyId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; const apiKey = `AIza${'b'.repeat(35)}`;
  const restrictions = { browserKeyRestrictions: { allowedReferrers: ['https://staging.shareittoo.com/*'] }, apiTargets: [{ service: 'identitytoolkit.googleapis.com' }, { service: 'securetoken.googleapis.com' }] };
  const key = { name: `projects/${number}/locations/global/keys/staging-key`, uid: keyId, displayName: 'Staging Web', restrictions };
  const app = { name: `projects/${project}/webApps/${appId}`, appId, projectId: project, apiKeyId: keyId, state: 'ACTIVE' };
  const sdk = { projectId: project, appId, projectNumber: number, messagingSenderId: number, apiKey, authDomain: `${project}.firebaseapp.com` };
  const svcBytes = JSON.stringify({ type: 'service_account', project_id: project, client_email: 'test@shareittoo-staging.iam.gserviceaccount.com', private_key: privateKey, token_uri: 'https://oauth2.googleapis.com/token' });
  const userBytes = JSON.stringify({ user: { email: 'operator@example.invalid' }, tokens: { access_token: 'user-access-token', expires_at: now + 600000 } });
  let idp = new Map([['facebook.com', 404], ['apple.com', 404]]); let paginationCycle = false; const calls = [];
  const respond = (value, status = 200) => ({ status, text: async () => JSON.stringify(value) });
  const fetchImpl = async (url, init) => {
    const u = new URL(url); const p = decodeURIComponent(u.pathname);
    calls.push({ url: u.href, method: init.method, redirect: init.redirect, credentials: init.credentials });
    if (u.hostname === 'oauth2.googleapis.com') return respond({ access_token: 'service-access-token', token_type: 'Bearer', expires_in: 3600 });
    if (u.hostname === 'accounts.google.com') return respond({ issuer: 'https://accounts.google.com', userinfo_endpoint: 'https://openidconnect.googleapis.com/v1/userinfo' });
    if (u.hostname === 'openidconnect.googleapis.com') return respond({ email: 'operator@example.invalid', email_verified: true, sub: 'subject' });
    if (u.hostname === 'cloudresourcemanager.googleapis.com') return respond({ projectId: project, projectNumber: number, lifecycleState: 'ACTIVE' });
    if (u.hostname === 'firebase.googleapis.com') {
      if (p.endsWith('/config')) return respond(sdk); if (p.endsWith(`/webApps/${appId}`)) return respond(app);
      if (p.endsWith('/webApps')) return respond(paginationCycle ? { apps: [app], nextPageToken: 'cycle' } : { apps: [app] });
      return respond({ apps: [] });
    }
    if (u.hostname === 'apikeys.googleapis.com') { if (p.endsWith('/keyString')) return respond({ keyString: apiKey }); if (p.endsWith('/keys')) return respond(paginationCycle ? { keys: [key], nextPageToken: 'cycle' } : { keys: [key] }); return respond(key); }
    if (u.hostname === 'identitytoolkit.googleapis.com') {
      if (p.endsWith('/config')) return respond({ name: `projects/${number}/config`, authorizedDomains: ['staging.shareittoo.com'] });
      const provider = p.split('/').at(-1); if (idp.get(provider) === 404) return respond({}, 404);
      return respond({ name: `projects/${number}/defaultSupportedIdpConfigs/${provider}`, enabled: idp.get(provider) === true || provider === 'google.com' });
    }
    if (u.hostname === 'serviceusage.googleapis.com') { const name = p.split('/').at(-1); return respond({ name: `projects/${number}/services/${name}`, parent: `projects/${number}`, state: 'ENABLED', config: { name } }); }
    throw new Error('unexpected URL');
  };
  const execute = (_cmd, args) => {
    if (args[0] === 'inspect' && args.at(-1) === '{{json .Image}}') return JSON.stringify(`sha256:${'d'.repeat(64)}`);
    if (args[0] === 'inspect') return [ 'c'.repeat(64), '/shareittoo-staging-api', true, 'true', 'e'.repeat(40), ...(args.at(-1).includes('.Image') ? [`sha256:${'d'.repeat(64)}`] : []) ].map(JSON.stringify).join('|');
    if (args[0] === 'image') return [`sha256:${'d'.repeat(64)}`, [`registry.invalid/sit@sha256:${'f'.repeat(64)}`]].map(JSON.stringify).join('|');
    if (args[0] === 'exec') return JSON.stringify({ projectId: project, authEnabled: 'true', emulator: null, serviceCredential: { regular: true, symlink: false, nonempty: true }, appCommit: 'e'.repeat(40) });
    throw new Error('unexpected docker');
  };
  const make = () => createGoogleWebBindingV2Readers({ serviceCredentialBytes: svcBytes, userCredentialBytes: userBytes,
    firebaseAccountEmailSha256: hash('operator@example.invalid'), runtimeContainerId: 'c'.repeat(64), expectedRuntimeCommit: 'e'.repeat(40),
    expectedRuntimeImageId: `sha256:${'d'.repeat(64)}`, expectedRuntimeRepoDigest: `registry.invalid/sit@sha256:${'f'.repeat(64)}`, fetchImpl, execute, now: () => now });
  const readAll = async (r) => { await r.serviceProjectIdentity(); await r.userAccountIdentity(); await r.webApp(); await r.sdkConfig(); await r.apiKeyInventory(); await r.runtime(); return r.providerSnapshot(); };
  const absent = await readAll(make()); assert.equal(absent.value.facebookEnabled, false); assert.equal(absent.value.appleEnabled, false);
  assert.ok(absent.sources.some((s) => s.endsWith('/facebook.com'))); assert.ok(absent.sources.some((s) => s.endsWith('/apple.com')));
  const protectedRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sit-google-e2e-'))); fs.chmodSync(protectedRoot, 0o700);
  t.after(() => fs.rmSync(protectedRoot, { recursive: true, force: true }));
  const bindOut = path.join(protectedRoot, 'binding-out'); const attestOut = path.join(protectedRoot, 'attest-out');
  fs.mkdirSync(bindOut, { mode: 0o700 }); fs.mkdirSync(attestOut, { mode: 0o700 });
  const svcPath = path.join(protectedRoot, 'service.json'); const userPath = path.join(protectedRoot, 'user.json');
  fs.writeFileSync(svcPath, svcBytes, { mode: 0o600 }); fs.writeFileSync(userPath, userBytes, { mode: 0o600 });
  const emailSha = hash('operator@example.invalid');
  const bound = await runGoogleWebBindingV2Cli(['--output-dir', bindOut, '--run-id', 'e2e', '--source-commit', f.commit,
    '--runtime-commit', 'e'.repeat(40), '--runtime-image-id', `sha256:${'d'.repeat(64)}`,
    '--runtime-repo-digest', `registry.invalid/sit@sha256:${'f'.repeat(64)}`, '--review-evidence-sha256', hash('review'),
    '--runtime-container-id', 'c'.repeat(64), '--firebase-account-email-sha256', emailSha,
    '--service-credential-file', svcPath, '--user-credential-file', userPath],
  { repositoryRoot: f.repo, fetchImpl, execute, now: () => now });
  assert.equal(bound.mode, '0600');
  const boundFile = readStable(bound.path); assert.equal(Number(boundFile.stat.mode & 0o777n), 0o600);
  const bindingText = boundFile.bytes.toString('utf8'); assert.equal(hash(bindingText), bound.sha256);
  assert.equal(bindingText.includes(apiKey), false); assert.equal(JSON.stringify(bound).includes(apiKey), false);
  const attest = await runGoogleWebReattestationV2Cli(['collect', '--binding', bound.path, '--binding-sha256', bound.sha256,
    '--service-credential-file', svcPath, '--user-credential-file', userPath, '--output-dir', attestOut, '--run-id', 'e2e'],
  { repositoryRoot: f.repo, fetchImpl, execute, now: () => now });
  assert.equal(attest.status, 'pending-independent-review');
  const candidatePath = attest.files.find((x) => x.kind === 'candidate').path;
  const candidateText = fs.readFileSync(candidatePath, 'utf8'); const candidate = JSON.parse(candidateText);
  assert.equal(candidate.configuration.apiKey, apiKey); assert.equal(candidate.configuration.authDomain, `${project}.firebaseapp.com`);
  assert.equal(JSON.stringify(attest).includes(apiKey), false); assert.equal(JSON.stringify(attest).includes('service-access-token'), false);
  assert.equal(candidateText.includes('user-access-token'), false); assert.equal(candidateText.includes('BEGIN PRIVATE KEY'), false);
  for (const file of attest.files) assert.equal(fs.statSync(file.path).mode & 0o777, 0o600);
  const readiness = candidate.readiness;
  const decision = { schemaVersion: 1, kind: 'sit-google-web-prerequisite-activation-decision',
    evidenceClass: 'independent-release-review', syntheticFixture: false, decision: 'approved',
    sourceCommit: readiness.sourceCommit, prerequisiteJournalSha256: readiness.prerequisiteJournalSha256,
    prerequisiteFinalRecordSha256: readiness.prerequisiteFinalRecordSha256,
    configurationSha256: candidate.configurationSha256, readinessSha256: candidate.readinessSha256,
    projectId: readiness.projectId, projectNumber: readiness.projectNumber, webAppId: readiness.webAppId,
    authorizedDomain: readiness.authorizedDomain, firebaseProviderId: readiness.firebaseProviderId,
    decidedAtUtc: new Date(now).toISOString(), validUntilUtc: new Date(now + 60_000).toISOString() };
  const decisionBytes = JSON.stringify(decision); const decisionPath = path.join(protectedRoot, 'decision.json');
  fs.writeFileSync(decisionPath, decisionBytes, { mode: 0o600, flag: 'wx' });
  const composedOut = path.join(protectedRoot, 'composed'); fs.mkdirSync(composedOut, { mode: 0o700 });
  const candidateFile = attest.files.find((x) => x.kind === 'candidate'); const journalFile = attest.files.find((x) => x.kind === 'journal');
  const composed = await runGoogleWebReattestationCli(['compose', '--candidate', candidateFile.path, '--candidate-sha256', candidateFile.sha256,
    '--journal', journalFile.path, '--journal-sha256', journalFile.sha256, '--decision', decisionPath,
    '--decision-sha256', hash(decisionBytes), '--output-dir', composedOut, '--run-id', 'v2-compose'],
  { repositoryRoot: f.repo, fetchImpl: async () => { throw new Error('compose must perform no network read'); },
    execute: () => { throw new Error('compose must perform no Docker read'); }, now: () => now });
  assert.equal(composed.status, 'readiness-composed-not-activated');
  const readinessArtifact = composed.files[0]; assert.equal(fs.statSync(readinessArtifact.path).mode & 0o777, 0o600);
  const listingAi = syntheticListingAiWebEvidence(f.commit, '1.2.3+20261025', { now: new Date(now) });
  const listingRoot = path.join(protectedRoot, 'listing-ai'); fs.mkdirSync(listingRoot, { mode: 0o700 });
  const listingPath = path.join(listingRoot, 'readiness.json');
  fs.writeFileSync(listingPath, JSON.stringify(listingAi.evidence), { mode: 0o600, flag: 'wx' });
  const buildRoot = path.join(protectedRoot, 'build-tools'); fs.mkdirSync(buildRoot, { mode: 0o700 });
  const fakeProgram = `#!${process.execPath}\nimport fs from 'node:fs';import path from 'node:path';
const name=path.basename(process.argv[1]);
if(name==='flutter')console.log(JSON.stringify({frameworkVersion:'synthetic',frameworkRevision:'fixture',dartSdkVersion:'fixture'}));
if(name==='bash'){
 const file=process.argv.find(x=>x.startsWith('--dart-define-from-file=')).split('=')[1];
 const p=JSON.parse(fs.readFileSync(file));
 if(p.SIT_SOCIAL_GOOGLE_ENABLED!=='true'||p.SIT_SOCIAL_FACEBOOK_ENABLED!=='false'||p.SIT_SOCIAL_APPLE_ENABLED!=='false')process.exit(2);
 fs.mkdirSync('build/web',{recursive:true});
 for(const [file,text] of Object.entries({'index.html':'<script src="flutter_bootstrap.js" async></script>','main.dart.js':'mock build','manifest.json':'{}','flutter_bootstrap.js':'bootstrap();'}))fs.writeFileSync(path.join('build/web',file),text);
}\n`;
  for (const name of ['flutter', 'bash', 'python3']) fs.writeFileSync(path.join(buildRoot, name), fakeProgram, { mode: 0o700 });
  const artifactDir = path.join(protectedRoot, 'artifact');
  const build = spawnSync(process.execPath, [path.join(root, 'tool/build_staging_web.mjs'), f.repo, f.commit, artifactDir,
    '--google-web-readiness', readinessArtifact.path, readinessArtifact.sha256,
    '--listing-ai-web-readiness', listingPath, listingAi.digest],
  { encoding: 'utf8', env: { ...process.env, PATH: `${buildRoot}${path.delimiter}${process.env.PATH}` } });
  assert.equal(build.status, 0, build.stderr);
  const buildResult = JSON.parse(build.stdout.trim()); const manifest = validateArtifact(artifactDir, buildResult.manifestHash, f.commit);
  assert.equal(manifest.schemaVersion, 8); assert.equal(manifest.listingAiWebProviderSchemaVersion, 6);
  assert.equal(manifest.profileContractVersion, 'staging-google-web-v2');
  assert.equal(manifest.profile.SIT_SOCIAL_GOOGLE_ENABLED, 'true');
  assert.equal(manifest.profile.SIT_SOCIAL_FACEBOOK_ENABLED, 'false'); assert.equal(manifest.profile.SIT_SOCIAL_APPLE_ENABLED, 'false');
  const artifactText = Object.entries(manifest.files).map(([file]) => fs.readFileSync(path.join(artifactDir, 'web', file), 'utf8')).join('\n');
  assert.equal(artifactText.includes('BEGIN PRIVATE KEY'), false); assert.equal(artifactText.includes(privateKey), false);
  assert.equal(artifactText.includes('user-access-token'), false);
  assert.equal(artifactText.includes('service-access-token'), false);
  assert.equal(`${build.stdout}${build.stderr}`.includes(apiKey), false);
  assert.equal(calls.filter((x) => x.method === 'POST').length >= 1, true);
  assert.ok(calls.filter((x) => x.method === 'POST').every((x) => x.url === 'https://oauth2.googleapis.com/token'));
  assert.ok(calls.every((x) => x.redirect === 'error' && x.credentials === 'omit'));
  const allowedHosts = new Set(['oauth2.googleapis.com', 'accounts.google.com', 'openidconnect.googleapis.com',
    'cloudresourcemanager.googleapis.com', 'firebase.googleapis.com', 'apikeys.googleapis.com',
    'identitytoolkit.googleapis.com', 'serviceusage.googleapis.com']);
  assert.ok(calls.every(({ url }) => { const parsed = new URL(url); return parsed.protocol === 'https:' && parsed.port === '' && allowedHosts.has(parsed.hostname); }));
  const readOnlyHosts = new Set(['identitytoolkit.googleapis.com', 'firebase.googleapis.com', 'apikeys.googleapis.com']);
  assert.ok(calls.filter(({ url }) => readOnlyHosts.has(new URL(url).hostname)).every((x) => x.method === 'GET'));
  const callsBeforeCollision = calls.length;
  await assert.rejects(runGoogleWebBindingV2Cli(['--output-dir', bindOut, '--run-id', 'e2e', '--source-commit', f.commit,
    '--runtime-commit', 'e'.repeat(40), '--runtime-image-id', `sha256:${'d'.repeat(64)}`,
    '--runtime-repo-digest', `registry.invalid/sit@sha256:${'f'.repeat(64)}`, '--review-evidence-sha256', hash('review'),
    '--runtime-container-id', 'c'.repeat(64), '--firebase-account-email-sha256', emailSha,
    '--service-credential-file', svcPath, '--user-credential-file', userPath],
  { repositoryRoot: f.repo, fetchImpl, execute, now: () => now }), { message: 'google_web_binding_v2_cli_denied' });
  assert.equal(calls.length, callsBeforeCollision, 'exclusive output collision must be denied before provider reads');
  paginationCycle = true; await assert.rejects(readAll(make()), { message: 'google_web_binding_v2_reader_denied' }); paginationCycle = false;
  let inspectCount = 0;
  const replacement = createGoogleWebBindingV2Readers({ serviceCredentialBytes: svcBytes, userCredentialBytes: userBytes,
    firebaseAccountEmailSha256: emailSha, runtimeContainerId: 'c'.repeat(64), expectedRuntimeCommit: 'e'.repeat(40),
    expectedRuntimeImageId: `sha256:${'d'.repeat(64)}`, expectedRuntimeRepoDigest: `registry.invalid/sit@sha256:${'f'.repeat(64)}`,
    fetchImpl, now: () => now, execute: (_cmd, args) => {
      if (args[0] === 'inspect' && args.at(-1) !== '{{json .Image}}' && ++inspectCount === 2) return ['9'.repeat(64), '/shareittoo-staging-api', true, 'true', 'e'.repeat(40), `sha256:${'d'.repeat(64)}`].map(JSON.stringify).join('|');
      return execute(_cmd, args);
    } });
  await assert.rejects(replacement.runtime(), { message: 'google_web_binding_v2_reader_denied' });
  assert.throws(() => createGoogleWebBindingV2Readers({ serviceCredentialBytes: svcBytes, userCredentialBytes: JSON.stringify({ user: { email: 'other@example.invalid' }, tokens: { access_token: 'x', expires_at: now + 600000 } }),
    firebaseAccountEmailSha256: emailSha, runtimeContainerId: 'c'.repeat(64), expectedRuntimeCommit: 'e'.repeat(40),
    expectedRuntimeImageId: `sha256:${'d'.repeat(64)}`, expectedRuntimeRepoDigest: `registry.invalid/sit@sha256:${'f'.repeat(64)}`, fetchImpl, execute, now: () => now }),
  { message: 'user_account_not_found' });
  idp = new Map([['facebook.com', true], ['apple.com', 404]]); await assert.rejects(readAll(make()), { message: 'google_web_binding_v2_reader_denied' });
  idp = new Map([['facebook.com', 404], ['apple.com', true]]); await assert.rejects(readAll(make()), { message: 'google_web_binding_v2_reader_denied' });
  idp = new Map([['facebook.com', 404], ['apple.com', 404], ['google.com', 404]]); await assert.rejects(readAll(make()), { message: 'google_web_binding_v2_reader_denied' });
  idp = new Map([['facebook.com', 404], ['apple.com', 404]]);
  const bad404 = createGoogleWebBindingV2Readers({ serviceCredentialBytes: svcBytes, userCredentialBytes: userBytes,
    firebaseAccountEmailSha256: hash('operator@example.invalid'), runtimeContainerId: 'c'.repeat(64), expectedRuntimeCommit: 'e'.repeat(40),
    expectedRuntimeImageId: `sha256:${'d'.repeat(64)}`, expectedRuntimeRepoDigest: `registry.invalid/sit@sha256:${'f'.repeat(64)}`,
    fetchImpl: async (url, init) => new URL(url).pathname.endsWith('/config') && new URL(url).hostname === 'identitytoolkit.googleapis.com' ? respond({}, 404) : fetchImpl(url, init), execute, now: () => now });
  await assert.rejects(readAll(bad404), { message: 'google_web_binding_v2_reader_denied' });
});

test('reattestation v2 CLI uses default executor when execute is omitted', async (t) => {
  const f = fixture(t); const binding = {
    kind: 'sit-google-web-reattestation-binding', schemaVersion: 2, sourceCommit: f.commit,
    sourceInventory: GOOGLE_WEB_BINDING_V2_SOURCE_PATHS.map((locator) => ({ locator, commit: f.commit, sha256: hash(fs.readFileSync(path.join(f.repo, locator))) })),
    projectId: 'shareittoo-staging', projectNumber: '214007794438', webAppId: '1:214007794438:web:aefec13f9f030f46eaac87', origin: 'https://staging.shareittoo.com',
    serviceAccountEmailSha256: hash('svc@example.invalid'), firebaseAccountEmailSha256: hash('operator@example.invalid'), firebaseUserIdentityProofSha256: hash('proof'),
    apiKey: { apiKeyId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', keyFingerprint: hash('key'), restrictionsDigest: hash('restrictions') },
    apiKeyResourceName: 'projects/214007794438/locations/global/keys/staging-key', expectedSnapshotSha256: hash('snapshot'), configurationSha256: hash('config'), reviewEvidenceSha256: hash('review'),
    runtimeContainerId: 'c'.repeat(64), runtimeCommit: 'b'.repeat(40), runtimeImageId: `sha256:${'d'.repeat(64)}`, runtimeRepoDigest: `registry.invalid/sit@sha256:${'e'.repeat(64)}`,
    readEvidence: Object.fromEntries(GOOGLE_WEB_BINDING_V2_READS.map((k) => [k, hash(k)])),
  };
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048 }); const service = { projectId: 'shareittoo-staging', clientEmail: 'svc@example.invalid', privateKey: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }) };
  const parent = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sit-reattest-v2-default-'))); fs.chmodSync(parent, 0o700);
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const outputDir = path.join(parent, 'output'); fs.mkdirSync(outputDir, { mode: 0o700 });
  const bindingPath = path.join(parent, 'binding.json'); fs.writeFileSync(bindingPath, `${JSON.stringify(binding)}\n`, { mode: 0o600 });
  const servicePath = path.join(parent, 'service.json'); fs.writeFileSync(servicePath, JSON.stringify({ type: 'service_account', project_id: service.projectId,
    client_email: service.clientEmail, private_key: service.privateKey, token_uri: 'https://oauth2.googleapis.com/token' }), { mode: 0o600 });
  const userPath = path.join(parent, 'user.json'); fs.writeFileSync(userPath, JSON.stringify({ user: { email: 'operator@example.invalid' },
    tokens: { access_token: 'user-token', expires_at: Date.now() + 600_000 } }), { mode: 0o600 });
  const bin = path.join(parent, 'bin'); fs.mkdirSync(bin, { mode: 0o700 });
  const docker = path.join(bin, 'docker'); fs.writeFileSync(docker, '#!/bin/sh\nexit 2\n', { mode: 0o700 }); fs.chmodSync(docker, 0o700);
  const oldPath = process.env.PATH; process.env.PATH = `${bin}${path.delimiter}${oldPath ?? ''}`;
  try {
    await assert.rejects(runGoogleWebReattestationV2Cli(['collect', '--binding', bindingPath, '--binding-sha256', hash(fs.readFileSync(bindingPath)),
      '--service-credential-file', servicePath, '--user-credential-file', userPath, '--output-dir', outputDir, '--run-id', 'no-execute'],
    { repositoryRoot: f.repo, fetchImpl: async () => { throw new Error('unexpected network'); }, now: () => Date.now() }),
    { message: 'google_web_reattestation_v2_cli_denied' });
  } finally { if (oldPath === undefined) delete process.env.PATH; else process.env.PATH = oldPath; }
});
