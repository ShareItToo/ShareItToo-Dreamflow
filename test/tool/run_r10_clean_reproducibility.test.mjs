import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import path from 'node:path';
import { androidToolchain } from '../../tool/validate_android_toolchain.mjs';

import {
  assertSafeR10TempRoot,
  captureR10Toolchain,
  compareApkInventories,
  containsConservativeRawByteMarker,
  executeR10CleanReproducibility,
  knownD8MetadataNormalizedSha256,
  parseAaptBadging,
  parseAaptPermissions,
  resolveR10SourceBranch,
  selectFlutterRuntimePayloadEntries,
  assertR10StorageCapacity,
  r10StorageBudgetKiB,
  validateR10GeneratedFootprint,
} from '../../tool/run_r10_clean_reproducibility.mjs';

const technicalRegression = readFileSync(
  new URL('../../scripts/technical_regression_check.sh', import.meta.url),
  'utf8',
);

test('R10 budgets cold caches, output, both APK inventories and reserve before starting', async () => {
  const requiredKiB = Object.values(r10StorageBudgetKiB).reduce((sum, value) => sum + value, 0);
  assert.equal(requiredKiB, 24 * 1024 * 1024);
  const observation = await assertR10StorageCapacity('/isolated/temp', {
    inspect: async (directory, options) => {
      assert.equal(directory, '/isolated/temp');
      assert.deepEqual(options, { bigint: true });
      return { bavail: BigInt(requiredKiB), bsize: 1024n };
    },
  });
  assert.deepEqual(observation, { availableKiB: requiredKiB, requiredKiB });
  await assert.rejects(assertR10StorageCapacity('/isolated/temp', {
    inspect: async () => ({ bavail: BigInt(requiredKiB - 1), bsize: 1024n }),
  }), /r10_insufficient_temp_capacity/u);
});

test('R10 rejects the observed ten-GiB headroom before touching Git or creating a clone', async () => {
  await assert.rejects(executeR10CleanReproducibility({
    sourceRoot: '/nonexistent-r10-source-must-not-be-read',
    inspectStorage: async () => ({ bavail: 10n * 1024n * 1024n, bsize: 1024n }),
  }), /r10_insufficient_temp_capacity/u);
});

test('R10 storage probing fails closed on invalid or unavailable filesystem data', async () => {
  for (const value of [
    { bavail: -1n, bsize: 4096n },
    { bavail: 1n, bsize: 0n },
    { bavail: 1.5, bsize: 4096n },
    { bavail: 2n ** 64n, bsize: 4096n },
    {},
  ]) {
    await assert.rejects(assertR10StorageCapacity('/isolated/temp', {
      inspect: async () => value,
    }), /r10_invalid_temp_capacity/u);
  }
  await assert.rejects(executeR10CleanReproducibility({
    sourceRoot: '/nonexistent-r10-source-must-not-be-read',
    inspectStorage: async () => { throw new Error('synthetic-statfs-failure'); },
  }), /synthetic-statfs-failure/u);
});

function toolchainRunner(checkout, backendPnpm, calls) {
  return async (command, args, options) => {
    calls.push({ command, args, ...options });
    const stdout = command === 'flutter'
      ? JSON.stringify({ frameworkVersion: '3.41.7', dartSdkVersion: '3.11.5' })
      : command === 'node' ? 'v22.23.2'
        : command === 'pnpm'
          ? (options.cwd === path.join(checkout, 'backend') ? backendPnpm : '11.25.0')
          : command === 'java' ? '' : `Gradle ${androidToolchain.gradle}\n`;
    return { stdout, stderr: command === 'java' ? 'openjdk version "17.0.20"' : '' };
  };
}

test('R10 measures pnpm where the backend package-manager pin is defined', async () => {
  const checkout = path.resolve('/isolated/checkout');
  const calls = [];
  const env = Object.freeze({ CI: 'true' });
  const result = await captureR10Toolchain(checkout, env, {
    run: toolchainRunner(checkout, '11.16.0', calls),
  });
  assert.equal(result.pnpm, '11.16.0');
  assert.equal(calls.find(call => call.command === 'pnpm').cwd, path.join(checkout, 'backend'));
  for (const call of calls) {
    assert.equal(call.env, env);
    if (call.command !== 'pnpm') assert.equal(call.cwd, checkout);
  }
});

test('R10 still rejects a wrong backend pnpm version without relaxing the pin', async () => {
  const checkout = path.resolve('/isolated/checkout');
  await assert.rejects(captureR10Toolchain(checkout, {}, {
    run: toolchainRunner(checkout, '11.25.0', []),
  }), /r10_toolchain_identity_unexpected/u);
});

test('accepts only one bounded R10 directory directly under the temp root', () => {
  assert.equal(
    assertSafeR10TempRoot('/tmp/sit-r10-clean-reproducibility-abc123', '/tmp'),
    '/tmp/sit-r10-clean-reproducibility-abc123',
  );
  assert.throws(
    () => assertSafeR10TempRoot('/tmp', '/tmp'),
    /unsafe_r10_temp_root/u,
  );
  assert.throws(
    () => assertSafeR10TempRoot('/tmp/sit-r10-clean-reproducibility-a/nested', '/tmp'),
    /unsafe_r10_temp_root/u,
  );
});

test('uses a safe branch hint only for detached CI checkouts', () => {
  assert.equal(
    resolveR10SourceBranch('codex/master-workflow-20260808'),
    'codex/master-workflow-20260808',
  );
  assert.equal(
    resolveR10SourceBranch('', 'codex/master-workflow-20260808'),
    'codex/master-workflow-20260808',
  );
  assert.throws(
    () => resolveR10SourceBranch('', '../unsafe'),
    /r10_detached_source_branch_hint_missing/u,
  );
  assert.throws(
    () => resolveR10SourceBranch('main', 'codex/master-workflow-20260808'),
    /r10_source_branch_invalid/u,
  );
});

test('compiled-origin probes are conservative raw-byte diagnostics', () => {
  const payload = Buffer.from(
    'prefix-https://shareittoo.com/api/v1-suffix',
    'ascii',
  );
  assert.equal(
    containsConservativeRawByteMarker(payload, 'https://shareittoo.com/api/v1'),
    true,
  );
  assert.equal(
    containsConservativeRawByteMarker(payload, 'https://api.openai.com'),
    false,
  );
  assert.throws(
    () => containsConservativeRawByteMarker(payload, ''),
    /invalid_raw_byte_marker/u,
  );
});

test('parses the exact Android package and SDK identity', () => {
  assert.deepEqual(parseAaptBadging([
    "package: name='com.shareittoo.app' versionCode='2026082405' versionName='1.0.0' compileSdkVersion='35'",
    "sdkVersion:'24'",
    "targetSdkVersion:'35'",
    "application-debuggable",
  ].join('\n')), {
    applicationId: 'com.shareittoo.app',
    versionCode: '2026082405',
    versionName: '1.0.0',
    compileSdk: 35,
    minSdk: 24,
    targetSdk: 35,
    debuggable: true,
  });
});

test('normalizes and sorts the merged APK permission surface', () => {
  assert.deepEqual(parseAaptPermissions([
    'package: com.shareittoo.app',
    "uses-permission: name='android.permission.CAMERA'",
    "uses-permission: name='android.permission.READ_EXTERNAL_STORAGE' maxSdkVersion='32'",
    "uses-permission: name='android.permission.INTERNET'",
  ].join('\n')), [
    { name: 'android.permission.CAMERA', maxSdkVersion: null },
    { name: 'android.permission.INTERNET', maxSdkVersion: null },
    { name: 'android.permission.READ_EXTERNAL_STORAGE', maxSdkVersion: 32 },
  ]);
});

test('distinguishes byte identity, metadata-only drift and payload drift', () => {
  const first = {
    sha256: 'a'.repeat(64),
    entries: [
      { name: 'AndroidManifest.xml', sha256: '1'.repeat(64) },
      {
        name: 'classes.dex',
        sha256: '2'.repeat(64),
        normalizedKnownMetadataSha256: '9'.repeat(64),
      },
    ],
  };
  assert.deepEqual(compareApkInventories(first, structuredClone(first)), {
    classification: 'byte-identical',
    byteIdentical: true,
    extractedEntriesIdentical: true,
    knownEquivalent: true,
    differingEntries: [],
    knownD8MetadataOnlyEntries: [],
    unexplainedDifferingEntries: [],
  });

  const metadataOnly = structuredClone(first);
  metadataOnly.sha256 = 'b'.repeat(64);
  assert.deepEqual(compareApkInventories(first, metadataOnly), {
    classification: 'zip-container-or-signing-metadata-only',
    byteIdentical: false,
    extractedEntriesIdentical: true,
    knownEquivalent: true,
    differingEntries: [],
    knownD8MetadataOnlyEntries: [],
    unexplainedDifferingEntries: [],
  });

  const d8Metadata = structuredClone(metadataOnly);
  d8Metadata.entries[1].sha256 = '3'.repeat(64);
  assert.deepEqual(compareApkInventories(first, d8Metadata), {
    classification: 'd8-synthetic-checksum-metadata-only',
    byteIdentical: false,
    extractedEntriesIdentical: false,
    knownEquivalent: true,
    differingEntries: ['classes.dex'],
    knownD8MetadataOnlyEntries: ['classes.dex'],
    unexplainedDifferingEntries: [],
  });

  const changed = structuredClone(d8Metadata);
  changed.entries[1].normalizedKnownMetadataSha256 = '8'.repeat(64);
  assert.deepEqual(compareApkInventories(first, changed), {
    classification: 'unexplained-payload-drift',
    byteIdentical: false,
    extractedEntriesIdentical: false,
    knownEquivalent: false,
    differingEntries: ['classes.dex'],
    knownD8MetadataOnlyEntries: [],
    unexplainedDifferingEntries: ['classes.dex'],
  });
});

test('normalizes only the exact known DEX header and D8 checksum metadata', () => {
  const first = Buffer.alloc(128, 0x61);
  first.write('dex\n', 0, 'ascii');
  first.write('~~~{"Lexample;":"123456789"}', 48, 'ascii');
  const second = Buffer.from(first);
  second.fill(0x62, 8, 32);
  second.write('abcdef012', second.indexOf('123456789'), 'ascii');
  assert.equal(
    knownD8MetadataNormalizedSha256(first),
    knownD8MetadataNormalizedSha256(second),
  );

  second[40] = 0x63;
  assert.notEqual(
    knownD8MetadataNormalizedSha256(first),
    knownD8MetadataNormalizedSha256(second),
  );
  assert.throws(
    () => knownD8MetadataNormalizedSha256(Buffer.from('not-a-dex')),
    /r10_invalid_dex_entry/u,
  );
});

test('selects only the Flutter runtime payload for debug or AOT artifacts', () => {
  assert.deepEqual(selectFlutterRuntimePayloadEntries([
    'assets/flutter_assets/kernel_blob.bin',
    'classes.dex',
  ]), {
    format: 'debug-kernel-blob',
    entries: ['assets/flutter_assets/kernel_blob.bin'],
  });
  assert.deepEqual(selectFlutterRuntimePayloadEntries([
    'lib/arm64-v8a/libapp.so',
    'lib/armeabi-v7a/libapp.so',
    'assets/flutter_assets/kernel_blob.bin',
  ]), {
    format: 'aot-libapp',
    entries: ['lib/arm64-v8a/libapp.so', 'lib/armeabi-v7a/libapp.so'],
  });
  assert.throws(
    () => selectFlutterRuntimePayloadEntries(['classes.dex']),
    /r10_flutter_runtime_payload_missing/u,
  );
});

test('bounds project output separately from intentionally fresh package caches', () => {
  assert.deepEqual(validateR10GeneratedFootprint({
    projectGeneratedKiB: 4 * 1024 * 1024,
    isolatedPackageCachesKiB: 6 * 1024 * 1024,
    totalKiB: 10 * 1024 * 1024,
  }), {
    maximumProjectGeneratedKiB: 5 * 1024 * 1024,
    maximumIsolatedPackageCachesKiB: 8 * 1024 * 1024,
    withinBounds: true,
  });
  assert.deepEqual(validateR10GeneratedFootprint({
    projectGeneratedKiB: 4_000,
    isolatedPackageCachesKiB: 3_000,
    totalKiB: 7_000,
  }, {
    maximumProjectGeneratedKiB: 5_000,
    maximumIsolatedPackageCachesKiB: 5_000,
  }), {
    maximumProjectGeneratedKiB: 5_000,
    maximumIsolatedPackageCachesKiB: 5_000,
    withinBounds: true,
  });
  assert.throws(() => validateR10GeneratedFootprint({
    projectGeneratedKiB: 5_001,
    isolatedPackageCachesKiB: 1,
    totalKiB: 5_002,
  }, {
    maximumProjectGeneratedKiB: 5_000,
    maximumIsolatedPackageCachesKiB: 5_000,
  }), /r10_project_generated_footprint_exceeds_bound/u);
  assert.throws(() => validateR10GeneratedFootprint({
    projectGeneratedKiB: 1,
    isolatedPackageCachesKiB: 5_001,
    totalKiB: 5_002,
  }, {
    maximumProjectGeneratedKiB: 5_000,
    maximumIsolatedPackageCachesKiB: 5_000,
  }), /r10_isolated_package_cache_exceeds_bound/u);
  assert.throws(() => validateR10GeneratedFootprint({
    projectGeneratedKiB: 1,
    isolatedPackageCachesKiB: 1,
    totalKiB: 3,
  }), /r10_generated_footprint_total_invalid/u);
});

test('the complete technical gate retains the R10 contract tests', () => {
  assert.match(
    technicalRegression,
    /node --check tool\/run_r10_clean_reproducibility\.mjs\nnode --test test\/tool\/run_r10_clean_reproducibility\.test\.mjs/u,
  );
});
