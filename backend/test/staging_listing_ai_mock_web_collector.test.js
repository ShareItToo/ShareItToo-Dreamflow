import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { LISTING_AI_MOCK_DISCLOSURE_TEXT, LISTING_AI_MOCK_DISCLOSURE_VERSION,
  bindListingAiMockWebReadiness, readListingAiMockWebReadiness } from '../../tool/staging_listing_ai_mock_web_readiness.mjs';
import { createStagingListingAiMockWebCollector, STAGING_LISTING_AI_MOCK_WEB_CAPABILITY_URL }
  from '../ops/staging_listing_ai_mock_web_collector.mjs';
import { dockerRuntimeReader, runStagingListingAiMockWebReadinessCli }
  from '../ops/staging_listing_ai_mock_web_readiness_cli.mjs';

const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
const sourceRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const sourceCommit = execFileSync('git', ['-C', sourceRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const clientVersion = /^version:\s*(\d+\.\d+\.\d+\+\d+)\s*$/mu.exec(fs.readFileSync(path.join(sourceRoot, 'pubspec.yaml'), 'utf8'))[1];
const token = `sit_mock_${'x'.repeat(32)}`;
const runtime = { environment: 'staging', runtimeCommit: 'b'.repeat(40), imageDigest: `sha256:${'c'.repeat(64)}`,
  environmentEntries: [
    'SIT_STAGING_LISTING_AI_PROFILE=staging-mock-v1', 'SIT_LISTING_AI_PROVIDER=mock',
    'SIT_LISTING_AI_MODEL=listing-ai-mock-v1', 'SIT_LISTING_AI_BUDGET_CENTS=0',
    'SIT_LISTING_AI_STAGING_SMOKE_BUDGET_CENTS=0', 'SIT_LISTING_AI_STAGING_SMOKE_ACTIVATION_ID=',
    'SIT_LISTING_AI_EXTERNAL_EXECUTION_APPROVED=0', 'OPENAI_API_KEY=', 'OPENAI_API_KEY_FILE=',
    'SIT_STAGING_PILOT_ID=heilbronn_wave0', 'SIT_STAGING_ACCESS_GATE_ENABLED=true',
    'SIT_STAGING_ALLOWED_USER_IDS=qa_user_12345', 'SIT_STAGING_COMPOSE_PROJECT=sit-green',
    'DEPLOYMENT_ENVIRONMENT=test',
  ] };
const configuration = { environment: 'staging', provider: 'mock', model: 'listing-ai-mock-v1', budgetCents: 0,
  externalProviderExecutionAllowed: false, automaticPublicationAllowed: false, productionEligible: false,
  runtimeCommit: runtime.runtimeCommit, imageDigest: runtime.imageDigest };
const configurationSha256 = sha(JSON.stringify(configuration));
const apiCapability = (overrides = {}) => ({ available: true, provider: 'mock', mode: 'mock', model: 'listing-ai-mock-v1',
  budgetCents: 0, externalProviderExecutionAllowed: false, automaticPublicationAllowed: false, productionEligible: false,
  supportedClientVersion: clientVersion, runtimeCommit: runtime.runtimeCommit, imageDigest: runtime.imageDigest,
  disclosureVersion: LISTING_AI_MOCK_DISCLOSURE_VERSION, disclosureText: LISTING_AI_MOCK_DISCLOSURE_TEXT,
  disclosureHash: sha(LISTING_AI_MOCK_DISCLOSURE_TEXT), configRevision: sha('revision'),
  configurationSha256, ...overrides });
function collector(overrides = {}) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    const body = overrides.responseBody ?? apiCapability();
    return { status: overrides.status ?? 200,
      text: async () => JSON.stringify(overrides.leakToken ? { echo: token } : body) };
  };
  return { calls, value: createStagingListingAiMockWebCollector({ token, sourceCommit, clientVersion,
    runtimeReader: overrides.runtimeReader ?? (() => runtime), fetchImpl: overrides.fetchImpl ?? fetchImpl,
    now: overrides.now ?? (() => Date.parse('2026-10-31T12:00:00.000Z')) }) };
}

test('collector creates canonical authenticated readback accepted by the readiness binder', async () => {
  const { calls, value } = collector();
  const result = await value.collect();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, STAGING_LISTING_AI_MOCK_WEB_CAPABILITY_URL);
  assert.equal(calls[0].options.method, 'GET');
  assert.equal(calls[0].options.redirect, 'error');
  assert.equal(calls[0].options.credentials, 'omit');
  assert.equal(calls[0].options.headers.authorization, `Bearer ${token}`);
  assert.equal(calls[0].options.body, undefined);
  assert.equal(result.json, JSON.stringify(result.evidence));
  assert.equal(result.bytes.toString('utf8'), result.json);
  assert.equal(result.sha256, sha(result.bytes));
  assert.equal(result.bytes.includes(Buffer.from(token)), false);
  assert.equal(result.evidence.web.sourceCommit, sourceCommit);
  assert.equal(result.evidence.web.clientVersion, clientVersion);
  assert.equal(result.evidence.runtime.runtimeCommit, runtime.runtimeCommit);
  assert.equal(result.evidence.runtime.imageDigest, runtime.imageDigest);
  assert.equal(result.evidence.configurationSha256, configurationSha256);
  assert.equal(Date.parse(result.evidence.validUntilUtc) - Date.parse(result.evidence.collectedAtUtc), 15 * 60_000);
  assert.doesNotThrow(() => bindListingAiMockWebReadiness(result.evidence, sha(result.json), {
    now: new Date('2026-10-31T12:00:00.000Z'), expectedSource: sourceCommit, expectedVersion: clientVersion,
  }));
});

test('collector rejects API drift, auth failures, secret echoes, and runtime drift', async () => {
  const cases = [
    { status: 401 },
    { responseBody: apiCapability({ provider: 'openai' }) },
    { responseBody: apiCapability({ runtimeCommit: 'd'.repeat(40) }) },
    { responseBody: apiCapability({ configurationSha256: sha('foreign') }) },
    { responseBody: apiCapability({ disclosureHash: sha('foreign') }) },
    { leakToken: true },
    { runtimeReader: (() => { let read = 0; return () => ++read < 2 ? runtime : { ...runtime, imageDigest: `sha256:${'e'.repeat(64)}` }; })() },
    { runtimeReader: () => ({ ...runtime, environmentEntries: runtime.environmentEntries.map((entry) =>
      entry === 'SIT_LISTING_AI_PROVIDER=mock' ? 'SIT_LISTING_AI_PROVIDER=openai' : entry) }) },
  ];
  for (const options of cases) {
    const { value } = collector(options);
    await assert.rejects(value.collect(), /staging_listing_ai_mock_web_not_verified/u);
  }
  const { value } = collector({ fetchImpl: async (_url, options) => {
    assert.equal(options.method, 'GET');
    return { status: 302, text: async () => '{}' };
  } });
  await assert.rejects(value.collect(), /staging_listing_ai_mock_web_not_verified/u);
});

test('Docker runtime reader binds the running promoted container to its image revision and repository digest', () => {
  const container = { Id: 'a'.repeat(64), Name: '/shareittoo-staging-api', Image: `sha256:${'c'.repeat(64)}`,
    State: { Running: true }, Config: { Labels: {
      'com.shareittoo.sit.green': 'true', 'org.opencontainers.image.revision': runtime.runtimeCommit,
    }, Env: runtime.environmentEntries } };
  const image = { Id: container.Image, Config: { Labels: { 'org.opencontainers.image.revision': runtime.runtimeCommit } },
    RepoDigests: [`ghcr.io/shareittoo/shareittoo-api@${runtime.imageDigest}`] };
  let inspections = 0;
  const execute = (_command, args) => {
    if (args[0] === 'image') return JSON.stringify(image);
    inspections += 1;
    return JSON.stringify(container);
  };
  assert.deepEqual(dockerRuntimeReader(execute), { environment: 'staging', runtimeCommit: runtime.runtimeCommit,
    imageDigest: runtime.imageDigest, environmentEntries: runtime.environmentEntries });
  assert.equal(inspections, 2);
  assert.throws(() => dockerRuntimeReader((_command, args) => {
    if (args[0] === 'image') return JSON.stringify({ ...image, RepoDigests: [] });
    return JSON.stringify(container);
  }), /staging_listing_ai_mock_web_not_verified/u);
});

test('CLI writes owner-only canonical evidence and returns the binder SHA', async (t) => {
  const output = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sit-listing-ai-mock-ready-')));
  fs.chmodSync(output, 0o700);
  t.after(() => fs.rmSync(output, { recursive: true, force: true }));
  let calls = 0;
  const result = await runStagingListingAiMockWebReadinessCli([
    '--source-commit', sourceCommit, '--client-version', clientVersion,
    '--session-file', '/unused-in-injected-test', '--evidence-dir', output, '--run-id', 'focused-test',
  ], { repositoryRoot: sourceRoot, token, runtimeReader: () => runtime,
    now: () => Date.parse('2026-10-31T12:00:00.000Z'),
    fetchImpl: async (url, options) => { calls += 1; assert.equal(String(url), STAGING_LISTING_AI_MOCK_WEB_CAPABILITY_URL);
      assert.equal(options.method, 'GET'); return { status: 200, text: async () => JSON.stringify(apiCapability()) }; } });
  assert.equal(calls, 1);
  assert.equal(result.mode, '0600');
  const bytes = fs.readFileSync(result.file);
  assert.equal(sha(bytes), result.sha256);
  assert.equal(fs.statSync(result.file).mode & 0o777, 0o600);
  assert.equal(fs.statSync(output).mode & 0o777, 0o700);
  const evidence = JSON.parse(bytes.toString('utf8'));
  assert.doesNotThrow(() => readListingAiMockWebReadiness(result.file, result.sha256,
    { now: new Date('2026-10-31T12:00:00.000Z'), expectedSource: sourceCommit, expectedVersion: clientVersion }));
  assert.equal(evidence.syntheticFixture, false);
});
