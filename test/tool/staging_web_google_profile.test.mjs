import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { TARGET, bindGoogleWebConfig, inventory, readGoogleWebConfig, profile,
  sealArtifact, sha256, validateArtifact, stagingBootstrapFor } from '../../tool/staging_web_contract.mjs';
import { GOOGLE_WEB_PROFILE_V2, bindGoogleWebReadiness,
  readGoogleWebReadiness } from '../../tool/staging_google_web_readiness.mjs';
import { GOOGLE_WEB_PROFILE_V3, bindGoogleWebCurrentReadback,
  readGoogleWebCurrentReadback } from '../../tool/staging_google_web_current_readback.mjs';
import { syntheticGoogleBinding, syntheticGoogleConfig,
  syntheticGoogleEvidence } from './staging_google_web_readiness_fixture.mjs';
import { syntheticGoogleCurrentEvidence } from './staging_google_web_current_readback_fixture.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = 'a'.repeat(40);
const version = '1.0.0+2026092905';
// Explicitly synthetic public SDK options; no provider call or real credential.
function config() {
  return syntheticGoogleConfig();
}
function legacyBound() { const value = config(); return bindGoogleWebConfig(value, sha256(JSON.stringify(value))); }
function bound() { return syntheticGoogleBinding(source); }
function temp(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sit-google-profile-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
function makeArtifact(t, googleWeb = bound(), artifactVersion = version) {
  const directory = temp(t); fs.mkdirSync(path.join(directory, 'web'));
  for (const [file, bytes] of Object.entries({ 'index.html': '<script src="flutter_bootstrap.js" async></script>',
    'main.dart.js': 'synthetic compiled output', 'manifest.json': '{}', 'flutter_bootstrap.js': 'bootstrap();' })) {
    fs.writeFileSync(path.join(directory, 'web', file), bytes);
  }
  const hash = sealArtifact({ directory, source, version: artifactVersion, builderDigest: 'b'.repeat(64), flutterVersion: { frameworkVersion: 'synthetic' }, googleWeb });
  return { directory, hash, googleWeb };
}
function rewriteManifest(directory, mutate) {
  const file = path.join(directory, 'staging-web-manifest.json');
  const value = JSON.parse(fs.readFileSync(file)); mutate(value);
  fs.writeFileSync(file, JSON.stringify(value)); return sha256(fs.readFileSync(file));
}
function rewriteAsHistoricalV2(directory) {
  const file = path.join(directory, 'staging-web-manifest.json');
  const current = JSON.parse(fs.readFileSync(file));
  const googleWeb = legacyBound();
  const historicalProfile = profile(source, version, googleWeb);
  fs.writeFileSync(path.join(directory, 'web/staging_bootstrap.js'),
    stagingBootstrapFor(source, version, googleWeb));
  fs.writeFileSync(path.join(directory, 'web/staging-release.json'), `${JSON.stringify({
    target: TARGET, source, version,
    profileDigest: sha256(JSON.stringify(historicalProfile)),
  })}\n`);
  const manifest = {
    schemaVersion: 2,
    bootstrapContractVersion: 2,
    profileContractVersion: 'staging-google-web-v1',
    googleWebConfigDigest: googleWeb.digest,
    target: current.target,
    api: current.api,
    source: current.source,
    version: current.version,
    sourceClean: current.sourceClean,
    mode: current.mode,
    pwaStrategy: current.pwaStrategy,
    resourcesCdn: current.resourcesCdn,
    flutterVersion: current.flutterVersion,
    builderDigest: current.builderDigest,
    profile: historicalProfile,
    files: inventory(path.join(directory, 'web')),
  };
  fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
  const hash = sha256(fs.readFileSync(file));
  fs.writeFileSync(path.join(directory, 'SHA256SUMS'),
    `${hash}  staging-web-manifest.json\n${Object.entries(manifest.files)
      .map(([name, digest]) => `${digest}  web/${name}\n`).join('')}`);
  return hash;
}

test('Google successor binds the same canonical digest and compile-time fields as the Dart runtime', () => {
  const googleWeb = bound(); const p = profile(source, version, googleWeb);
  assert.equal(p.SIT_SOCIAL_GOOGLE_ENABLED, 'true');
  assert.equal(p.SIT_SOCIAL_PROVIDER_ACTIVATION_VALIDATED, 'true');
  assert.equal(p.SIT_SOCIAL_APPLE_ENABLED, 'false'); assert.equal(p.SIT_SOCIAL_FACEBOOK_ENABLED, 'false');
  assert.equal(p.SIT_FIREBASE_WEB_CONFIG_SHA256, googleWeb.configDigest);
  // Frozen synthetic public-config vector protects the cross-runtime format.
  assert.equal(googleWeb.configDigest, '2d45d33c8cf81d7fe51c7daea8ddb4bb749dc868e08b3d61a94ae3e93ab814fd');
  assert.equal(p.SIT_GOOGLE_WEB_READINESS_SHA256, googleWeb.readinessDigest);
  assert.equal(p.SIT_GOOGLE_WEB_DECISION_SHA256, googleWeb.decisionDigest);
  assert.equal(p.SIT_GOOGLE_WEB_EVIDENCE_SHA256, googleWeb.evidenceDigest);
  assert.equal(p.SIT_FIREBASE_PROJECT_ID, googleWeb.config.projectId);
  assert.equal(p.SIT_FIREBASE_MESSAGING_SENDER_ID, googleWeb.config.messagingSenderId);
  assert.equal(p.SIT_FIREBASE_WEB_APP_ID, googleWeb.config.appId);
  assert.equal(p.SIT_FIREBASE_WEB_API_KEY, googleWeb.config.apiKey);
  assert.equal(p.SIT_FIREBASE_WEB_AUTH_DOMAIN, googleWeb.config.authDomain);
  assert.equal(p.SIT_FIREBASE_WEB_BACKEND_PROJECT_ID, googleWeb.config.backendProjectId);
  assert.equal(p.SIT_FIREBASE_WEB_AUTHORIZED_ORIGIN, TARGET);
  for (const [key, value] of Object.entries(profile(source, version))) {
    if (!['SIT_SOCIAL_GOOGLE_ENABLED', 'SIT_SOCIAL_PROVIDER_ACTIVATION_VALIDATED'].includes(key)) assert.equal(p[key], value, key);
  }
  const dart = fs.readFileSync(path.join(repo, 'lib/services/web_google_auth.dart'), 'utf8');
  const publicConfigBody = dart.match(/Map<String, String> get _publicConfig => \{([\s\S]*?)\n\s*\};/u)?.[1] ?? '';
  const keyOrder = [...publicConfigBody.matchAll(/^\s*'([A-Za-z]+)': [A-Za-z]+,$/gm)].map((match) => match[1]);
  assert.deepEqual(keyOrder, Object.keys(googleWeb.config));
  const runtime = fs.readFileSync(path.join(repo, 'lib/services/firebase_runtime.dart'), 'utf8');
  for (const key of Object.keys(p).filter((key) => key.startsWith('SIT_FIREBASE_'))) assert.ok(runtime.includes(`'${key}'`), key);
});

function currentBinding(evidence, now = evidence.now, expectedSource = source, expectedVersion = version) {
  return bindGoogleWebCurrentReadback(evidence.envelope, evidence.digest,
    { now, expectedSource, expectedVersion });
}
function rehashCurrent(evidence) {
  const hash = value => sha256(JSON.stringify(value));
  evidence.envelope.serviceAccountReadbackSha256 = hash(evidence.envelope.serviceAccountReadback);
  evidence.envelope.cloudConsoleReadbackSha256 = hash(evidence.envelope.cloudConsoleReadback);
  evidence.envelope.decision.serviceAccountReadbackSha256 = evidence.envelope.serviceAccountReadbackSha256;
  evidence.envelope.decision.cloudConsoleReadbackSha256 = evidence.envelope.cloudConsoleReadbackSha256;
  evidence.envelope.decisionSha256 = hash(evidence.envelope.decision);
  evidence.envelope.configurationSha256 = hash(evidence.envelope.configuration);
  evidence.envelope.decision.configurationSha256 = evidence.envelope.configurationSha256;
  evidence.bytes = Buffer.from(JSON.stringify(evidence.envelope)); evidence.digest = sha256(evidence.bytes);
}
test('current-readback v3 binds source/version, live runtime, direct provider+console evidence, exact APIs/origins and Sol decision', (t) => {
  const evidence = syntheticGoogleCurrentEvidence(source, version);
  const googleWeb = currentBinding(evidence);
  assert.equal(googleWeb.profileContractVersion, GOOGLE_WEB_PROFILE_V3);
  assert.notEqual(evidence.service.runtime.commit, source, 'live API runtime may predate this Web source');
  const p = profile(source, version, googleWeb);
  assert.equal(p.SIT_SOCIAL_GOOGLE_ENABLED, 'true');
  assert.equal(p.SIT_SOCIAL_PROVIDER_ACTIVATION_VALIDATED, 'true');
  assert.equal(p.SIT_SOCIAL_APPLE_ENABLED, 'false'); assert.equal(p.SIT_SOCIAL_FACEBOOK_ENABLED, 'false');
  assert.equal(p.SIT_GOOGLE_WEB_READINESS_JSON, JSON.stringify(evidence.envelope));
  assert.equal(p.SIT_GOOGLE_WEB_EVIDENCE_SHA256, evidence.digest);
  const f = makeArtifact(t, googleWeb, version);
  const manifest = validateArtifact(f.directory, f.hash, source);
  assert.equal(manifest.schemaVersion, 9);
  assert.equal(manifest.profileContractVersion, GOOGLE_WEB_PROFILE_V3);
  assert.equal(manifest.googleWebServiceAccountReadbackSha256, evidence.envelope.serviceAccountReadbackSha256);
  assert.equal(manifest.googleWebCloudConsoleReadbackSha256, evidence.envelope.cloudConsoleReadbackSha256);
  assert.equal(manifest.profile.SIT_SOCIAL_APPLE_ENABLED, 'false');
  assert.equal(manifest.profile.SIT_SOCIAL_FACEBOOK_ENABLED, 'false');
});

test('current-readback v3 rejects stale, wrong-build or drifted provider/runtime/console/decision evidence', () => {
  const initial = syntheticGoogleCurrentEvidence(source, version);
  assert.throws(() => currentBinding(initial, initial.now, 'b'.repeat(40)), /google_web_current_/u);
  assert.throws(() => currentBinding(initial, initial.now, source, '1.2.3+other'), /google_web_current_/u);
  assert.throws(() => currentBinding(initial, new Date(initial.now.getTime() + 2 * 60 * 60_000)), /google_web_current_expired/u);
  for (const mutate of [
    e => { e.serviceAccountReadback.projectState = 'DISABLED'; },
    e => { e.serviceAccountReadback.webAppPresent = false; },
    e => { e.serviceAccountReadback.authorizedDomains = ['other.example']; },
    e => { e.serviceAccountReadback.googleProviderEnabled = false; },
    e => { e.serviceAccountReadback.appleProviderEnabled = true; },
    e => { e.serviceAccountReadback.facebookProviderEnabled = true; },
    e => { e.serviceAccountReadback.firebaseAuthEnabled = false; },
    e => { e.serviceAccountReadback.firebaseEmulatorEnabled = true; },
    e => { e.serviceAccountReadback.runtime.service = 'shareittoo-staging-api'; },
    e => { e.serviceAccountReadback.runtime.identity = 'staging-api-container-123'; },
    e => { e.serviceAccountReadback.runtime.commit = 'C'.repeat(40); },
    e => { e.serviceAccountReadback.runtime.image = 'mutable:tag'; },
    e => { e.cloudConsoleReadback.operatorAccountEmailSha256 = '0'.repeat(64); },
    e => { e.cloudConsoleReadback.apiKeyResourceId = 'projects/999999999999/locations/global/keys/not-bound'; },
    e => { e.cloudConsoleReadback.apiKeySha256 = '0'.repeat(64); },
    e => { e.cloudConsoleReadback.apiRestrictions.pop(); },
    e => { e.cloudConsoleReadback.websiteRestrictions.pop(); },
    e => { e.serviceAccountReadback.keyInventorySha256 = '0'.repeat(64); },
  ]) {
    const evidence = syntheticGoogleCurrentEvidence(source, version);
    mutate(evidence.envelope); rehashCurrent(evidence);
    assert.throws(() => currentBinding(evidence), /google_web_current_/u);
  }
  const wronglyCombined = currentBinding(initial);
  assert.throws(() => profile(source, version, wronglyCombined, { synthetic: true }), /google_web_current_provider_mask/u);
});

test('current-readback v3 file reader enforces the existing owner-protected input contract', (t) => {
  const root = temp(t); const file = path.join(root, 'current-readback.json');
  const evidence = syntheticGoogleCurrentEvidence(source, version);
  fs.writeFileSync(file, evidence.bytes, { mode: 0o600 });
  assert.equal(readGoogleWebCurrentReadback(file, evidence.digest,
    { now: evidence.now, expectedSource: source, expectedVersion: version }).profileContractVersion,
  GOOGLE_WEB_PROFILE_V3);
  fs.chmodSync(file, 0o644);
  assert.throws(() => readGoogleWebCurrentReadback(file, evidence.digest,
    { now: evidence.now, expectedSource: source, expectedVersion: version }), /google_web_readiness_file/u);
  fs.chmodSync(file, 0o600);
  const alias = path.join(root, 'alias'); fs.symlinkSync(file, alias);
  assert.throws(() => readGoogleWebCurrentReadback(alias, evidence.digest,
    { now: evidence.now, expectedSource: source, expectedVersion: version }));
});

for (const field of Object.keys(config())) {
  test(`missing, wrong-type and empty public config field rejected: ${field}`, () => {
    for (const variant of ['missing', 'number', 'empty']) {
      const value = config();
      if (variant === 'missing') delete value[field]; else value[field] = variant === 'number' ? 123 : '';
      assert.throws(() => bindGoogleWebConfig(value, sha256(JSON.stringify(value))), /google_web_config_/);
    }
  });
}
test('config rejects extras, mismatched identities/origin, malformed values and absent/wrong approval digest', () => {
  for (const delta of [{ extra: 'value' }, { private_key: 'never accepted' }, { backendProjectId: 'other-project' },
    { authorizedOrigin: 'https://shareittoo.com' }, { authorizedOrigin: `${TARGET}/` }, { authDomain: 'evil.invalid' },
    { appId: `1:999999999999:web:${'a'.repeat(32)}` }, { apiKey: 'bad' }, { projectId: 'a=b,c' }]) {
    const value = { ...config(), ...delta };
    assert.throws(() => bindGoogleWebConfig(value, sha256(JSON.stringify(value))), /google_web_config_/);
  }
  for (const digest of [undefined, '', 'b'.repeat(64)]) assert.throws(() => bindGoogleWebConfig(config(), digest), /digest_mismatch/);
  for (const value of [null, [], 'text']) assert.throws(() => bindGoogleWebConfig(value, 'b'.repeat(64)), /shape/);
  assert.throws(() => profile(source, version, {}), /binding_shape/);
  const reordered = Object.fromEntries(Object.entries(config()).reverse());
  assert.deepEqual(bindGoogleWebConfig(reordered, legacyBound().digest), legacyBound());
});

test('generated v6 artifact binds journal, decision and config; default-off v1 remains valid', (t) => {
  const f = makeArtifact(t); const m = validateArtifact(f.directory, f.hash, source);
  assert.equal(m.schemaVersion, 6); assert.equal(m.profileContractVersion, GOOGLE_WEB_PROFILE_V2);
  assert.equal(m.googleWebConfigDigest, f.googleWeb.configDigest);
  assert.equal(m.googleWebReadinessDigest, f.googleWeb.readinessDigest);
  assert.equal(m.googleWebDecisionDigest, f.googleWeb.decisionDigest);
  assert.equal(m.googleWebEvidenceDigest, f.googleWeb.evidenceDigest);
  const release = JSON.parse(fs.readFileSync(path.join(f.directory, 'web/staging-release.json')));
  assert.equal(release.profileDigest, sha256(JSON.stringify(m.profile)));
  assert.notEqual(release.profileDigest, sha256(JSON.stringify(profile(source, version))));
  assert.equal(fs.readFileSync(path.join(f.directory, 'web/staging_bootstrap.js'), 'utf8'), stagingBootstrapFor(source, version, f.googleWeb));
  const old = makeArtifact(t, null); const legacy = validateArtifact(old.directory, old.hash, source);
  assert.equal(legacy.schemaVersion, 1); assert.equal(legacy.profile.SIT_SOCIAL_GOOGLE_ENABLED, 'false');
  assert.equal(Object.hasOwn(legacy, 'googleWebConfigDigest'), false);
});

test('historical Google schema v2 remains current/rollback readable but is never a candidate', (t) => {
  const artifact = makeArtifact(t);
  const hash = rewriteAsHistoricalV2(artifact.directory);
  assert.equal(validateArtifact(artifact.directory, hash, source, { mode: 'current' }).schemaVersion, 2);
  assert.equal(validateArtifact(artifact.directory, hash, source, { mode: 'rollback' }).schemaVersion, 2);
  assert.throws(() => validateArtifact(artifact.directory, hash, source),
    /artifact_google_web_legacy_candidate/);
});
for (const variant of ['googleOff', 'appleOn', 'facebookOn', 'extraDefine',
  'digest', 'readinessDigest', 'decisionDigest', 'evidenceDigest',
  'journalDigest', 'finalRecordDigest', 'readinessJson', 'decisionJson',
  'config', 'version', 'downgrade', 'bootstrap']) {
  test(`rehashed successor refuses profile/config drift: ${variant}`, (t) => {
    const f = makeArtifact(t);
    const hash = rewriteManifest(f.directory, (m) => {
      if (variant === 'googleOff') m.profile.SIT_SOCIAL_GOOGLE_ENABLED = 'false';
      if (variant === 'appleOn') m.profile.SIT_SOCIAL_APPLE_ENABLED = 'true';
      if (variant === 'facebookOn') m.profile.SIT_SOCIAL_FACEBOOK_ENABLED = 'true';
      if (variant === 'extraDefine') m.profile.SIT_FIREBASE_WEB_OTHER = 'extra';
      if (variant === 'digest') m.googleWebConfigDigest = 'b'.repeat(64);
      if (variant === 'readinessDigest') m.googleWebReadinessDigest = 'b'.repeat(64);
      if (variant === 'decisionDigest') m.googleWebDecisionDigest = 'b'.repeat(64);
      if (variant === 'evidenceDigest') m.googleWebEvidenceDigest = 'b'.repeat(64);
      if (variant === 'journalDigest') m.googleWebPrerequisiteJournalSha256 = 'b'.repeat(64);
      if (variant === 'finalRecordDigest') m.googleWebPrerequisiteFinalRecordSha256 = 'b'.repeat(64);
      if (variant === 'readinessJson') m.profile.SIT_GOOGLE_WEB_READINESS_JSON = '{}';
      if (variant === 'decisionJson') m.profile.SIT_GOOGLE_WEB_DECISION_JSON = '{}';
      if (variant === 'config') m.profile.SIT_FIREBASE_WEB_APP_ID = '';
      if (variant === 'version') m.profileContractVersion = 'future';
      if (variant === 'downgrade') m.schemaVersion = 1;
      if (variant === 'bootstrap') delete m.bootstrapContractVersion;
    });
    assert.throws(() => validateArtifact(f.directory, hash, source));
  });
}
test('config input uses stable owner-only regular descriptor and sanitized parser errors', (t) => {
  const root = temp(t); const file = path.join(root, 'public-config.json');
  fs.writeFileSync(file, JSON.stringify(config()), { mode: 0o600 });
  assert.deepEqual(readGoogleWebConfig(file, legacyBound().digest), legacyBound());
  fs.chmodSync(file, 0o644); assert.throws(() => readGoogleWebConfig(file, legacyBound().digest), /config_file/);
  fs.chmodSync(file, 0o600);
  const alias = path.join(root, 'alias'); fs.symlinkSync(file, alias);
  assert.throws(() => readGoogleWebConfig(alias, legacyBound().digest));
  fs.writeFileSync(file, '{private malformed');
  assert.throws(() => readGoogleWebConfig(file, legacyBound().digest), { message: 'google_web_config_json' });
});

test('actual builder CLI accepts only activation-eligible protected Google evidence', (t) => {
  const root = temp(t); const checkout = path.join(root, 'source'); const bin = path.join(root, 'bin');
  fs.mkdirSync(checkout); fs.mkdirSync(bin);
  fs.writeFileSync(path.join(checkout, 'pubspec.yaml'), `version: ${version}\n`);
  fs.writeFileSync(path.join(checkout, '.gitignore'), 'build/\n');
  const git = (...args) => execFileSync('git', ['-C', checkout, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init'); git('add', '.'); git('-c', 'user.name=Synthetic', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'fixture');
  const exactSource = git('rev-parse', 'HEAD');
  const definitionsLog = path.join(root, 'definition-path');
  // Replace external compilation/smoke only; execute the real builder, sealing,
  // source checks, input reader and validator. This is not a Flutter build proof.
  const program = `#!${process.execPath}\nimport fs from 'node:fs';import path from 'node:path';
const name=path.basename(process.argv[1]);
if(name==='flutter')console.log(JSON.stringify({frameworkVersion:'synthetic',frameworkRevision:'fixture',dartSdkVersion:'fixture'}));
if(name==='bash'){
const file=process.argv.find(x=>x.startsWith('--dart-define-from-file=')).split('=')[1];
if((fs.statSync(file).mode&511)!==384)process.exit(2);
const value=JSON.parse(fs.readFileSync(file));
if(value.SIT_SOCIAL_GOOGLE_ENABLED!=='true')process.exit(3);
fs.writeFileSync(process.env.SIT_SYNTHETIC_DEFINES_LOG,file);
fs.mkdirSync('build/web',{recursive:true});
for(const [file,text] of Object.entries({'index.html':'<script src="flutter_bootstrap.js" async></script>','main.dart.js':'synthetic compiled','manifest.json':'{}','flutter_bootstrap.js':'bootstrap();'}))fs.writeFileSync(path.join('build/web',file),text);
}\n`;
  for (const name of ['flutter', 'bash', 'python3']) fs.writeFileSync(path.join(bin, name), program, { mode: 0o755 });
  fs.writeFileSync(path.join(bin, 'package.json'), '{"type":"module"}');
  const evidence = syntheticGoogleEvidence(exactSource);
  const file = path.join(root, 'google-readiness.json');
  fs.writeFileSync(file, evidence.bytes, { mode: 0o600 });
  const output = path.join(root, 'artifact');
  const args = [path.join(repo, 'tool/build_staging_web.mjs'), checkout, exactSource, output, '--google-web-readiness', file, evidence.evidenceDigest];
  const result = spawnSync(process.execPath, args, { encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, SIT_SYNTHETIC_DEFINES_LOG: definitionsLog } });
  assert.equal(result.status, 0, result.stderr);
  const summary = JSON.parse(result.stdout.trim());
  const manifest = validateArtifact(output, summary.manifestHash, exactSource);
  const expected = bindGoogleWebReadiness(evidence.envelope, evidence.evidenceDigest,
    { now: evidence.now, expectedSource: exactSource });
  assert.equal(manifest.schemaVersion, 6); assert.deepEqual(manifest.profile, profile(exactSource, version, expected));
  assert.equal(fs.existsSync(fs.readFileSync(definitionsLog, 'utf8')), false);
  assert.ok(!`${result.stdout}${result.stderr}`.includes(config().apiKey));
  assert.ok(!`${result.stdout}${result.stderr}`.includes(config().projectId));
  const currentEvidence = syntheticGoogleCurrentEvidence(exactSource, version);
  const currentFile = path.join(root, 'google-current-readback.json');
  fs.writeFileSync(currentFile, currentEvidence.bytes, { mode: 0o600 });
  const currentOutput = path.join(root, 'artifact-current');
  const currentArgs = [path.join(repo, 'tool/build_staging_web.mjs'), checkout, exactSource, currentOutput,
    '--google-web-current-readback', currentFile, currentEvidence.digest];
  const currentResult = spawnSync(process.execPath, currentArgs, { encoding: 'utf8',
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, SIT_SYNTHETIC_DEFINES_LOG: definitionsLog } });
  assert.equal(currentResult.status, 0, currentResult.stderr);
  const currentSummary = JSON.parse(currentResult.stdout.trim());
  const currentManifest = validateArtifact(currentOutput, currentSummary.manifestHash, exactSource);
  const expectedCurrent = bindGoogleWebCurrentReadback(currentEvidence.envelope, currentEvidence.digest,
    { now: currentEvidence.now, expectedSource: exactSource, expectedVersion: version });
  assert.equal(currentManifest.schemaVersion, 9);
  const expectedBuilderDigest = sha256(Buffer.concat([
    'build_staging_web.mjs', 'staging_web_contract.mjs', 'staging_google_web_readiness.mjs',
    'staging_google_web_current_readback.mjs', 'staging_apple_web_readiness.mjs',
    'staging_facebook_web_readiness.mjs', 'staging_password_enrollment_web_readiness.mjs',
    'staging_listing_ai_web_readiness.mjs',
  ].map((name) => fs.readFileSync(path.join(repo, 'tool', name)))));
  assert.equal(currentManifest.builderDigest, expectedBuilderDigest);
  assert.deepEqual(currentManifest.profile, profile(exactSource, version, expectedCurrent));
  const conflictArgs = [...currentArgs, '--google-web-readiness', file, evidence.evidenceDigest];
  const conflict = spawnSync(process.execPath, conflictArgs, { encoding: 'utf8' });
  assert.equal(conflict.status, 1); assert.match(conflict.stderr, /google_web_input_conflict/);
  const badArgs = [...args]; badArgs[3] = path.join(root, 'rejected'); badArgs[6] = 'b'.repeat(64);
  const bad = spawnSync(process.execPath, badArgs, { encoding: 'utf8' });
  assert.equal(bad.status, 1); assert.match(bad.stderr, /google_web_evidence_digest_mismatch/);
  assert.equal(fs.existsSync(badArgs[3]), false);
});

test('activation evidence rejects pending, stale, replayed and independently mismatched claims', (t) => {
  const root = temp(t);
  const valid = syntheticGoogleEvidence(source);
  const file = path.join(root, 'readiness.json');
  fs.writeFileSync(file, valid.bytes, { mode: 0o600 });
  assert.deepEqual(readGoogleWebReadiness(file, valid.evidenceDigest,
    { now: valid.now, expectedSource: source }), bindGoogleWebReadiness(valid.envelope, valid.evidenceDigest,
    { now: valid.now, expectedSource: source }));
  const pending = {
    schemaVersion: 1,
    kind: valid.envelope.kind,
    evidenceClass: 'verified-prerequisite-journal',
    syntheticFixture: false,
    activationDecision: 'pending-independent-review',
    activationEligible: false,
    configuration: valid.envelope.configuration,
    configurationSha256: valid.envelope.configurationSha256,
    readiness: valid.envelope.readiness,
    readinessSha256: valid.envelope.readinessSha256,
  };
  const selfDeclared = { ...pending, activationDecision: 'approved-independent-review',
    activationEligible: true };
  assert.throws(() => bindGoogleWebReadiness(selfDeclared,
    sha256(JSON.stringify(selfDeclared)), { now: valid.now, expectedSource: source }),
  /google_web_readiness_shape/);
  const changes = [
    (value) => { value.activationEligible = false; },
    (value) => { value.activationDecision = 'pending-independent-review'; },
    (value) => { value.readiness.webAppId = `1:123456789012:web:${'b'.repeat(32)}`; },
    (value) => { value.readiness.authorizedDomain = 'foreign.invalid'; },
    (value) => { value.readiness.firebaseProviderId = 'facebook.com'; },
    (value) => { value.readiness.prerequisiteJournalSha256 = 'b'.repeat(64); },
    (value) => { value.configuration.apiKey = ['AI', 'za', 'y'.repeat(35)].join(''); },
  ];
  for (const mutate of changes) {
    const value = structuredClone(valid.envelope);
    mutate(value);
    value.configurationSha256 = sha256(JSON.stringify(value.configuration));
    value.readinessSha256 = sha256(JSON.stringify(value.readiness));
    assert.throws(() => bindGoogleWebReadiness(value, sha256(JSON.stringify(value)),
      { now: valid.now, expectedSource: source }));
  }
  assert.throws(() => bindGoogleWebReadiness(valid.envelope, valid.evidenceDigest,
    { now: new Date(valid.now.getTime() + 3 * 60 * 60_000), expectedSource: source }),
  /google_web_readiness_invalid|google_web_decision_invalid/);
  assert.throws(() => bindGoogleWebReadiness(valid.envelope, valid.evidenceDigest,
    { now: valid.now, expectedSource: 'b'.repeat(40) }), /google_web_readiness_invalid/);

  const reordered = JSON.stringify(Object.fromEntries(
    Object.entries(valid.envelope).reverse(),
  ));
  fs.writeFileSync(file, reordered, { mode: 0o600 });
  assert.throws(() => readGoogleWebReadiness(file, sha256(reordered),
    { now: valid.now, expectedSource: source }), /google_web_readiness_canonical/);
  fs.writeFileSync(file, valid.bytes);
  fs.chmodSync(file, 0o644);
  assert.throws(() => readGoogleWebReadiness(file, valid.evidenceDigest,
    { now: valid.now, expectedSource: source }), /google_web_readiness_file/);
});
