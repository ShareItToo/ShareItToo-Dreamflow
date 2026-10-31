import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { collectGoogleWebV3Inputs, requestClient, runGoogleWebV3InputProducer } from '../ops/staging_google_web_v3_input_producer.mjs';
import { bindGoogleWebCurrentReadback, GOOGLE_WEB_AUTH_APIS, GOOGLE_WEB_CURRENT_ORIGINS } from '../../tool/staging_google_web_current_readback.mjs';

const projectId = 'shareittoo-staging';
const projectNumber = '214007794438';
const appId = '1:214007794438:web:aefec13f9f030f46eaac87';
const sourceCommit = 'a'.repeat(40);
const runtimeContainerId = 'b'.repeat(64);
const imageDigest = `sha256:${'c'.repeat(64)}`;
const imageId = `sha256:${'d'.repeat(64)}`;
const operatorHash = 'ab40c92847d70810d0da6d819491307bbaf5989e3d835ee0eb1b3d4443bad776';
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' });
const serviceAccountText = JSON.stringify({ type: 'service_account', project_id: projectId,
  client_email: 'staging-reader@shareittoo-staging.iam.gserviceaccount.com', private_key: privatePem,
  token_uri: 'https://oauth2.googleapis.com/token' });
const serviceAccount = JSON.parse(serviceAccountText);
const serviceUsageConsoleProof = {
  schemaVersion: 1, kind: 'sit-google-web-service-usage-console-readback',
  evidenceClass: 'direct-google-cloud-console-service-usage-readback', syntheticFixture: false,
  readAtUtc: '2026-10-31T11:30:00.000Z', validUntilUtc: '2026-10-31T13:30:00.000Z',
  projectId, projectNumber, operatorAccountEmailSha256: operatorHash,
  services: [
    { serviceName: 'identitytoolkit.googleapis.com', state: 'ENABLED',
      consoleUrl: `https://console.cloud.google.com/apis/api/identitytoolkit.googleapis.com/metrics?project=${projectId}` },
    { serviceName: 'securetoken.googleapis.com', state: 'ENABLED',
      consoleUrl: `https://console.cloud.google.com/apis/api/securetoken.googleapis.com/metrics?project=${projectId}` },
  ],
};
const serviceUsageConsoleText = JSON.stringify(serviceUsageConsoleProof);

function apiFixture(overrides = {}) {
  const sdk = { projectId, projectNumber, appId, apiKey: `AIza${'x'.repeat(35)}`,
    authDomain: `${projectId}.firebaseapp.com`, messagingSenderId: projectNumber };
  return {
    [`https://cloudresourcemanager.googleapis.com/v1/projects/${projectId}`]: {
      projectId, projectNumber, lifecycleState: 'ACTIVE' },
    [`https://firebase.googleapis.com/v1beta1/projects/${projectNumber}/webApps/${appId}`]: {
      appId, projectId, state: 'ACTIVE' },
    [`https://firebase.googleapis.com/v1beta1/projects/${projectNumber}/webApps/${appId}/config`]: sdk,
    [`https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}/config`]: {
      name: `projects/${projectNumber}/config`, authorizedDomains: ['staging.shareittoo.com', `${projectId}.firebaseapp.com`] },
    [`https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}/defaultSupportedIdpConfigs/google.com`]: {
      name: `projects/${projectNumber}/defaultSupportedIdpConfigs/google.com`, enabled: true },
    [`https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}/defaultSupportedIdpConfigs/apple.com`]: {
      name: `projects/${projectNumber}/defaultSupportedIdpConfigs/apple.com`, enabled: false },
    [`https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}/defaultSupportedIdpConfigs/facebook.com`]: {
      name: `projects/${projectNumber}/defaultSupportedIdpConfigs/facebook.com`, enabled: false },
    ...overrides,
  };
}

function dependencies({ apiOverrides = {}, statusOverrides = {}, executeOverride, fetchOverride, onRequest } = {}) {
  const urls = apiFixture(apiOverrides);
  const fetchImpl = async (url, options) => {
    onRequest?.(url, options);
    if (url.href === 'https://oauth2.googleapis.com/token') {
      assert.equal(options.method, 'POST');
      return { status: 200, text: async () => JSON.stringify({ token_type: 'Bearer', access_token: 'synthetic-token', expires_in: 3600 }) };
    }
    assert.equal(options.method, 'GET');
    assert.equal(options.redirect, 'error');
    assert.ok(Object.hasOwn(urls, url.href), `unexpected API URL ${url.origin}${url.pathname}`);
    return { status: statusOverrides[url.href] ?? 200,
      text: async () => JSON.stringify(urls[url.href] ?? { error: 'synthetic response' }) };
  };
  const inspect = [runtimeContainerId, '/shareittoo-staging-api', true, false, 'true', sourceCommit, imageId]
    .map(value => JSON.stringify(value)).join('|');
  const execute = (command, args) => {
    assert.equal(command, 'docker');
    if (args[0] === 'inspect') return inspect;
    if (args[0] === 'image') return [imageId, [`ghcr.io/shareittoo/shareittoo-api@${imageDigest}`]]
      .map(value => JSON.stringify(value)).join('|');
    if (args[0] === 'exec') return JSON.stringify({ projectId, authEnabled: 'true', emulator: null,
      serviceCredential: { regular: true, symlink: false, nonempty: true }, appCommit: sourceCommit });
    throw new Error('unexpected docker command');
  };
  return { fetchImpl: fetchOverride ?? fetchImpl, execute: executeOverride ?? ((command, args, opts) => {
    try { return execute(command, args, opts); } catch { throw new Error('synthetic command failed'); }
  }) };
}

const fixedNow = () => new Date('2026-10-31T12:00:00.000Z');
const fixedNowMs = () => Date.parse('2026-10-31T12:00:00.000Z');
const collect = (deps = {}) => collectGoogleWebV3Inputs({ serviceAccountText, runtimeContainerId,
  serviceUsageConsoleText, sourceCommit, imageDigest, now: fixedNow, nowMs: fixedNowMs, ...deps });

test('collects exact canonical provider configuration and sealed runtime CAS using GET-only reads', async () => {
  const seen = [];
  const result = await collect(dependencies({ onRequest: (url, request) => seen.push([url.href, request.method]) }));
  assert.deepEqual(result.configuration, { projectId, messagingSenderId: projectNumber, appId,
    apiKey: `AIza${'x'.repeat(35)}`, authDomain: `${projectId}.firebaseapp.com`, backendProjectId: projectId,
    authorizedOrigin: 'https://staging.shareittoo.com' });
  assert.equal(result.serviceReadback.googleProviderEnabled, true);
  assert.equal(result.serviceReadback.appleProviderEnabled, false);
  assert.equal(result.serviceReadback.facebookProviderEnabled, false);
  assert.equal(result.serviceReadback.firebaseAuthEnabled, true);
  assert.equal(result.serviceReadback.firebaseEmulatorEnabled, false);
  assert.equal(result.serviceReadback.runtime.commit, sourceCommit);
  assert.equal(result.serviceReadback.runtime.image, `ghcr.io/shareittoo/shareittoo-api@${imageDigest}`);
  assert.deepEqual(new Set(seen.map(([, method]) => method)), new Set(['GET', 'POST']));
  assert.equal(seen.length, 8);
  assert.equal(seen.filter(([url]) => url.includes('serviceusage.googleapis.com')).length, 0);
  assert.equal(seen.filter(([url, method]) => url === 'https://oauth2.googleapis.com/token' && method === 'POST').length, 1);
  assert.equal(seen.filter(([, method]) => method === 'POST').length, 1);
  assert.equal(result.serviceUsageBinding.consoleReadbackSha256, sha256(serviceUsageConsoleText));
  assert.equal(result.serviceUsageBinding.serviceReadbackSha256, sha256(JSON.stringify(result.serviceReadback)));
});

test('outputs satisfy the existing V3 assembler contract without reshaping', async () => {
  const collected = await collect(dependencies());
  const sha = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const at = fixedNow().toISOString(); const until = new Date(fixedNowMs() + 20 * 60 * 1000).toISOString();
  const cloudConsoleReadback = { schemaVersion: 1, kind: 'sit-google-web-cloud-console-api-key-readback',
    evidenceClass: 'direct-google-cloud-console-readback', syntheticFixture: false, readAtUtc: at,
    validUntilUtc: until, projectId, operatorAccountEmailSha256: 'ab40c92847d70810d0da6d819491307bbaf5989e3d835ee0eb1b3d4443bad776',
    apiKeyResourceId: `projects/${projectNumber}/locations/global/keys/${'k'.repeat(20)}`,
    apiKeySha256: sha(collected.configuration.apiKey), apiRestrictions: [...GOOGLE_WEB_AUTH_APIS],
    websiteRestrictions: [...GOOGLE_WEB_CURRENT_ORIGINS] };
  cloudConsoleReadback.apiKeySha256 = crypto.createHash('sha256').update(collected.configuration.apiKey).digest('hex');
  const configurationSha256 = sha(collected.configuration);
  const serviceAccountReadbackSha256 = sha(collected.serviceReadback);
  const cloudConsoleReadbackSha256 = sha(cloudConsoleReadback);
  const decision = { schemaVersion: 1, kind: 'sit-google-web-sol-release-decision',
    evidenceClass: 'independent-sol-release-review', syntheticFixture: false, decision: 'approved', sourceCommit,
    buildVersion: '1.0.0+1', serviceAccountReadbackSha256, cloudConsoleReadbackSha256,
    configurationSha256, projectId, webAppId: appId, apiKeyResourceId: cloudConsoleReadback.apiKeyResourceId,
    decidedAtUtc: at, validUntilUtc: new Date(fixedNowMs() + 10 * 60 * 1000).toISOString() };
  const envelope = { schemaVersion: 1, kind: 'sit-google-web-current-readback',
    evidenceClass: 'direct-authoritative-provider-runtime-and-console-readback', syntheticFixture: false,
    sourceCommit, buildVersion: '1.0.0+1', configuration: collected.configuration, configurationSha256,
    serviceAccountReadback: collected.serviceReadback, serviceAccountReadbackSha256,
    cloudConsoleReadback, cloudConsoleReadbackSha256, decision, decisionSha256: sha(decision) };
  assert.equal(bindGoogleWebCurrentReadback(envelope, sha(envelope), {
    now: fixedNow(), expectedSource: sourceCommit, expectedVersion: '1.0.0+1',
  }).config.projectId, projectId);
});

test('records enabled Apple/Facebook states for independent readiness binding and rejects malformed reads', async () => {
  const appleUrl = `https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}/defaultSupportedIdpConfigs/apple.com`;
  const facebookUrl = `https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}/defaultSupportedIdpConfigs/facebook.com`;
  const enabled = await collect(dependencies({ apiOverrides: {
    [appleUrl]: { name: `projects/${projectNumber}/defaultSupportedIdpConfigs/apple.com`, enabled: true },
    [`https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}/defaultSupportedIdpConfigs/facebook.com`]: {
      name: `projects/${projectNumber}/defaultSupportedIdpConfigs/facebook.com`, enabled: true },
  } }));
  assert.equal(enabled.serviceReadback.appleProviderEnabled, true);
  assert.equal(enabled.serviceReadback.facebookProviderEnabled, true);
  await assert.rejects(collect(dependencies({ apiOverrides: {
    [appleUrl]: { name: `projects/${projectNumber}/defaultSupportedIdpConfigs/apple.com`, enabled: 'true' },
  } })), { message: 'google_web_v3_producer_denied' });
});

test('fails closed when project/app identity drifts or runtime CAS changes', async () => {
  await assert.rejects(collect(dependencies({ apiOverrides: {
    [`https://firebase.googleapis.com/v1beta1/projects/${projectNumber}/webApps/${appId}`]: { appId, projectId: 'wrong', state: 'ACTIVE' },
  } })), { message: 'google_web_v3_producer_denied' });
  await assert.rejects(collect(dependencies({ executeOverride: () => 'not-json' })), { message: 'google_web_v3_producer_denied' });
});

test('rejects stale, wrong-account, wrong-project, wrong-service and wrong-URL Console proofs before network reads', async () => {
  const variants = [
    proof => { proof.readAtUtc = '2026-10-31T09:00:00.000Z'; proof.validUntilUtc = '2026-10-31T11:00:00.000Z'; },
    proof => { proof.validUntilUtc = '2026-10-31T13:31:00.000Z'; },
    proof => { proof.operatorAccountEmailSha256 = '0'.repeat(64); },
    proof => { proof.projectId = 'other-project'; },
    proof => { proof.projectNumber = '999999999999'; },
    proof => { proof.services[1].serviceName = 'other.googleapis.com'; },
    proof => { proof.services[1].state = 'DISABLED'; },
    proof => { proof.services[1].consoleUrl = 'https://console.cloud.google.com/'; },
    proof => { proof.services.push({ ...proof.services[1] }); },
  ];
  for (const mutate of variants) {
    const proof = structuredClone(serviceUsageConsoleProof); mutate(proof);
    let requests = 0;
    await assert.rejects(collect({ serviceUsageConsoleText: JSON.stringify(proof),
      fetchImpl: async () => { requests++; throw new Error('unexpected network'); } }),
    { message: 'google_web_v3_producer_denied' });
    assert.equal(requests, 0);
  }
});

test('Service Usage 403 is no longer called or needed when current Console proof is supplied', async () => {
  const seen = [];
  const deps = dependencies({ statusOverrides: {
    [`https://serviceusage.googleapis.com/v1/projects/${projectNumber}/services/identitytoolkit.googleapis.com`]: 403,
    [`https://serviceusage.googleapis.com/v1/projects/${projectNumber}/services/securetoken.googleapis.com`]: 403,
  }, onRequest: url => seen.push(url.hostname) });
  await collect(deps);
  assert.equal(seen.includes('serviceusage.googleapis.com'), false);
});

test('request adapter refuses unexpected or Service Usage GET before transport', async () => {
  let calls = 0;
  const request = requestClient({ fetchImpl: async () => { calls++; return { status: 200, text: async () => '{}' }; } });
  for (const url of [
    `https://serviceusage.googleapis.com/v1/projects/${projectNumber}/services/securetoken.googleapis.com`,
    'https://identitytoolkit.googleapis.com/admin/v2/projects/shareittoo-staging/unexpected',
  ]) {
    await assert.rejects(request({ method: 'GET', url, headers: {} }), { message: 'google_web_v3_producer_denied' });
  }
  assert.equal(calls, 0);
});

test('accepts only Apple/Facebook 404 as absent and disabled; Google and other errors remain fatal', async () => {
  const apple = `https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}/defaultSupportedIdpConfigs/apple.com`;
  const facebook = `https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}/defaultSupportedIdpConfigs/facebook.com`;
  const google = `https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}/defaultSupportedIdpConfigs/google.com`;
  const absent = await collect(dependencies({ statusOverrides: { [apple]: 404, [facebook]: 404 } }));
  assert.equal(absent.serviceReadback.appleProviderEnabled, false);
  assert.equal(absent.serviceReadback.facebookProviderEnabled, false);
  await assert.rejects(collect(dependencies({ statusOverrides: { [google]: 404 } })),
    { message: 'google_web_v3_producer_denied' });
  for (const status of [403, 500]) {
    await assert.rejects(collect(dependencies({ statusOverrides: { [apple]: status } })),
      { message: 'google_web_v3_producer_denied' });
  }
});

test('CLI writes the two canonical assembler inputs plus a protected service-usage binding', async t => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sit-google-v3-producer-')));
  const outputDir = path.join(root, 'out'); fs.mkdirSync(outputDir, { mode: 0o700 }); fs.chmodSync(outputDir, 0o700);
  const credentialFile = path.join(root, 'service-account.json');
  fs.writeFileSync(credentialFile, serviceAccountText, { mode: 0o600 }); fs.chmodSync(credentialFile, 0o600);
  const consoleProofFile = path.join(root, 'service-usage-console.json');
  fs.writeFileSync(consoleProofFile, serviceUsageConsoleText, { mode: 0o600 }); fs.chmodSync(consoleProofFile, 0o600);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const argv = ['--output-dir', outputDir, '--service-account-file', credentialFile,
    '--runtime-container-id', runtimeContainerId, '--source-commit', sourceCommit, '--image-digest', imageDigest,
    '--service-usage-console-file', consoleProofFile];
  const outputs = await runGoogleWebV3InputProducer(argv, { ...dependencies(), now: fixedNow, nowMs: fixedNowMs });
  assert.deepEqual(outputs.map(value => path.basename(value.path)), [
    'configuration.json', 'service-readback.json', 'service-usage-binding.json',
  ]);
  for (const output of outputs) {
    const stat = fs.lstatSync(output.path);
    assert.equal(stat.isFile(), true); assert.equal(stat.nlink, 1); assert.equal(stat.uid, process.getuid());
    assert.equal(stat.mode & 0o777, 0o600);
    const text = fs.readFileSync(output.path, 'utf8');
    assert.equal(JSON.stringify(JSON.parse(text)), text);
  }
  const binding = JSON.parse(fs.readFileSync(path.join(outputDir, 'service-usage-binding.json'), 'utf8'));
  assert.deepEqual(Object.keys(binding).sort(), ['consoleReadbackSha256', 'evidenceClass', 'kind',
    'projectId', 'projectNumber', 'readAtUtc', 'schemaVersion', 'serviceReadbackSha256',
    'syntheticFixture', 'validUntilUtc'].sort());
  assert.equal(binding.consoleReadbackSha256, sha256(serviceUsageConsoleText));
  assert.equal(binding.serviceReadbackSha256, outputs[1].sha256);
  await assert.rejects(runGoogleWebV3InputProducer(argv, { ...dependencies(), now: fixedNow, nowMs: fixedNowMs }),
    { message: 'google_web_v3_producer_denied' });
});
