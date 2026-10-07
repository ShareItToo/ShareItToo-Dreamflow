import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { profile, sealArtifact, sha256, TARGET, validateArtifact } from '../../tool/staging_web_contract.mjs';
import { appleWebFields, appleWebEvidenceFields, bindAppleWebReadiness,
  readAppleWebReadiness } from '../../tool/staging_apple_web_readiness.mjs';
import { bindFacebookWebReadiness } from '../../tool/staging_facebook_web_readiness.mjs';
import { bindPasswordEnrollmentWebReadiness } from '../../tool/staging_password_enrollment_web_readiness.mjs';
import { syntheticAppleBinding, syntheticAppleEvidence } from './staging_apple_web_readiness_fixture.mjs';
import { syntheticGoogleBinding, syntheticGoogleConfig } from './staging_google_web_readiness_fixture.mjs';

const repo = fileURLToPath(new URL('../../', import.meta.url));
const source = 'a'.repeat(40);
const version = '1.0.0+2026092905';
const runClock = new Date(); runClock.setUTCMilliseconds(0);
const digest = sha256;
const isoAt = (offset) => new Date(runClock.getTime() + offset).toISOString().replace('.000Z', 'Z');
function temp(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sit-synthetic-apple-builder-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
function artifact(t, providers = {}, clock = runClock) {
  const root = temp(t);
  fs.mkdirSync(path.join(root, 'web'));
  for (const [file, value] of Object.entries({
    'index.html': '<script src="flutter_bootstrap.js" async></script>',
    'main.dart.js': 'synthetic compilation; NOT a live build',
    'manifest.json': '{}', 'flutter_bootstrap.js': 'synthetic();',
  })) fs.writeFileSync(path.join(root, 'web', file), value);
  const hash = sealArtifact({ directory: root, source, version,
    flutterVersion: { frameworkVersion: 'synthetic' }, builderDigest: sha256('synthetic-builder'),
    appleWeb: syntheticAppleBinding(source, { now: clock }), ...providers });
  return { root, hash };
}
function rewrite(root, mutate) {
  const file = path.join(root, 'staging-web-manifest.json');
  const manifest = JSON.parse(fs.readFileSync(file));
  mutate(manifest);
  fs.writeFileSync(file, JSON.stringify(manifest));
  const hash = sha256(fs.readFileSync(file));
  fs.writeFileSync(path.join(root, 'SHA256SUMS'), `${hash}  staging-web-manifest.json\n${Object.entries(manifest.files).map(([name, h]) => `${h}  web/${name}\n`).join('')}`);
  return hash;
}
function facebook() {
  const c = syntheticGoogleConfig();
  const r = { schemaVersion: 1, provider: 'facebook', platform: 'web', origin: TARGET,
    backendFirebaseProjectId: c.backendProjectId, webAppConfigSha256: sha256(JSON.stringify(c)),
    callbackUrl: `https://${c.authDomain}/__/auth/handler`, firebaseProviderEnabled: true,
    metaAppMode: 'development', audience: 'app_roles_only', audienceVerified: true,
    providerReadbackSha256: sha256('synthetic-facebook'), observedAtUtc: isoAt(-60_000),
    validUntilUtc: isoAt(3_600_000) };
  const e = { schemaVersion: 1, kind: 'sit-facebook-web-release-readiness',
    evidenceClass: 'verified-external', syntheticFixture: false, configuration: c,
    configurationSha256: sha256(JSON.stringify(c)), readiness: r, readinessSha256: sha256(JSON.stringify(r)) };
  return bindFacebookWebReadiness(e, sha256(JSON.stringify(e)), { now: runClock });
}
function readinessV2(overrides = {}) {
  return {
    sourceCommit: source,
    sourceVersion: version,
    targetEnvironment: 'staging-green',
    runtimeDeploymentEnvironment: 'test',
    apiBaseUrl: `${TARGET}/api/v1`,
    publicBaseUrl: `${TARGET}/api/v1`,
    appPublicUrl: TARGET,
    returnOrigin: TARGET,
    passwordEnrollmentEnabled: true,
    invitationCount: 2,
    invitationConfigurationSha256: digest('v2 invitation configuration'),
    invitationRegistrySha256: digest('v2 invitation registry'),
    accessGateEnabled: true,
    accessGateValid: true,
    allowedUserCount: 6,
    allowedUserIdsSha256: digest('v2 access allowed user ids'),
    invitationPrincipalMatchCount: 2,
    unmatchedInvitationPrincipalCount: 0,
    notificationAllowedUserCount: 4,
    notificationAllowedUserIdsSha256: digest('v2 notification allowed user ids'),
    invitationNotificationUserMatchCount: 2,
    unmatchedInvitationNotificationUserCount: 0,
    privatePilotEnabled: true,
    realPaymentsEnabled: false,
    mailTransport: 'smtp',
    mailerStatus: 'ok',
    recipientGateEnabled: true,
    allowedRecipientCount: 3,
    allowedRecipientEmailsSha256: digest('v2 allowed recipient emails'),
    invitationRecipientMatchCount: 2,
    unmatchedInvitationRecipientCount: 0,
    invitationRecipientBindingSha256: digest('v2 invitation recipient binding'),
    runtimeConfigurationSha256: digest('v2 runtime configuration'),
    smtpConfigurationSha256: digest('v2 smtp configuration'),
    runtimeReadbackSha256: digest('v2 runtime readback'),
    mailReadbackSha256: digest('v2 mail readback'),
    observedAtUtc: isoAt(-30 * 60 * 1000),
    validUntilUtc: isoAt(30 * 60 * 1000),
    ...overrides,
  };
}


function password() {
  const r = readinessV2();
  const e = { schemaVersion: 2, kind: 'sit-staging-password-enrollment-web-readiness',
    evidenceClass: 'verified-runtime', syntheticFixture: false,
    readiness: r, readinessSha256: sha256(JSON.stringify(r)) };
  return bindPasswordEnrollmentWebReadiness(e, sha256(JSON.stringify(e)),
    { now: runClock, expectedSource: source, expectedVersion: version });
}

test('default stays off; Apple defines bind exact current Direct-Web runtime shape and complete evidence', () => {
  const p0 = profile(source, version);
  assert.equal(p0.SIT_SOCIAL_APPLE_ENABLED, 'false');
  assert.equal(Object.keys(p0).some((key) => key.startsWith('SIT_APPLE_WEB_')), false);
  const a = syntheticAppleBinding(source, { now: runClock });
  const p = profile(source, version, null, null, null, a);
  assert.equal(a.configDigest, '36b2867689eb0afbb451b493d86f968009785172d3270213ac0987750a9dd788');
  assert.equal(p.SIT_SOCIAL_APPLE_ENABLED, 'true');
  assert.equal(p.SIT_SOCIAL_GOOGLE_ENABLED, 'false');
  assert.equal(p.SIT_SOCIAL_FACEBOOK_ENABLED, 'false');
  assert.equal(p.SIT_SOCIAL_PROVIDER_ACTIVATION_VALIDATED, 'true');
  for (const [key, define] of Object.entries(appleWebFields)) assert.equal(p[define], a.config[key]);
  for (const [key, define] of Object.entries(appleWebEvidenceFields)) assert.equal(p[define], a[key]);
  const dart = fs.readFileSync(path.join(repo, 'lib/services/web_apple_auth_config.dart'), 'utf8');
  const direct = dart.slice(0, dart.indexOf('class WebApplePublicConfig'));
  const keys = [...direct.split('const keys = {')[1].split('};')[0].matchAll(/'([A-Za-z0-9]+)'/gu)].map((m) => m[1]);
  assert.deepEqual(Object.keys(JSON.parse(a.readinessJson)), keys);
  const runtime = fs.readFileSync(path.join(repo, 'lib/services/firebase_runtime.dart'), 'utf8');
  for (const define of Object.values(appleWebFields)) assert.ok(runtime.includes(`'${define}'`));
});

for (let bits = 0; bits < 8; bits++) {
  test(`schema 7 real generated manifest composes Apple with provider mask ${bits}`, (t) => {
    const providers = {
      googleWeb: bits & 1 ? syntheticGoogleBinding(source, { now: runClock }) : null,
      facebookWeb: bits & 2 ? facebook() : null,
      passwordEnrollment: bits & 4 ? password() : null,
    };
    const a = artifact(t, providers);
    const m = validateArtifact(a.root, a.hash, source);
    assert.equal(m.schemaVersion, 7);
    assert.equal(m.profileContractVersion, 'staging-apple-web-v1');
    assert.deepEqual(m.profile, profile(source, version, providers.googleWeb,
      providers.facebookWeb, providers.passwordEnrollment, syntheticAppleBinding(source, { now: runClock })));
  });
}
test('co-enabled provider app mismatch rejects rather than borrowing readiness', () => {
  const apple = syntheticAppleBinding(source, { now: runClock,
    config: { appId: `1:123456789012:web:${'b'.repeat(32)}` } });
  for (const [g, f] of [[syntheticGoogleBinding(source, { now: runClock }), null], [null, facebook()]]) {
    assert.throws(() => profile(source, version, g, f, null, apple), /apple_web_app_mismatch/u);
  }
});

const negative = [
  { envelope: { syntheticFixture: true } },
  { envelope: { activationEligible: false } },
  { envelope: { evidenceClass: 'self-approved' } },
  { envelope: { decision: null } },
  { config: { authorizedOrigin: 'https://shareittoo.com' } },
  { config: { clientId: 'bad service id' } },
  { config: { redirectUri: 'https://foreign.invalid/callback' } },
  { config: { redirectUri: `${TARGET}/__/auth/handler?bad=1` } },
  { readiness: { platform: 'web' } },
  { readiness: { schemaVersion: 1 } },
  { readiness: { appleServicesIdSha256: sha256('foreign') } },
  { readiness: { firebaseAppleServicesIdSha256: sha256('foreign') } },
  { readiness: { firebaseAppleTeamIdSha256: sha256('foreign') } },
  { readiness: { firebaseAppleKeyIdSha256: sha256('foreign') } },
  { readiness: { backendAppleRedirectUriSha256: sha256('foreign') } },
  { readiness: { audience: 'new_accounts' } },
  { readiness: { observedAtUtc: isoAt(60_000) } },
  { readiness: { validUntilUtc: isoAt(3 * 3_600_000) } },
  { readiness: { validUntilUtc: isoAt(0) } },
  { readiness: { observedAtUtc: isoAt(-60_000).replace('Z', '.001Z') } },
  { backend: { syntheticFixture: true } },
  { backend: { runtimeCommit: '' } },
  { backend: { webAppId: 'foreign' } },
  { backend: { firebaseProjectId: 'foreign' } },
  { backend: { appleServicesIdSha256: sha256('foreign') } },
  { backend: { revocationSigningKeySource: 'environment' } },
  { backend: { revocationEncryptionKeySource: 'environment' } },
  { backend: { ownershipProtocolVersion: 1 } },
  { backend: { firebaseEmulatorEnabled: true } },
  { backend: { sourceCommit: 'b'.repeat(40) } },
  { decision: { decision: 'pending' } },
  { decision: { syntheticFixture: true } },
  { decision: { reviewerIdentitySha256: sha256('synthetic-collector') } },
  { decision: { configurationSha256: sha256('foreign') } },
  { decision: { readinessSha256: sha256('foreign') } },
  { decision: { backendSha256: sha256('foreign') } },
  { decision: { decidedAtUtc: isoAt(-120_000) } },
  { decision: { validUntilUtc: isoAt(3_600_001) } },
];
const good = syntheticAppleEvidence(source, { now: runClock });
for (const area of ['readiness', 'backend']) {
  for (const [key, value] of Object.entries(good.value[area])) {
    if (value === true) negative.push({ [area]: { [key]: false } });
    if (key.endsWith('Sha256')) negative.push({ [area]: { [key]: 'invalid' } });
  }
}
for (const [index, options] of negative.entries()) {
  test(`source/provider/backend/decision negative ${index}: ${JSON.stringify(options)}`, () => {
    const e = syntheticAppleEvidence(source, { now: runClock, ...options });
    assert.throws(() => bindAppleWebReadiness(e.value, e.digest,
      { now: runClock, expectedSource: source }), /apple_web_/u);
  });
}
test('all envelope/config/readiness/backend/decision fields mandatory; secrets and reordered fields refused', () => {
  for (const area of [null, 'configuration', 'readiness', 'backend', 'decision']) {
    const selected = area === null ? good.value : good.value[area];
    for (const key of Object.keys(selected)) {
      const v = structuredClone(good.value);
      delete (area === null ? v : v[area])[key];
      assert.throws(() => bindAppleWebReadiness(v, sha256(JSON.stringify(v))), /apple_web_readiness_shape/u);
    }
    const v = structuredClone(good.value);
    (area === null ? v : v[area]).unexpectedSecret = 'rejected';
    assert.throws(() => bindAppleWebReadiness(v, sha256(JSON.stringify(v))), /shape/u);
  }
  const reversed = Object.fromEntries(Object.entries(good.value).reverse());
  assert.throws(() => bindAppleWebReadiness(reversed, sha256(JSON.stringify(reversed))), /canonical/u);
});
test('protected external file enforces digest, owner modes, symlinks, hardlinks, bounded bytes and canonical JSON', (t) => {
  const root = temp(t); const dir = path.join(root, 'private'); fs.mkdirSync(dir, { mode: 0o700 });
  const file = path.join(dir, 'readiness.json');
  fs.writeFileSync(file, good.bytes, { mode: 0o600 });
  assert.deepEqual(readAppleWebReadiness(file, good.digest, { now: runClock, expectedSource: source }),
    syntheticAppleBinding(source, { now: runClock }));
  assert.throws(() => readAppleWebReadiness(file, 'b'.repeat(64)), /digest_mismatch/u);
  fs.chmodSync(file, 0o644); assert.throws(() => readAppleWebReadiness(file, good.digest), /readiness_file/u);
  fs.chmodSync(file, 0o600); fs.chmodSync(dir, 0o755);
  assert.throws(() => readAppleWebReadiness(file, good.digest), /readiness_parent/u);
  fs.chmodSync(dir, 0o700);
  const link = path.join(dir, 'link'); fs.symlinkSync(file, link);
  assert.throws(() => readAppleWebReadiness(link, good.digest), /readiness_file/u);
  const parentLink = path.join(root, 'alias'); fs.symlinkSync(dir, parentLink);
  assert.throws(() => readAppleWebReadiness(path.join(parentLink, 'readiness.json'), good.digest));
  const hard = path.join(dir, 'hard'); fs.linkSync(file, hard);
  assert.throws(() => readAppleWebReadiness(file, good.digest), /readiness_file/u); fs.unlinkSync(hard);
  for (const bytes of ['{private malformed', good.bytes + '\n', 'x'.repeat(33000), '{"duplicate":1,"duplicate":2}']) {
    fs.writeFileSync(file, bytes);
    assert.throws(() => readAppleWebReadiness(file, sha256(bytes)), /^Error: apple_web_/u);
  }
});
for (const field of ['appleWebConfigDigest', 'appleWebReadinessDigest', 'appleWebBackendDigest',
  'appleWebDecisionDigest', 'appleWebEvidenceDigest', 'appleWebValidatedAtUtc',
  ...Object.values(appleWebFields), ...Object.values(appleWebEvidenceFields)]) {
  test(`rehashing manifest cannot loosen Apple binding: ${field}`, (t) => {
    const a = artifact(t);
    const hash = rewrite(a.root, (m) => { (field.startsWith('SIT_') ? m.profile : m)[field] = ''; });
    assert.throws(() => validateArtifact(a.root, hash, source));
  });
}
test('historical schemas remain readable; Apple-bearing legacy candidates and stale successors fail closed', (t) => {
  const a = artifact(t);
  const legacy = rewrite(a.root, (m) => { m.schemaVersion = 6; });
  assert.throws(() => validateArtifact(a.root, legacy, source), /apple_web_legacy_candidate/u);
  const off = artifact(t, { appleWeb: null });
  assert.equal(validateArtifact(off.root, off.hash, source, { mode: 'current' }).schemaVersion, 1);
  assert.equal(validateArtifact(off.root, off.hash, source, { mode: 'rollback' }).schemaVersion, 1);
  const stale = syntheticAppleEvidence(source, { now: new Date(runClock.getTime() - 3 * 3_600_000) });
  const bound = bindAppleWebReadiness(stale.value, stale.digest, { now: stale.now, expectedSource: source });
  assert.throws(() => artifact(t, { appleWeb: bound }), /apple_web_.*time/u);
});

test('expired schema 7 retains historical current/rollback validation but cannot be a candidate', (t) => {
  const clock = new Date(runClock.getTime() - 3 * 3_600_000);
  const RealDate = Date;
  let a;
  try {
    globalThis.Date = class extends RealDate {
      constructor(...args) { super(...(args.length ? args : [clock.getTime()])); }
    };
    a = artifact(t, {}, clock);
  } finally { globalThis.Date = RealDate; }
  assert.equal(validateArtifact(a.root, a.hash, source, { mode: 'current' }).schemaVersion, 7);
  assert.equal(validateArtifact(a.root, a.hash, source, { mode: 'rollback' }).schemaVersion, 7);
  assert.throws(() => validateArtifact(a.root, a.hash, source), /apple_web_.*time/u);
});

test('protected read rejects a FIFO and same-path evidence mutation during descriptor read', (t) => {
  const root = temp(t);
  const fifo = path.join(root, 'fifo');
  execFileSync('mkfifo', [fifo]);
  assert.throws(() => readAppleWebReadiness(fifo, good.digest), /apple_web_readiness_file/u);
  const file = path.join(root, 'readiness.json');
  fs.writeFileSync(file, good.bytes, { mode: 0o600 });
  const original = fs.readSync;
  let changed = false;
  try {
    fs.readSync = (...args) => {
      const result = original(...args);
      if (!changed) { changed = true; fs.appendFileSync(file, '\n'); }
      return result;
    };
    assert.throws(() => readAppleWebReadiness(file, good.digest), /apple_web_readiness_changed/u);
  } finally { fs.readSync = original; }
});

test('actual builder CLI: protected Apple input, generated defines/manifest; denied input never invokes compiler', (t) => {
  const root = temp(t); const checkout = path.join(root, 'source'); const bin = path.join(root, 'bin');
  fs.mkdirSync(checkout); fs.mkdirSync(bin);
  fs.writeFileSync(path.join(checkout, 'pubspec.yaml'), `version: ${version}\n`);
  fs.writeFileSync(path.join(checkout, '.gitignore'), 'build/\n');
  const git = (...args) => execFileSync('git', ['-C', checkout, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init'); git('add', '.'); git('-c', 'user.name=Synthetic', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'synthetic fixture');
  const exactSource = git('rev-parse', 'HEAD');
  const definitionsLog = path.join(root, 'synthetic-defines.json');
  const compilerLog = path.join(root, 'synthetic-compiler-calls');
  // Production CLI + reader + profile + seal + validator; only external compiler/smoke
  // executables are synthetic. This test makes no real Flutter or live readiness claim.
  const program = `#!${process.execPath}


import fs from 'node:fs';import path from 'node:path';
const name=path.basename(process.argv[1]);
fs.appendFileSync(process.env.SIT_SYNTHETIC_COMPILER_LOG,name+'\\n');
if(name==='flutter')console.log(JSON.stringify({frameworkVersion:'synthetic',frameworkRevision:'fixture',dartSdkVersion:'fixture'}));
if(name==='bash'){
const file=process.argv.find(x=>x.startsWith('--dart-define-from-file=')).slice('--dart-define-from-file='.length);
if((fs.statSync(file).mode&511)!==384)process.exit(2);
const value=JSON.parse(fs.readFileSync(file));
if(value.SIT_SOCIAL_APPLE_ENABLED!=='true')process.exit(3);
fs.writeFileSync(process.env.SIT_SYNTHETIC_DEFINES_LOG,JSON.stringify({file,value}));
fs.mkdirSync('build/web',{recursive:true});
for(const [file,text] of Object.entries({'index.html':'<script src="flutter_bootstrap.js" async></script>','main.dart.js':'synthetic compiled; not live','manifest.json':'{}','flutter_bootstrap.js':'bootstrap();'}))fs.writeFileSync(path.join('build/web',file),text);
}
`;
  for (const name of ['flutter', 'bash', 'python3']) fs.writeFileSync(path.join(bin, name), program, { mode: 0o755 });
  fs.writeFileSync(path.join(bin, 'package.json'), '{"type":"module"}');
  const e = syntheticAppleEvidence(exactSource);
  const file = path.join(root, 'synthetic-apple-readiness.json');
  fs.writeFileSync(file, e.bytes, { mode: 0o600 });
  const output = path.join(root, 'artifact');
  const flags = ['--apple-web-readiness', file, e.digest];
  const run = (destination, args = flags) => spawnSync(process.execPath,
    [path.join(repo, 'tool/build_staging_web.mjs'), checkout, exactSource, destination, ...args], {
      encoding: 'utf8', timeout: 15000, env: { ...process.env, PATH: `${bin}:${process.env.PATH}`,
        SIT_SYNTHETIC_DEFINES_LOG: definitionsLog, SIT_SYNTHETIC_COMPILER_LOG: compilerLog },
    });
  const result = run(output);
  assert.equal(result.status, 0, result.stderr);
  const summary = JSON.parse(result.stdout.trim());
  const manifest = validateArtifact(output, summary.manifestHash, exactSource);
  assert.equal(manifest.schemaVersion, 7);
  const defs = JSON.parse(fs.readFileSync(definitionsLog));
  assert.deepEqual(defs.value, manifest.profile);
  assert.equal(fs.existsSync(defs.file), false);
  assert.equal(manifest.appleWebEvidenceDigest, e.digest);
  assert.equal(manifest.builderDigest, sha256(Buffer.concat([
    'build_staging_web.mjs', 'staging_web_contract.mjs', 'staging_google_web_readiness.mjs',
    'staging_apple_web_readiness.mjs', 'staging_facebook_web_readiness.mjs',
    'staging_password_enrollment_web_readiness.mjs',
  ].map((name) => fs.readFileSync(path.join(repo, 'tool', name))))));
  for (const [key, value] of Object.entries(e.value.configuration)) {
    if (key !== 'authorizedOrigin') assert.ok(!`${result.stdout}${result.stderr}`.includes(value));
  }
  const calls = fs.readFileSync(compilerLog, 'utf8');
  const denied = [
    ['--apple-web-readiness', file, 'b'.repeat(64)],
    ['--apple-web-readiness', file],
    [...flags, ...flags],
    ['--apple-web-readiness', path.join(checkout, 'forbidden.json'), e.digest],
  ];
  for (const [index, args] of denied.entries()) {
    const destination = path.join(root, `rejected-${index}`);
    const bad = run(destination, args);
    assert.equal(bad.status, 1);
    assert.equal(fs.existsSync(destination), false);
    assert.equal(fs.readFileSync(compilerLog, 'utf8'), calls);
  }
  for (const [index, options] of [
    { envelope: { syntheticFixture: true } },
    { decision: { decision: 'pending' } },
    { backend: { sourceCommit: 'b'.repeat(40) } },
    { now: new Date(Date.now() - 3 * 3_600_000) },
  ].entries()) {
    const badEvidence = syntheticAppleEvidence(exactSource, options);
    fs.writeFileSync(file, badEvidence.bytes);
    const destination = path.join(root, `rejected-evidence-${index}`);
    const bad = run(destination, ['--apple-web-readiness', file, badEvidence.digest]);
    assert.equal(bad.status, 1);
    assert.equal(fs.existsSync(destination), false);
    assert.equal(fs.readFileSync(compilerLog, 'utf8'), calls);
  }
});
