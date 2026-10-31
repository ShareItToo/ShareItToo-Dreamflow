import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import * as guard from '../../tool/run_with_local_build_cache.mjs';

const cacheProfile = {
  version: 1, mountPoint: '/Volumes/SIT-Build-fixture',
  cacheDirectory: '/Volumes/SIT-Build-fixture/gradle',
  backingDirectory: '/Volumes/External/SIT-build-fixture',
  imagePath: '/Volumes/External/SIT-build-fixture/SIT-Build.sparsebundle',
};
const scopedProfile = {
  ...cacheProfile, version: 2,
  androidSdkDirectory: '/Volumes/SIT-Build-fixture/scoped-sdk/sdk',
  flutterConfigDirectory: '/Users/fixture/private-flutter-config',
};

test('v2 carries both scoped paths while v1 stays an unchanged cache-only profile', () => {
  assert.deepEqual(guard.parseBuildCacheProfile(cacheProfile), cacheProfile);
  assert.deepEqual(guard.parseBuildCacheProfile(scopedProfile), scopedProfile);
  for (const change of [
    { version: 3 }, { flutterConfigDirectory: undefined },
    { androidSdkDirectory: '/Users/fixture/Library/Android/sdk' },
    { androidSdkDirectory: scopedProfile.mountPoint },
    { flutterConfigDirectory: scopedProfile.androidSdkDirectory },
    { flutterConfigDirectory: `${scopedProfile.cacheDirectory}/config` },
    { flutterConfigDirectory: 'relative' }, { command: 'not-profile-data' },
  ]) assert.throws(() => guard.parseBuildCacheProfile({ ...scopedProfile, ...change }));
});

function fixture(t) {
  const directory = realpathSync(mkdtempSync(path.join(tmpdir(), 'sit-scoped-sdk-test-')));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const sdk = path.join(directory, 'sdk');
  const config = path.join(directory, 'config');
  const home = path.join(directory, 'synthetic-home');
  for (const entry of [sdk, config, home]) mkdirSync(entry, { mode: 0o700 });
  const profile = { ...scopedProfile, androidSdkDirectory: sdk, flutterConfigDirectory: config };
  const env = { HOME: home, PATH: '/fixture/bin', KEEP_SETTING: 'preserved',
    ANDROID_HOME: '/wrong-sdk', ANDROID_SDK_ROOT: '/another-sdk', XDG_CONFIG_HOME: '/wrong-config' };
  const probe = (childEnv) => {
    assert.equal(childEnv.ANDROID_HOME, sdk);
    assert.equal(childEnv.ANDROID_SDK_ROOT, sdk);
    assert.equal(childEnv.XDG_CONFIG_HOME, config);
    assert.equal(childEnv.HOME, home);
    return JSON.stringify({ 'android-sdk': sdk });
  };
  return { directory, sdk, config, home, profile, env, probe };
}

test('complete scoped environment overrides stale inherited choices without changing the parent', (t) => {
  const f = fixture(t);
  const parent = { ...f.env };
  const prepared = guard.prepareBuildEnvironment(f.profile, f.env, f.probe);
  assert.deepEqual(f.env, parent);
  assert.equal(prepared.env.KEEP_SETTING, 'preserved');
  assert.equal(prepared.env.GRADLE_USER_HOME, f.profile.cacheDirectory);
  assert.equal(prepared.env.ANDROID_HOME, f.sdk);
  assert.equal(prepared.env.XDG_CONFIG_HOME, f.config);
  assert.equal(prepared.settingsDigest, null);
});

test('cache-only profile does not run Flutter or change Android settings', () => {
  const env = { ANDROID_HOME: '/unchanged', XDG_CONFIG_HOME: '/unchanged-config' };
  const result = guard.prepareBuildEnvironment(cacheProfile, env, () => assert.fail('unexpected probe'));
  assert.deepEqual(result.env, { ...env, GRADLE_USER_HOME: cacheProfile.cacheDirectory });
});

for (const [name, output] of [
  ['wrong SDK', '{"android-sdk":"/wrong"}'], ['missing SDK', '{}'],
  ['array', '[]'], ['null', 'null'], ['malformed output', 'not-json'],
]) test(`effective configuration rejects ${name}`, (t) => {
  const f = fixture(t);
  assert.throws(() => guard.prepareBuildEnvironment(f.profile, f.env, () => output));
});

test('failed or timed-out Flutter probe cannot fall back to environment variables', (t) => {
  const f = fixture(t);
  assert.throws(() => guard.prepareBuildEnvironment(f.profile, f.env, () => {
    throw new Error('synthetic process failure');
  }));
});

for (const kind of ['missing-config', 'linked-config', 'linked-sdk', 'public-config', 'public-sdk', 'legacy-file', 'legacy-link', 'global-xdg'])
  test(`${kind} is rejected before Flutter runs`, (t) => {
    const f = fixture(t);
    if (kind === 'missing-config') f.profile.flutterConfigDirectory = path.join(f.directory, 'missing');
    if (kind === 'linked-config' || kind === 'linked-sdk') {
      const link = path.join(f.directory, 'link');
      symlinkSync(kind === 'linked-config' ? f.config : f.sdk, link);
      f.profile[kind === 'linked-config' ? 'flutterConfigDirectory' : 'androidSdkDirectory'] = link;
    }
    if (kind === 'public-config') chmodSync(f.config, 0o755);
    if (kind === 'public-sdk') chmodSync(f.sdk, 0o755);
    if (kind === 'legacy-file') writeFileSync(path.join(f.home, '.flutter_settings'), '{}');
    if (kind === 'legacy-link') symlinkSync(path.join(f.directory, 'missing'), path.join(f.home, '.flutter_settings'));
    if (kind === 'global-xdg') f.profile.flutterConfigDirectory = f.home;
    let calls = 0;
    assert.throws(() => guard.prepareBuildEnvironment(f.profile, f.env, () => { calls++; return f.probe(f.env); }));
    assert.equal(calls, 0);
  });

for (const content of ['bad-json', '[]', 'null']) test(`invalid saved settings (${content}) never reach Flutter's auto-delete parser`, (t) => {
  const f = fixture(t);
  const settings = path.join(f.config, 'settings');
  writeFileSync(settings, content, { mode: 0o600 });
  let calls = 0;
  assert.throws(() => guard.prepareBuildEnvironment(f.profile, f.env, (env) => { calls++; return f.probe(env); }));
  assert.equal(calls, 0);
  assert.equal(readFileSync(settings, 'utf8'), content);
});

test('saved settings are fingerprinted and a probe-time change is rejected', (t) => {
  const f = fixture(t);
  const settings = path.join(f.config, 'settings');
  writeFileSync(settings, '{}', { mode: 0o600 });
  assert.match(guard.prepareBuildEnvironment(f.profile, f.env, f.probe).settingsDigest, /^[a-f0-9]{64}$/u);
  assert.throws(() => guard.prepareBuildEnvironment(f.profile, f.env, (env) => {
    writeFileSync(settings, '{"changed":true}');
    return f.probe(env);
  }));
});

test('orchestration checks scoped selection before dispatch and revalidates after the child', async (t) => {
  const f = fixture(t);
  const events = [];
  const observeCache = () => {
    events.push('cache');
    return { platform: 'darwin', directoriesAreReal: true, ownerOnly: true,
      filesystemType: 'apfs', cacheOnMountedDevice: true, backingOnSeparateDevice: true,
      imagePath: f.profile.imagePath, mountPoint: f.profile.mountPoint,
      cacheFreeKiB: guard.minimumCacheFreeKiB, backingFreeKiB: guard.minimumCacheFreeKiB };
  };
  const options = {
    environment: f.env, observeCache, probeConfig: (env) => { events.push('sdk'); return f.probe(env); },
    report: () => {},
    runChild: async (request, env) => { events.push('child'); assert.equal(env.ANDROID_HOME, f.sdk); return { code: 17, signal: null }; },
  };
  const request = { command: 'synthetic', args: ['literal; argument'] };
  const result = await guard.runBuildCacheCommand(f.profile, request, options);
  assert.equal(result, 17);
  assert.deepEqual(events, ['cache', 'sdk', 'child', 'cache', 'sdk']);
  events.length = 0;
  await assert.rejects(guard.runBuildCacheCommand(f.profile, request, { ...options, probeConfig: () => '{}' }));
  assert.deepEqual(events, ['cache']);
  await assert.rejects(guard.runBuildCacheCommand(f.profile, request, { ...options,
    runChild: async () => { writeFileSync(path.join(f.config, 'settings'), '{}'); return { code: 0, signal: null }; },
  }));
});

test('unsafe saved-setting links and writable files are never followed or read by Flutter', (t) => {
  const f = fixture(t);
  const target = path.join(f.directory, 'target');
  const settings = path.join(f.config, 'settings');
  writeFileSync(target, '{}', { mode: 0o600 });
  symlinkSync(target, settings);
  let calls = 0;
  assert.throws(() => guard.prepareBuildEnvironment(f.profile, f.env, (env) => { calls++; return f.probe(env); }));
  assert.equal(calls, 0);
  assert.equal(readFileSync(target, 'utf8'), '{}');
});

test('group-writable saved settings are rejected', (t) => {
  const f = fixture(t);
  const settings = path.join(f.config, 'settings');
  writeFileSync(settings, '{}', { mode: 0o600 });
  chmodSync(settings, 0o660);
  let calls = 0;
  assert.throws(() => guard.prepareBuildEnvironment(f.profile, f.env, (env) => { calls++; return f.probe(env); }));
  assert.equal(calls, 0);
});

test('post-child wrong effective SDK cannot turn a zero child result into success', async (t) => {
  const f = fixture(t);
  let completed = false;
  await assert.rejects(guard.runBuildCacheCommand(f.profile, { command: 'synthetic', args: [] }, {
    environment: f.env, report: () => {},
    observeCache: () => ({ platform: 'darwin', directoriesAreReal: true, ownerOnly: true,
      filesystemType: 'apfs', cacheOnMountedDevice: true, backingOnSeparateDevice: true,
      imagePath: f.profile.imagePath, mountPoint: f.profile.mountPoint,
      cacheFreeKiB: guard.minimumCacheFreeKiB, backingFreeKiB: guard.minimumCacheFreeKiB }),
    probeConfig: (env) => completed ? '{}' : f.probe(env),
    runChild: async () => { completed = true; return { code: 0, signal: null }; },
  }));
  assert.equal(completed, true);
});
