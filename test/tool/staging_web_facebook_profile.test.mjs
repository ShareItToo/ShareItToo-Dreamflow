import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  TARGET,
  bindGoogleWebConfig,
  profile,
  sealArtifact,
  sha256,
  stagingBootstrapFor,
  validateArtifact,
} from '../../tool/staging_web_contract.mjs';
import {
  FACEBOOK_WEB_PROFILE,
  bindFacebookWebReadiness,
  readFacebookWebReadiness,
  validateFacebookWebBinding,
} from '../../tool/staging_facebook_web_readiness.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = 'a'.repeat(40);
const version = '1.0.0+2026092905';
const runClock = new Date();
runClock.setUTCMilliseconds(0);

function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function isoAt(offsetMs) {
  return new Date(runClock.getTime() + offsetMs).toISOString().replace('.000Z', 'Z');
}

function config(overrides = {}) {
  return {
    projectId: 'synthetic-sit-fixture',
    messagingSenderId: '123456789012',
    appId: `1:123456789012:web:${'a'.repeat(32)}`,
    apiKey: ['AI', 'za', 'x'.repeat(35)].join(''),
    authDomain: 'synthetic-sit-fixture.firebaseapp.com',
    backendProjectId: 'synthetic-sit-fixture',
    authorizedOrigin: TARGET,
    ...overrides,
  };
}

function handoff({
  publicConfig = config(),
  top = {},
  readiness = {},
  observedAtUtc = isoAt(-60 * 60 * 1000),
  validUntilUtc = isoAt(60 * 60 * 1000),
} = {}) {
  const configurationSha256 = digest(JSON.stringify(publicConfig));
  const readinessValue = {
    schemaVersion: 1,
    provider: 'facebook',
    platform: 'web',
    origin: publicConfig.authorizedOrigin,
    backendFirebaseProjectId: publicConfig.backendProjectId,
    webAppConfigSha256: configurationSha256,
    callbackUrl: `https://${publicConfig.authDomain}/__/auth/handler`,
    firebaseProviderEnabled: true,
    metaAppMode: 'development',
    audience: 'app_roles_only',
    audienceVerified: true,
    providerReadbackSha256: digest('test-only external-readback-shaped bytes'),
    observedAtUtc,
    validUntilUtc,
    ...readiness,
  };
  const value = {
    schemaVersion: 1,
    kind: 'sit-facebook-web-release-readiness',
    evidenceClass: 'verified-external',
    syntheticFixture: false,
    configuration: publicConfig,
    configurationSha256,
    readiness: readinessValue,
    readinessSha256: digest(JSON.stringify(readinessValue)),
    ...top,
  };
  const bytes = JSON.stringify(value);
  return { value, bytes, evidenceDigest: digest(bytes) };
}

function binding(options = {}, now = runClock) {
  const h = handoff(options);
  return bindFacebookWebReadiness(h.value, h.evidenceDigest, { now });
}

function googleBinding(publicConfig = config()) {
  return bindGoogleWebConfig(publicConfig, digest(JSON.stringify(publicConfig)));
}

function temp(t) {
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sit-facebook-profile-')));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function makeArtifact(t, { googleWeb = null, facebookWeb = binding() } = {}) {
  const directory = temp(t);
  fs.mkdirSync(path.join(directory, 'web'));
  for (const [name, bytes] of Object.entries({
    'index.html': '<script src="flutter_bootstrap.js" async></script>',
    'main.dart.js': 'test-only compiled output',
    'manifest.json': '{}',
    'flutter_bootstrap.js': 'bootstrap();',
  })) {
    fs.writeFileSync(path.join(directory, 'web', name), bytes);
  }
  const hash = sealArtifact({
    directory,
    source,
    version,
    flutterVersion: { frameworkVersion: 'test-only' },
    builderDigest: 'b'.repeat(64),
    googleWeb,
    facebookWeb,
  });
  return { directory, hash };
}

function rewriteManifest(directory, mutate) {
  const file = path.join(directory, 'staging-web-manifest.json');
  const value = JSON.parse(fs.readFileSync(file));
  mutate(value);
  fs.writeFileSync(file, JSON.stringify(value));
  return sha256(fs.readFileSync(file));
}

test('Facebook profile is optional and exact verified-external evidence is fully bound', () => {
  const off = profile(source, version);
  assert.equal(off.SIT_SOCIAL_FACEBOOK_ENABLED, 'false');
  assert.equal(off.SIT_SOCIAL_PROVIDER_ACTIVATION_VALIDATED, 'false');
  assert.ok(Object.keys(off).every((key) => !key.startsWith('SIT_FACEBOOK_WEB_')));

  const facebookWeb = binding();
  const enabled = profile(source, version, null, facebookWeb);
  assert.equal(enabled.SIT_SOCIAL_GOOGLE_ENABLED, 'false');
  assert.equal(enabled.SIT_SOCIAL_APPLE_ENABLED, 'false');
  assert.equal(enabled.SIT_SOCIAL_FACEBOOK_ENABLED, 'true');
  assert.equal(enabled.SIT_SOCIAL_PROVIDER_ACTIVATION_VALIDATED, 'true');
  assert.equal(enabled.SIT_FACEBOOK_WEB_CONFIG_SHA256, facebookWeb.configDigest);
  assert.equal(enabled.SIT_FACEBOOK_WEB_READINESS_JSON, facebookWeb.readinessJson);
  assert.equal(enabled.SIT_FACEBOOK_WEB_READINESS_SHA256, facebookWeb.readinessDigest);
  for (const [key, suffix] of Object.entries({
    projectId: 'PROJECT_ID',
    messagingSenderId: 'SENDER_ID',
    appId: 'APP_ID',
    apiKey: 'API_KEY',
    authDomain: 'AUTH_DOMAIN',
    backendProjectId: 'BACKEND_PROJECT_ID',
    authorizedOrigin: 'ORIGIN',
  })) {
    assert.equal(enabled[`SIT_FACEBOOK_WEB_${suffix}`], facebookWeb.config[key]);
  }
  assert.deepEqual(validateFacebookWebBinding(facebookWeb), facebookWeb);
});

test('Google plus Facebook requires one exact Firebase Web app identity', () => {
  const facebookWeb = binding();
  const both = profile(source, version, googleBinding(), facebookWeb);
  assert.equal(both.SIT_SOCIAL_GOOGLE_ENABLED, 'true');
  assert.equal(both.SIT_SOCIAL_FACEBOOK_ENABLED, 'true');

  const variants = [
    { appId: `1:123456789012:web:${'b'.repeat(32)}` },
    { apiKey: ['AI', 'za', 'y'.repeat(35)].join('') },
    {
      projectId: 'foreign-sit-fixture',
      authDomain: 'foreign-sit-fixture.firebaseapp.com',
      backendProjectId: 'foreign-sit-fixture',
    },
    { messagingSenderId: '234567890123', appId: `1:234567890123:web:${'a'.repeat(32)}` },
    { authDomain: 'foreign-sit-fixture.firebaseapp.com' },
  ];
  for (const override of variants) {
    const candidate = { ...config(), ...override };
    if (candidate.projectId !== 'synthetic-sit-fixture') {
      candidate.authDomain = `${candidate.projectId}.firebaseapp.com`;
      candidate.backendProjectId = candidate.projectId;
    }
    if (override.authDomain && candidate.projectId === 'synthetic-sit-fixture') {
      assert.throws(() => googleBinding(candidate), /google_web_config_invalid/);
      continue;
    }
    assert.throws(() => profile(source, version, googleBinding(candidate), facebookWeb),
      /facebook_google_web_app_mismatch/);
  }
});

test('synthetic, stale, missing and contradictory readiness is rejected even when rehashed', () => {
  const cases = [
    { options: { top: { syntheticFixture: true } }, code: /facebook_web_evidence_class/ },
    { options: { top: { evidenceClass: 'synthetic' } }, code: /facebook_web_evidence_class/ },
    { options: { readiness: { firebaseProviderEnabled: false } }, code: /facebook_web_readiness_invalid/ },
    { options: { readiness: { audienceVerified: false } }, code: /facebook_web_readiness_invalid/ },
    { options: { readiness: { callbackUrl: 'https://foreign.invalid/__/auth/handler' } }, code: /facebook_web_readiness_invalid/ },
    { options: { readiness: { metaAppMode: 'live' } }, code: /facebook_web_readiness_invalid/ },
    { options: { top: { extra: true } }, code: /facebook_web_readiness_shape/ },
  ];
  for (const { options, code } of cases) {
    const h = handoff(options);
    assert.throws(() => bindFacebookWebReadiness(h.value, h.evidenceDigest, { now: runClock }), code);
  }
  const missing = handoff();
  delete missing.value.readiness.audience;
  missing.value.readinessSha256 = digest(JSON.stringify(missing.value.readiness));
  assert.throws(() => bindFacebookWebReadiness(
    missing.value,
    digest(JSON.stringify(missing.value)),
    { now: runClock },
  ), /facebook_web_readiness_shape/);
  const expired = handoff({
    observedAtUtc: isoAt(-2 * 60 * 60 * 1000),
    validUntilUtc: isoAt(-60 * 60 * 1000),
  });
  assert.throws(() => bindFacebookWebReadiness(expired.value, expired.evidenceDigest,
    { now: runClock }), /facebook_web_readiness_invalid/);

  const overlong = handoff({
    observedAtUtc: isoAt(-60 * 60 * 1000),
    validUntilUtc: isoAt(2 * 60 * 60 * 1000),
  });
  assert.throws(() => bindFacebookWebReadiness(overlong.value, overlong.evidenceDigest,
    { now: runClock }), /facebook_web_readiness_invalid/);

  const tooOld = handoff({
    observedAtUtc: isoAt(-(2 * 60 * 60 * 1000 + 1000)),
    validUntilUtc: isoAt(-1000),
  });
  assert.throws(() => bindFacebookWebReadiness(tooOld.value, tooOld.evidenceDigest,
    { now: runClock }), /facebook_web_readiness_invalid/);
});

test('strict readiness reader requires canonical owner-only stable bytes and exact digest', (t) => {
  const root = temp(t);
  const h = handoff();
  const file = path.join(root, 'facebook-readiness.json');
  fs.writeFileSync(file, h.bytes, { mode: 0o600 });
  assert.deepEqual(readFacebookWebReadiness(file, h.evidenceDigest, { now: runClock }), binding());
  assert.throws(() => readFacebookWebReadiness(file, 'b'.repeat(64), { now: runClock }),
    /facebook_web_evidence_digest_mismatch/);

  fs.chmodSync(file, 0o644);
  assert.throws(() => readFacebookWebReadiness(file, h.evidenceDigest, { now: runClock }),
    /facebook_web_readiness_file/);
  fs.chmodSync(file, 0o600);
  const alias = path.join(root, 'alias.json');
  fs.symlinkSync(file, alias);
  assert.throws(() => readFacebookWebReadiness(alias, h.evidenceDigest, { now: runClock }),
    /facebook_web_readiness_file/);
  fs.unlinkSync(alias);
  const hardlink = path.join(root, 'hardlink.json');
  fs.linkSync(file, hardlink);
  assert.throws(() => readFacebookWebReadiness(file, h.evidenceDigest, { now: runClock }),
    /facebook_web_readiness_file/);
  fs.unlinkSync(hardlink);

  const noncanonical = `${h.bytes}\n`;
  fs.writeFileSync(file, noncanonical, { mode: 0o600 });
  assert.throws(() => readFacebookWebReadiness(file, digest(noncanonical), { now: runClock }),
    /facebook_web_readiness_canonical/);
  fs.writeFileSync(file, '{not-json', { mode: 0o600 });
  assert.throws(() => readFacebookWebReadiness(file, digest('{not-json'), { now: runClock }),
    /facebook_web_readiness_json/);

  fs.writeFileSync(file, h.bytes, { mode: 0o600 });
  fs.chmodSync(root, 0o755);
  assert.throws(() => readFacebookWebReadiness(file, h.evidenceDigest, { now: runClock }),
    /facebook_web_readiness_parent/);
  fs.chmodSync(root, 0o700);
});

test('reader rejects path replacement during its descriptor-bound read', (t) => {
  const root = temp(t);
  const h = handoff();
  const file = path.join(root, 'facebook-readiness.json');
  fs.writeFileSync(file, h.bytes, { mode: 0o600 });
  const originalRead = fs.readSync;
  let changed = false;
  t.mock.method(fs, 'readSync', (target, ...args) => {
    const bytes = originalRead(target, ...args);
    if (typeof target === 'number' && !changed) {
      changed = true;
      fs.renameSync(file, path.join(root, 'original.json'));
      fs.writeFileSync(file, h.bytes, { mode: 0o600 });
    }
    return bytes;
  });
  assert.throws(() => readFacebookWebReadiness(file, h.evidenceDigest, { now: runClock }),
    /facebook_web_readiness_changed/);
  assert.equal(changed, true);
});

test('reader rejects parent replacement during its descriptor-bound read', (t) => {
  const outer = temp(t);
  const parent = path.join(outer, 'evidence');
  const displaced = path.join(outer, 'evidence-original');
  fs.mkdirSync(parent, { mode: 0o700 });
  const h = handoff();
  const file = path.join(parent, 'facebook-readiness.json');
  fs.writeFileSync(file, h.bytes, { mode: 0o600 });
  const originalRead = fs.readSync;
  let changed = false;
  t.mock.method(fs, 'readSync', (target, ...args) => {
    const bytes = originalRead(target, ...args);
    if (typeof target === 'number' && !changed) {
      changed = true;
      fs.renameSync(parent, displaced);
      fs.symlinkSync(displaced, parent, 'dir');
    }
    return bytes;
  });
  assert.throws(() => readFacebookWebReadiness(file, h.evidenceDigest, { now: runClock }),
    /facebook_web_readiness_changed/);
  assert.equal(changed, true);
});

for (const replacement of ['parent', 'file']) {
  test(`reader rejects ${replacement} identity replacement immediately after open without reading`, (t) => {
    const outer = temp(t); const parent = path.join(outer, 'evidence');
    fs.mkdirSync(parent, { mode: 0o700 });
    const file = path.join(parent, 'facebook-readiness.json'); const h = handoff();
    fs.writeFileSync(file, h.bytes, { mode: 0o600 });
    const open = fs.openSync; let replaced = false; let reads = 0;
    t.mock.method(fs, 'openSync', (target, ...args) => {
      const fd = open(target, ...args);
      if (!replaced && target === (replacement === 'parent' ? parent : file)) {
        replaced = true;
        if (replacement === 'parent') {
          fs.renameSync(parent, path.join(outer, 'original'));
          fs.mkdirSync(parent, { mode: 0o700 });
        } else fs.renameSync(file, path.join(parent, 'original.json'));
        fs.writeFileSync(file, h.bytes, { mode: 0o600 });
      }
      return fd;
    });
    t.mock.method(fs, 'readSync', () => { reads += 1; throw new Error('unexpected read'); });
    assert.throws(() => readFacebookWebReadiness(file, h.evidenceDigest, { now: runClock }),
      { message: replacement === 'parent' ? 'facebook_web_readiness_parent' : 'facebook_web_readiness_changed' });
    assert.equal(replaced, true); assert.equal(reads, 0);
  });
}

for (const mutation of ['growth', 'truncate', 'same-size-content', 'file-mode', 'parent-mode', 'hardlink']) {
  test(`reader rejects ${mutation} during bounded descriptor read`, (t) => {
    const root = temp(t); const file = path.join(root, 'facebook-readiness.json'); const h = handoff();
    fs.writeFileSync(file, h.bytes, { mode: 0o600 });
    const read = fs.readSync; let changed = false; let totalRead = 0; const requested = [];
    t.mock.method(fs, 'readSync', (fd, buffer, offset, length, position) => {
      requested.push({ allocation: buffer.length, length });
      if (!changed) {
        changed = true;
        if (mutation === 'growth') fs.appendFileSync(file, Buffer.alloc(32768));
        if (mutation === 'truncate') fs.truncateSync(file, 1);
        if (mutation === 'same-size-content') fs.writeFileSync(file, h.bytes.replace('facebook', 'faceboox'));
        if (mutation === 'file-mode') fs.chmodSync(file, 0o644);
        if (mutation === 'parent-mode') fs.chmodSync(root, 0o755);
        if (mutation === 'hardlink') fs.linkSync(file, path.join(root, 'linked'));
      }
      const count = read(fd, buffer, offset, length, position); totalRead += count; return count;
    });
    assert.throws(() => readFacebookWebReadiness(file, h.evidenceDigest, { now: runClock }),
      { message: 'facebook_web_readiness_changed' });
    assert.equal(changed, true);
    assert.ok(requested.every(({ allocation, length }) => allocation <= Buffer.byteLength(h.bytes) && length <= allocation));
    assert.ok(totalRead <= Buffer.byteLength(h.bytes) + 1);
  });
}

test('reader accepts short descriptor reads without reopening or returning partial content', (t) => {
  const root = temp(t); const file = path.join(root, 'facebook-readiness.json'); const h = handoff();
  fs.writeFileSync(file, h.bytes, { mode: 0o600 });
  const read = fs.readSync; const descriptors = [];
  t.mock.method(fs, 'readSync', (fd, buffer, offset, length, position) => {
    descriptors.push(fd); return read(fd, buffer, offset, Math.min(length, 7), position);
  });
  assert.deepEqual(readFacebookWebReadiness(file, h.evidenceDigest, { now: runClock }), binding());
  assert.ok(descriptors.length > 2); assert.equal(new Set(descriptors).size, 1);
});

for (const operation of ['openSync', 'readSync', 'closeSync']) {
  test(`reader sanitizes ${operation} failures and closes every acquired descriptor`, (t) => {
    const root = temp(t); const file = path.join(root, 'facebook-readiness.json'); const h = handoff();
    fs.writeFileSync(file, h.bytes, { mode: 0o600 });
    const open = fs.openSync; const close = fs.closeSync; const opened = []; const closed = [];
    t.mock.method(fs, 'openSync', (...args) => {
      if (operation === 'openSync') throw new Error('facebook_web_private /private/synthetic/path');
      const fd = open(...args); opened.push(fd); return fd;
    });
    t.mock.method(fs, 'closeSync', (fd) => {
      close(fd); closed.push(fd);
      if (operation === 'closeSync') throw new Error('facebook_web_private /private/synthetic/path');
    });
    if (operation === 'readSync') t.mock.method(fs, 'readSync', () => { throw new Error('facebook_web_private /private/synthetic/path'); });
    assert.throws(() => readFacebookWebReadiness(file, h.evidenceDigest, { now: runClock }),
      { message: 'facebook_web_readiness_file' });
    assert.deepEqual(closed.toSorted(), opened.toSorted());
  });
}

test('schema v3 artifact binds profile, readiness and evidence through release identity', (t) => {
  const facebookWeb = binding();
  const f = makeArtifact(t, { facebookWeb });
  const manifest = validateArtifact(f.directory, f.hash, source);
  assert.equal(manifest.schemaVersion, 3);
  assert.equal(manifest.profileContractVersion, FACEBOOK_WEB_PROFILE);
  assert.equal(manifest.facebookWebConfigDigest, facebookWeb.configDigest);
  assert.equal(manifest.facebookWebReadinessDigest, facebookWeb.readinessDigest);
  assert.equal(manifest.facebookWebEvidenceDigest, facebookWeb.evidenceDigest);
  assert.equal(manifest.facebookWebValidatedAtUtc, facebookWeb.validatedAtUtc);
  assert.equal(Object.hasOwn(manifest, 'googleWebConfigDigest'), false);
  const release = JSON.parse(fs.readFileSync(path.join(f.directory, 'web/staging-release.json')));
  assert.equal(release.profileDigest, sha256(JSON.stringify(manifest.profile)));
  assert.equal(fs.readFileSync(path.join(f.directory, 'web/staging_bootstrap.js'), 'utf8'),
    stagingBootstrapFor(source, version, null, facebookWeb));

  const both = makeArtifact(t, { googleWeb: googleBinding(), facebookWeb });
  const bothManifest = validateArtifact(both.directory, both.hash, source);
  assert.equal(bothManifest.schemaVersion, 3);
  assert.equal(bothManifest.googleWebConfigDigest, googleBinding().digest);
  assert.equal(bothManifest.profile.SIT_SOCIAL_GOOGLE_ENABLED, 'true');
  assert.equal(bothManifest.profile.SIT_SOCIAL_FACEBOOK_ENABLED, 'true');
});

test('artifact sealing rechecks freshness before changing Web bytes', (t) => {
  const expiredHandoff = handoff({
    observedAtUtc: isoAt(-3 * 60 * 60 * 1000),
    validUntilUtc: isoAt(-2 * 60 * 60 * 1000),
  });
  const previouslyValid = bindFacebookWebReadiness(
    expiredHandoff.value,
    expiredHandoff.evidenceDigest,
    { now: new Date(runClock.getTime() - 150 * 60 * 1000) },
  );
  const directory = temp(t);
  fs.mkdirSync(path.join(directory, 'web'));
  const index = path.join(directory, 'web/index.html');
  fs.writeFileSync(index, '<script src="flutter_bootstrap.js" async></script>');
  assert.throws(() => sealArtifact({
    directory,
    source,
    version,
    flutterVersion: { frameworkVersion: 'test-only' },
    builderDigest: 'b'.repeat(64),
    facebookWeb: previouslyValid,
  }), /facebook_web_readiness_invalid/);
  assert.equal(fs.readFileSync(index, 'utf8'), '<script src="flutter_bootstrap.js" async></script>');
  assert.deepEqual(fs.readdirSync(directory), ['web']);
});

for (const variant of [
  'facebookOff',
  'readinessJson',
  'configDigest',
  'readinessDigest',
  'evidenceDigest',
  'validatedAt',
  'contractVersion',
  'schemaDowngrade',
  'extraProviderMetadata',
  'contradictorySyntheticMarker',
  'googleWithoutBinding',
]) {
  test(`rehashed v3 manifest cannot weaken Facebook evidence: ${variant}`, (t) => {
    const f = makeArtifact(t);
    const hash = rewriteManifest(f.directory, (manifest) => {
      if (variant === 'facebookOff') manifest.profile.SIT_SOCIAL_FACEBOOK_ENABLED = 'false';
      if (variant === 'readinessJson') manifest.profile.SIT_FACEBOOK_WEB_READINESS_JSON = '{}';
      if (variant === 'configDigest') manifest.facebookWebConfigDigest = 'b'.repeat(64);
      if (variant === 'readinessDigest') manifest.facebookWebReadinessDigest = 'b'.repeat(64);
      if (variant === 'evidenceDigest') manifest.facebookWebEvidenceDigest = 'b'.repeat(64);
      if (variant === 'validatedAt') manifest.facebookWebValidatedAtUtc = '2020-01-01T00:00:00Z';
      if (variant === 'contractVersion') manifest.profileContractVersion = 'future';
      if (variant === 'schemaDowngrade') manifest.schemaVersion = 2;
      if (variant === 'extraProviderMetadata') manifest.googleWebConfigDigest = 'b'.repeat(64);
      if (variant === 'contradictorySyntheticMarker') manifest.syntheticFixture = true;
      if (variant === 'googleWithoutBinding') manifest.profile.SIT_SOCIAL_GOOGLE_ENABLED = 'true';
    });
    assert.throws(() => validateArtifact(f.directory, hash, source));
  });
}

test('actual builder consumes one protected Facebook handoff and seals no synthetic/live claim', (t) => {
  const root = temp(t);
  const checkout = path.join(root, 'source');
  const bin = path.join(root, 'bin');
  fs.mkdirSync(checkout);
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(checkout, 'pubspec.yaml'), `version: ${version}\n`);
  fs.writeFileSync(path.join(checkout, '.gitignore'), 'build/\n');
  const git = (...args) => execFileSync('git', ['-C', checkout, ...args], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  git('init');
  git('add', '.');
  git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'fixture');
  const exactSource = git('rev-parse', 'HEAD');
  const definitionsLog = path.join(root, 'definition-path');
  const program = `#!${process.execPath}\nimport fs from 'node:fs';import path from 'node:path';
const name=path.basename(process.argv[1]);
if(name==='flutter')console.log(JSON.stringify({frameworkVersion:'test-only',frameworkRevision:'test-only',dartSdkVersion:'test-only'}));
if(name==='bash'){
const file=process.argv.find(x=>x.startsWith('--dart-define-from-file=')).split('=')[1];
const value=JSON.parse(fs.readFileSync(file));
if((fs.statSync(file).mode&511)!==384||value.SIT_SOCIAL_FACEBOOK_ENABLED!=='true'||value.SIT_SOCIAL_PROVIDER_ACTIVATION_VALIDATED!=='true'||value.SIT_SOCIAL_GOOGLE_ENABLED!=='false')process.exit(3);
fs.writeFileSync(process.env.SIT_TEST_DEFINES_LOG,file);fs.mkdirSync('build/web',{recursive:true});
for(const [entry,text] of Object.entries({'index.html':'<script src="flutter_bootstrap.js" async></script>','main.dart.js':'test-only compiled','manifest.json':'{}','flutter_bootstrap.js':'bootstrap();'}))fs.writeFileSync(path.join('build/web',entry),text);
}\n`;
  for (const name of ['flutter', 'bash', 'python3']) {
    fs.writeFileSync(path.join(bin, name), program, { mode: 0o755 });
  }
  fs.writeFileSync(path.join(bin, 'package.json'), '{"type":"module"}');
  const h = handoff();
  const evidence = path.join(root, 'facebook-readiness.json');
  fs.writeFileSync(evidence, h.bytes, { mode: 0o600 });
  const output = path.join(root, 'artifact');
  const args = [
    path.join(repo, 'tool/build_staging_web.mjs'),
    checkout,
    exactSource,
    output,
    '--facebook-web-readiness',
    evidence,
    h.evidenceDigest,
  ];
  const result = spawnSync(process.execPath, args, {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      SIT_TEST_DEFINES_LOG: definitionsLog,
    },
  });
  assert.equal(result.status, 0, result.stderr);
  const summary = JSON.parse(result.stdout.trim());
  const manifest = validateArtifact(output, summary.manifestHash, exactSource);
  assert.equal(manifest.schemaVersion, 3);
  assert.equal(manifest.facebookWebEvidenceDigest, h.evidenceDigest);
  assert.equal(manifest.profile.SIT_SOCIAL_FACEBOOK_ENABLED, 'true');
  assert.equal(fs.existsSync(fs.readFileSync(definitionsLog, 'utf8')), false);
  for (const privateInput of [config().apiKey, config().projectId, h.bytes]) {
    assert.ok(!`${result.stdout}${result.stderr}`.includes(privateInput));
  }

  const synthetic = handoff({ top: { syntheticFixture: true } });
  const rejectedFile = path.join(root, 'synthetic-readiness.json');
  fs.writeFileSync(rejectedFile, synthetic.bytes, { mode: 0o600 });
  const rejectedOutput = path.join(root, 'rejected');
  const rejected = spawnSync(process.execPath, [
    path.join(repo, 'tool/build_staging_web.mjs'), checkout, exactSource, rejectedOutput,
    '--facebook-web-readiness', rejectedFile, synthetic.evidenceDigest,
  ], { encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } });
  assert.equal(rejected.status, 1);
  assert.match(rejected.stderr, /facebook_web_evidence_class/);
  assert.equal(fs.existsSync(rejectedOutput), false);
});
