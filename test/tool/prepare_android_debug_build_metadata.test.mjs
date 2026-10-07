import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  parsePubspecBuildIdentity,
  prepareAndroidDebugBuildMetadata,
} from '../../tool/prepare_android_debug_build_metadata.mjs';

test('parses only the repository build identity shape', () => {
  assert.deepEqual(parsePubspecBuildIdentity('name: sit\nversion: 1.0.0+2026082302\n'), {
    versionName: '1.0.0',
    versionCode: '2026082302',
  });
  assert.throws(
    () => parsePubspecBuildIdentity('version: 1.0.0+1\n'),
    /android_debug_pubspec_identity_invalid/u,
  );
});

test('replaces stale generated version metadata from checked-in pubspec', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sit-debug-build-metadata-test-'));
  t.after(async () => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'android'), { recursive: true });
  await writeFile(path.join(root, 'pubspec.yaml'), 'version: 1.0.0+2026082302\n');
  await writeFile(path.join(root, 'android/local.properties'), [
    'sdk.dir=/old/sdk',
    'flutter.sdk=/old/flutter',
    'flutter.versionName=1.0',
    'flutter.versionCode=1',
    '',
  ].join('\n'));

  const result = await prepareAndroidDebugBuildMetadata({
    root,
    androidSdkRoot: '/verified/android sdk',
    flutterRoot: '/verified/flutter',
    env: {},
  });
  assert.deepEqual(result, {
    versionName: '1.0.0',
    versionCode: '2026082302',
    buildMode: 'debug',
    metadataPath: 'android/local.properties',
    toolPathsPrinted: false,
  });
  assert.equal(await readFile(path.join(root, 'android/local.properties'), 'utf8'), [
    'sdk.dir=/verified/android\\ sdk',
    'flutter.sdk=/verified/flutter',
    'flutter.buildMode=debug',
    'flutter.versionName=1.0.0',
    'flutter.versionCode=2026082302',
    '',
  ].join('\n'));
});

test('SDK selection has explicit process-local precedence over stale local metadata', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sit-debug-build-metadata-test-'));
  t.after(async () => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'android'), { recursive: true });
  await writeFile(path.join(root, 'pubspec.yaml'), 'version: 1.0.0+2026082302\n');
  const propertiesPath = path.join(root, 'android/local.properties');
  const cases = [
    { androidSdkRoot: '/explicit/sdk', env: { ANDROID_HOME: '/home/sdk', ANDROID_SDK_ROOT: '/env/sdk' }, expected: '/explicit/sdk' },
    { env: { ANDROID_HOME: '/home/sdk', ANDROID_SDK_ROOT: '/env/sdk' }, expected: '/home/sdk' },
    { env: { ANDROID_SDK_ROOT: '/env/sdk' }, expected: '/env/sdk' },
    { env: {}, expected: '/old/sdk' },
    { env: { ANDROID_HOME: '/selected/sdk', ANDROID_SDK_ROOT: '/selected/sdk' }, expected: '/selected/sdk' },
  ];
  for (const { expected, ...selection } of cases) {
    await writeFile(propertiesPath, 'sdk.dir=/old/sdk\nflutter.sdk=/old/flutter\n');
    const result = await prepareAndroidDebugBuildMetadata({
      root, flutterRoot: '/verified/flutter', ...selection,
    });
    const output = await readFile(propertiesPath, 'utf8');
    assert.equal(output.split('\n').find((line) => line.startsWith('sdk.dir=')), `sdk.dir=${expected}`);
    assert.equal(result.toolPathsPrinted, false);
    assert.equal(result.versionCode, '2026082302');
  }
});
